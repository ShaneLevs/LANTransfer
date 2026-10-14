"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { contentType, isInside, pickDisplayIp, readJsonBody } = require("./util.js");

const MAX_TEXT_BYTES = 1024 * 1024;
const KEEP_ALIVE_MS = 25000;
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

/** 局域网 HTTP 服务：托管网页端界面，并提供剪贴板、上传、下载接口 */
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
      try {
        res.write(`event: changed\ndata: ${Date.now()}\n\n`);
      } catch {
        this.clients.delete(res);
      }
    }
  }

  /** 去除本地绝对路径，避免把主机文件系统信息暴露给网页端 */
  publicItem(item) {
    const { file, ...rest } = item;
    return rest;
  }

  clientState() {
    return {
      host: os.hostname(),
      items: this.store.items.filter((item) => item.scope !== "upload").map((item) => this.publicItem(item)),
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
        this.handleUpload(req, res, "clipboard", url.searchParams);
        return;
      }
      if (pathname === "/api/upload" && req.method === "POST") {
        this.handleUpload(req, res, "upload", url.searchParams);
        return;
      }
      if (pathname.startsWith("/api/file/")) {
        this.handleDownload(req, res, pathname.slice("/api/file/".length), url.searchParams.get("inline") === "1");
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
    req.on("close", () => {
      this.clients.delete(res);
    });
  }

  async handleText(req, res) {
    try {
      const body = await readJsonBody(req, MAX_TEXT_BYTES);
      const text = typeof body.text === "string" ? body.text : "";
      if (!text.trim()) {
        this.sendJson(res, 400, { error: "文本内容不能为空" });
        return;
      }
      const item = this.store.addText(text, this.clientIp(req));
      this.afterChange();
      this.sendJson(res, 200, { ok: true, item: this.publicItem(item) });
    } catch (error) {
      this.sendJson(res, 400, { error: error.message || "发送失败" });
    }
  }

  handleUpload(req, res, scope, params) {
    const kind = params.get("kind") === "image" ? "image" : "file";
    let target;
    try {
      target = this.store.allocUpload(scope, params.get("name") || "", kind);
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
        scope,
        kind,
        name: target.name,
        file: target.file,
        size,
        from: this.clientIp(req),
      });
      this.afterChange(scope !== "upload");
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
