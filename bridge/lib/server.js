"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { contentType, guestName, hostUser, isInside, listIps, pickDisplayIp, readJsonBody } = require("./util.js");

/** 访客光标配色（网页端与名称一起展示） */
const CURSOR_COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c",
  "#0891b2", "#db2777", "#65a30d", "#7c3aed", "#0d9488",
];

/** 光标键：Map 里用 Symbol，广播时还原成客户端 id */
function cursorKey(cid) {
  const raw = typeof cid === "symbol" ? cid.description || "" : String(cid);
  return raw.startsWith("cursor:") ? raw.slice("cursor:".length) : raw || "cursor";
}

const MAX_TEXT_BYTES = 1024 * 1024;
const KEEP_ALIVE_MS = 25000;
// 光标闲置多久后不再广播给其他人（ Visitors 关页后 SSE 会在 KEEP_ALIVE 周期内被清理，这里兜底）
const CURSOR_TTL_MS = 15000;
// 光标上报节流：最多每这么多毫秒转发一次
const CURSOR_MIN_INTERVAL_MS = 40;
const INLINE_SAFE = new Set([
  "text/plain; charset=utf-8",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
  "image/svg+xml",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "video/mp4",
  "video/webm",
]);

/** 读取坐标：缺省或非法返回 null（注意 Number(null) === 0、Number(undefined) === NaN） */
function toCoord(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

/** 局域网 HTTP 服务：托管网页端界面，并提供共享桌面、上传、下载接口 */
class LanServer {
  /**
   * @param {{ store: import('./store.js').Store, rootDir: string, lanDir: string, onState?: () => void }} options
   */
  constructor({ store, rootDir, lanDir, onState }) {
    this.store = store;
    this.rootDir = rootDir;
    this.lanDir = lanDir;
    this.onState = typeof onState === "function" ? onState : () => {};
    this.server = null;
    this.clients = new Set();
    this.sockets = new Set();
    this.timer = null;
    // 在线访客光标：Symbol.for(cid) -> { cid, name, x, y, at, color }，同浏览器多标签页共享一个光标
    this.cursors = new Map();
    const { port, bindIp } = store.settings;
    this.status = { running: false, error: "", port, bindIp, url: "", host: "" };
  }

  get running() {
    return Boolean(this.server && this.server.listening);
  }

  currentUrl() {
    const { port, bindIp } = this.store.settings;
    return `http://${pickDisplayIp(bindIp)}:${port}`;
  }

  start() {
    if (this.running) {
      return Promise.resolve(this.snapshot());
    }
    const { port, bindIp } = this.store.settings;
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handle(req, res);
      });
      server.requestTimeout = 0;
      server.headersTimeout = 60000;
      server.keepAliveTimeout = 72000;
      server.on("connection", (socket) => {
        this.sockets.add(socket);
        socket.on("close", () => this.sockets.delete(socket));
      });
      server.on("error", (error) => {
        if (this.server === server) {
          this.server = null;
        }
        const message =
          error.code === "EADDRINUSE"
            ? `端口 ${port} 已被占用，请换一个端口`
            : error.code === "EADDRNOTAVAIL"
              ? `本机没有可用的地址 ${bindIp}`
              : error.code === "EACCES"
                ? `没有权限监听端口 ${port}`
                : error.message;
        this.status = { running: false, error: message, port, bindIp, url: "", host: "" };
        this.stopKeepAlive();
        this.onState();
        reject(new Error(message));
      });
      server.listen({ port, host: bindIp || "0.0.0.0" }, () => {
        this.server = server;
        const { port: listenPort } = server.address();
        this.status = {
          running: true,
          error: "",
          port: listenPort,
          bindIp,
          url: this.currentUrl(),
          host: os.hostname(),
        };
        this.startKeepAlive();
        this.onState();
        resolve(this.snapshot());
      });
    });
  }

  stop() {
    this.stopKeepAlive();
    for (const res of this.clients) {
      try {
        res.end();
      } catch {
        /* 连接可能已断开 */
      }
    }
    this.clients.clear();
    const server = this.server;
    this.server = null;
    const { port, bindIp } = this.store.settings;
    this.status = { running: false, error: "", port, bindIp, url: "", host: os.hostname() };
    this.onState();

    return new Promise((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
      for (const socket of this.sockets) {
        try {
          socket.destroy();
        } catch {
          /* 忽略 */
        }
      }
      this.sockets.clear();
    });
  }

  /** 服务重启（设置变更后调用） */
  async restart() {
    await this.stop();
    return this.start();
  }

  snapshot() {
    return { ...this.status };
  }

  startKeepAlive() {
    this.stopKeepAlive();
    this.timer = setInterval(() => {
      this.pruneCursors();
      for (const res of this.clients) {
        try {
          res.write(": ping\n\n");
        } catch {
          this.clients.delete(res);
        }
      }
    }, KEEP_ALIVE_MS);
  }

  stopKeepAlive() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 通知所有网页端：数据有变化 */
  broadcast() {
    for (const res of this.clients) {
      this.sendEvent(res, "changed", Date.now());
    }
  }

  /** 给单个 SSE 客户端发一条事件 */
  sendEvent(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.clients.delete(res);
    }
  }

  /** 给除 skip 外的所有 SSE 客户端发一条事件 */
  broadcastEvent(event, data, skip) {
    for (const res of this.clients) {
      if (res === skip) continue;
      this.sendEvent(res, event, data);
    }
  }

  /** 去除本地绝对路径，避免把主机文件系统信息暴露给网页端 */
  publicItem(item) {
    const { file, ...rest } = item;
    return rest;
  }

  clientState() {
    return {
      user: hostUser(),
      // 网页端只展示共享桌面（旧版本的 shared / upload 条目不下发）
      items: this.store.items
        .filter((item) => item.scope === "clipboard")
        .map((item) => this.publicItem(item)),
      now: Date.now(),
    };
  }

  handle(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      this.sendJson(res, 400, { error: "非法请求" });
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      this.sendJson(res, 400, { error: "非法请求" });
      return;
    }

    try {
      if (pathname === "/api/state") {
        this.sendJson(res, 200, this.clientState());
        return;
      }
      if (pathname === "/api/events") {
        this.handleEvents(req, res);
        return;
      }
      if (pathname === "/api/clipboard/text" && req.method === "POST") {
        this.handleText(req, res);
        return;
      }
      if (pathname === "/api/clipboard/file" && req.method === "POST") {
        this.handleDesktopFile(req, res, url.searchParams);
        return;
      }
      if (pathname.startsWith("/api/file/")) {
        this.handleDownload(req, res, pathname.slice("/api/file/".length), url.searchParams.get("inline") === "1");
        return;
      }
      if (pathname === "/api/clipboard/move" && req.method === "POST") {
        this.handleMove(req, res);
        return;
      }
      if (pathname === "/api/cursor" && req.method === "POST") {
        this.handleCursor(req, res);
        return;
      }
      if (pathname === "/favicon.ico") {
        res.writeHead(204).end();
        return;
      }
      this.handleStatic(req, res, pathname);
    } catch (error) {
      this.sendJson(res, 500, { error: error.message || "服务内部错误" });
    }
  }

  handleEvents(req, res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`event: ready\ndata: ${Date.now()}\n\n`);
    this.clients.add(res);
    this.attachCursorChannel(res);
    req.on("close", () => {
      this.clients.delete(res);
      // SSE 断开不立刻删光标：HTTP 上报与 SSE 是两条连接，同访客可能还在动，交给 TTL 兜底
    });
  }

  /** 分配一个和现有访客不撞色的颜色序号 */
  pickColorIndex() {
    const used = new Set(Array.from(this.cursors.values()).map((cursor) => cursor.color));
    for (let index = 0; index < CURSOR_COLORS.length; index += 1) {
      if (!used.has(index)) return index;
    }
    return this.cursors.size % CURSOR_COLORS.length;
  }

  /** 新 SSE 访客接入：把它已在线的访客光标快照发给新访客，中途加入也能立刻看到别人 */
  attachCursorChannel(res) {
    const others = Array.from(this.cursors.values()).map((cursor) => ({
      cid: cursor.cid,
      name: cursor.name,
      color: cursor.color,
      x: cursor.x,
      y: cursor.y,
    }));
    if (others.length) {
      this.sendEvent(res, "cursors", { cursors: others });
    }
  }

  /** 移除某访客的光标并通知所有人 */
  removeCursor(cid) {
    if (!this.cursors.has(cid)) return;
    this.cursors.delete(cid);
    this.broadcastEvent("cursors", { remove: cursorKey(cid) });
  }

  /** 光标闲置清理：超时未更新的访客光标不再下发 */
  pruneCursors() {
    const now = Date.now();
    for (const [cid, cursor] of this.cursors) {
      if (now - cursor.at > CURSOR_TTL_MS) {
        this.cursors.delete(cid);
        this.broadcastEvent("cursors", { remove: cursorKey(cid) });
      }
    }
  }

  /** 接收网页端上报的光标位置，转发给除上报者外的所有在线访客 */
  /** 接收网页端上报的光标位置，转发给除上报者外的所有在线访客 */
  async handleCursor(req, res) {
    try {
      const body = await readJsonBody(req, 512);
      const from = guestName(body.from);
      if (body.leave) {
        // 离开上报按客户端 id 精确移除自己的光标
        const cid = typeof body.cid === "string" && body.cid ? body.cid.slice(0, 64) : "";
        if (cid) {
          this.removeCursor(Symbol.for(`cursor:${cid}`));
        }
        this.sendJson(res, 200, { ok: true });
        return;
      }
      const x = Number(body.x);
      const y = Number(body.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 100000 || Math.abs(y) > 100000) {
        this.sendJson(res, 400, { error: "坐标不合法" });
        return;
      }
      // cid 是上报端浏览器生成的稳定 id：同浏览器多标签页共享一个光标，客户端用它过滤掉自己
      const cid = typeof body.cid === "string" && body.cid ? body.cid.slice(0, 64) : `ip-${this.clientIp(req)}`;
      let cursor = this.cursors.get(Symbol.for(`cursor:${cid}`));
      if (!cursor) {
        cursor = { cid, name: from || "访客", x, y, at: Date.now(), color: this.pickColorIndex() };
        this.cursors.set(Symbol.for(`cursor:${cid}`), cursor);
      }
      cursor.x = x;
      cursor.y = y;
      cursor.at = Date.now();
      // 转发限频：光标移动很密，做 40ms 合帧，足够平滑又省带宽
      if (!cursor.lastSent || Date.now() - cursor.lastSent >= CURSOR_MIN_INTERVAL_MS) {
        cursor.lastSent = Date.now();
        this.broadcastEvent("cursors", {
          cursors: [{ cid: cursor.cid, name: cursor.name, color: cursor.color, x, y }],
        });
      }
      this.sendJson(res, 200, { ok: true });
    } catch (error) {
      this.sendJson(res, 400, { error: error.message || "光标上报失败" });
    }
  }

  /** 拖动共享桌面上的卡片后保存坐标 */
  async handleMove(req, res) {
    try {
      const body = await readJsonBody(req, 4096);
      const x = toCoord(body.x);
      const y = toCoord(body.y);
      if (x === null || y === null) {
        this.sendJson(res, 400, { error: "坐标不合法" });
        return;
      }
      const item = this.store.moveItem(String(body.id || ""), x, y);
      if (!item) {
        this.sendJson(res, 404, { error: "内容不存在或已被清理" });
        return;
      }
      this.afterChange();
      this.sendJson(res, 200, { ok: true, item: this.publicItem(item) });
    } catch (error) {
      this.sendJson(res, 400, { error: error.message || "移动失败" });
    }
  }

  async handleText(req, res) {
    try {
      const body = await readJsonBody(req, MAX_TEXT_BYTES);
      const text = typeof body.text === "string" ? body.text : "";
      if (!text.trim()) {
        this.sendJson(res, 400, { error: "文本内容不能为空" });
        return;
      }
      const item = this.store.addText(text, this.clientMeta(req, body.from));
      const x = toCoord(body.x);
      const y = toCoord(body.y);
      if (x !== null && y !== null) {
        this.store.moveItem(item.id, x, y);
      }
      this.afterChange();
      this.sendJson(res, 200, { ok: true, item: this.publicItem(item) });
    } catch (error) {
      this.sendJson(res, 400, { error: error.message || "发送失败" });
    }
  }

  /** 接收网页端放上桌面的文件（可带桌面坐标） */
  handleDesktopFile(req, res, params) {
    const kind = params.get("kind") === "image" ? "image" : "file";
    let target;
    try {
      target = this.store.allocUpload("clipboard", params.get("name") || "", kind);
    } catch (error) {
      this.sendJson(res, 400, { error: error.message || "文件名不合法" });
      return;
    }

    const stream = fs.createWriteStream(target.file);
    let settled = false;

    const fail = (message, code) => {
      if (settled) return;
      settled = true;
      this.store.removeFile({ file: target.file });
      if (code) {
        if (!res.headersSent) this.sendJson(res, code, { error: message });
        else res.end();
      }
    };

    req.on("aborted", () => fail("", 0));
    req.on("error", () => fail("", 0));
    stream.on("error", () => fail("写入文件失败", 500));
    stream.on("finish", () => {
      if (settled) return;
      settled = true;
      const size = stream.bytesWritten;
      const item = this.store.register({
        scope: "clipboard",
        kind,
        name: target.name,
        file: target.file,
        size,
        ...this.clientMeta(req, params.get("from")),
      });
      const x = toCoord(params.get("x"));
      const y = toCoord(params.get("y"));
      if (x !== null && y !== null) {
        this.store.moveItem(item.id, x, y);
      }
      this.afterChange();
      this.sendJson(res, 200, { ok: true, item: this.publicItem(item) });
    });
    req.pipe(stream);
  }

  handleDownload(req, res, id, inline) {
    const item = this.store.get(id);
    if (!item || item.scope === "upload") {
      this.sendJson(res, 404, { error: "文件不存在或已被清理" });
      return;
    }
    let stat;
    try {
      stat = fs.statSync(item.file);
    } catch {
      this.sendJson(res, 404, { error: "文件已被移动或删除" });
      return;
    }

    const type = contentType(item.file);
    const canInline = inline && INLINE_SAFE.has(type);
    const headers = {
      "Content-Type": canInline ? type : "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-store",
    };
    if (!canInline) {
      const asciiName = item.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
      headers["Content-Disposition"] =
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(item.name)}`;
    }
    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = fs.createReadStream(item.file);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  }

  /** 托管网页端页面与构建资源 */
  handleStatic(req, res, pathname) {
    let target = null;
    if (pathname === "/" || pathname === "/index.html") {
      target = path.join(this.lanDir, "index.html");
      if (!fs.existsSync(target)) {
        this.sendJson(res, 404, { error: "网页端资源缺失，请重新构建插件" });
        return;
      }
    } else if (pathname === "/logo.svg" || pathname === "/logo.png") {
      // 网页端 favicon（lan/index.html 里以 ../logo.* 引用，落到站点根）
      target = path.join(this.rootDir, pathname);
    } else if (pathname.startsWith("/assets/")) {
      const candidate = path.join(this.rootDir, pathname);
      if (isInside(path.join(this.rootDir, "assets"), candidate)) {
        target = candidate;
      }
    }

    if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      this.sendJson(res, 404, { error: "页面不存在" });
      return;
    }

    const isHtml = pathname === "/" || pathname === "/index.html";
    res.writeHead(200, {
      "Content-Type": contentType(target),
      "Cache-Control": isHtml ? "no-cache" : "public, max-age=31536000, immutable",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(target).pipe(res);
  }

  clientIp(req) {
    const address = req.socket.remoteAddress || "";
    return address.replace(/^::ffff:/, "");
  }

  /**
   * 请求来源信息：本机自己（回环或本网卡地址）访问时署名为登录用户，
   * 其它设备用访客自报的昵称（没有就留空，界面按"访客"显示）。
   */
  clientMeta(req, guest) {
    const ip = this.clientIp(req);
    const local =
      ip === "127.0.0.1" || ip === "::1" || listIps().some((entry) => entry.address === ip);
    return { ip, from: local ? hostUser() : guestName(guest) };
  }

  afterChange(notifyClients = true) {
    if (notifyClients) this.broadcast();
    this.onState();
  }

  sendJson(res, code, data) {
    if (res.headersSent) {
      res.end();
      return;
    }
    const body = JSON.stringify(data);
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
    });
    res.end(body);
  }
}

module.exports = { LanServer };
