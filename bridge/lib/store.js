"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  isInside,
  listIps,
  sanitizeName,
  timestamp,
  uniquePath,
  readJsonSafe,
  writeJsonAtomic,
} = require("./util.js");

const SCOPES = ["clipboard", "shared", "upload"];

const DEFAULT_SETTINGS = {
  bindIp: "",
  port: 8888,
  recvDir: "",
  autoStart: false,
  retentionDays: 7,
};

const MAX_CLIPBOARD_ITEMS = 300;
const MAX_PREVIEW_LENGTH = 2000;
const MAX_CANVAS_COORD = 100000;
// 共享桌面桌面的默认网格布局（与网页端 DesktopCanvas 保持一致）
const CANVAS_COLS = 5;
const CANVAS_GAP_X = 300;
const CANVAS_GAP_Y = 220;
const CANVAS_ORIGIN = 60;

/** 桌面坐标限制在有限数且不超出范围，非法值回原点 */
function clampCoord(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(-MAX_CANVAS_COORD, Math.min(MAX_CANVAS_COORD, Math.round(num)));
}

function normalizeSettings(input, defaults) {
  const raw = input && typeof input === "object" ? input : {};
  const settings = { ...DEFAULT_SETTINGS, ...defaults };

  if (typeof raw.bindIp === "string") {
    const bindIp = raw.bindIp.trim();
    const available = listIps().some((item) => item.address === bindIp);
    settings.bindIp = bindIp === "" || available ? bindIp : "";
  }

  const port = Number(raw.port);
  if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
    settings.port = port;
  }

  if (typeof raw.recvDir === "string" && raw.recvDir.trim()) {
    settings.recvDir = path.resolve(raw.recvDir.trim());
  }

  if (typeof raw.autoStart === "boolean") {
    settings.autoStart = raw.autoStart;
  }

  const retentionDays = Number(raw.retentionDays);
  if (Number.isFinite(retentionDays) && retentionDays >= 1 && retentionDays <= 365) {
    settings.retentionDays = Math.round(retentionDays);
  }

  return settings;
}

class Store {
  /**
   * @param {{ dataDir: string, defaultRecvDir: string }} options
   */
  constructor({ dataDir, defaultRecvDir }) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this.stateFile = path.join(dataDir, "state.json");
    const saved = readJsonSafe(this.stateFile, {});
    this.settings = normalizeSettings(saved.settings, {
      ...DEFAULT_SETTINGS,
      recvDir: defaultRecvDir,
    });
    this.items = Array.isArray(saved.items) ? saved.items.filter((item) => this.isValidItem(item)) : [];
    this.ensureDirs();
    if (this.prune().length > 0) {
      this.save();
    }
  }

  isValidItem(item) {
    if (!item || typeof item !== "object") return false;
    if (!SCOPES.includes(item.scope)) return false;
    if (typeof item.file !== "string" || !item.file) return false;
    if (typeof item.id !== "string" || !item.id) return false;
    return true;
  }

  save() {
    writeJsonAtomic(this.stateFile, { settings: this.settings, items: this.items });
  }

  /** 存储目录下的子目录：新内容直接放存储根目录，shared / uploads 只为读取旧数据保留 */
  dirFor(scope) {
    const folder = scope === "shared" ? "shared" : scope === "upload" ? "uploads" : "";
    return folder ? path.join(this.settings.recvDir, folder) : this.settings.recvDir;
  }

  ensureDirs() {
    fs.mkdirSync(this.settings.recvDir, { recursive: true });
  }

  updateSettings(patch) {
    this.settings = normalizeSettings({ ...this.settings, ...patch }, this.settings);
    this.ensureDirs();
    this.save();
    return this.settings;
  }

  /** 为即将写入的文件申请一个安全的落盘路径 */
  allocFile(scope, rawName, fallback) {
    const dir = this.dirFor(scope);
    fs.mkdirSync(dir, { recursive: true });
    const name = sanitizeName(rawName, fallback);
    const file = uniquePath(dir, name);
    if (!isInside(this.settings.recvDir, file)) {
      throw new Error("非法的文件路径");
    }
    return { file, name: path.basename(file) };
  }

  register(item) {
    const entry = {
      id: crypto.randomUUID(),
      scope: item.scope,
      kind: item.kind,
      name: item.name,
      file: item.file,
      size: Number.isFinite(item.size) ? item.size : 0,
      time: Date.now(),
      from: item.from || "",
      ip: item.ip || "",
    };
    if (item.kind === "text") {
      entry.preview = String(item.text || "").slice(0, MAX_PREVIEW_LENGTH);
    }
    if (Number.isFinite(item.x) && Number.isFinite(item.y)) {
      entry.x = clampCoord(item.x);
      entry.y = clampCoord(item.y);
    } else if (entry.scope === "clipboard") {
      const pos = this.freeCanvasPos();
      entry.x = pos.x;
      entry.y = pos.y;
    }
    this.items.unshift(entry);
    this.prune();
    this.save();
    return entry;
  }

  /** 找一个还没被占用的网格位置，新条目上桌面时不会叠在一起 */
  freeCanvasPos() {
    const occupied = new Set(
      this.items
        .filter((item) => item.scope === "clipboard")
        .map((item) => `${item.x},${item.y}`)
    );
    for (let index = 0; index < CANVAS_COLS * 200; index += 1) {
      const pos = {
        x: CANVAS_ORIGIN + (index % CANVAS_COLS) * CANVAS_GAP_X,
        y: CANVAS_ORIGIN + Math.floor(index / CANVAS_COLS) * CANVAS_GAP_Y,
      };
      if (!occupied.has(`${pos.x},${pos.y}`)) return pos;
    }
    return { x: CANVAS_ORIGIN, y: CANVAS_ORIGIN };
  }

  get(id) {
    return this.items.find((item) => item.id === id) || null;
  }

  byScope(scope) {
    return this.items.filter((item) => item.scope === scope);
  }

  /** 更新条目在共享桌面桌面上的坐标 */
  moveItem(id, x, y) {
    const item = this.get(id);
    if (!item || item.scope !== "clipboard") return null;
    item.x = clampCoord(x);
    item.y = clampCoord(y);
    this.save();
    return item;
  }

  /** 删除记录，返回被删除的条目（文件由调用方处理） */
  remove(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const [entry] = this.items.splice(index, 1);
    this.save();
    return entry;
  }

  clearScope(scope) {
    const removed = this.items.filter((item) => item.scope === scope);
    this.items = this.items.filter((item) => item.scope !== scope);
    this.save();
    return removed;
  }

  /** 清理超过保留期的共享桌面条目与超出上限的旧记录，并删除对应文件 */
  prune() {
    const removed = [];
    const deadline = Date.now() - this.settings.retentionDays * 24 * 60 * 60 * 1000;
    const kept = [];
    for (const item of this.items) {
      if (item.scope === "clipboard" && item.time < deadline) {
        removed.push(item);
        continue;
      }
      kept.push(item);
    }
    this.items = kept;

    const clips = this.items.filter((item) => item.scope === "clipboard");
    if (clips.length > MAX_CLIPBOARD_ITEMS) {
      const overflow = clips.slice(MAX_CLIPBOARD_ITEMS);
      const overflowIds = new Set(overflow.map((item) => item.id));
      this.items = this.items.filter((item) => !overflowIds.has(item.id));
      removed.push(...overflow);
    }

    for (const item of removed) {
      this.removeFile(item);
    }
    return removed;
  }

  /** 落盘一条共享桌面文本；meta = { from: 用户名, ip: 来源地址 } */
  addText(text, meta) {
    const content = String(text == null ? "" : text);
    if (!content.trim()) {
      throw new Error("文本内容为空");
    }
    const info = meta || {};
    const target = this.allocFile("clipboard", `text-${timestamp()}.txt`, "text.txt");
    fs.writeFileSync(target.file, content, "utf8");
    return this.register({
      scope: "clipboard",
      kind: "text",
      name: target.name,
      file: target.file,
      size: Buffer.byteLength(content, "utf8"),
      from: info.from,
      ip: info.ip,
      text: content,
    });
  }

  /** 把本机文件复制进存储目录，返回新条目 */
  copyIn(scope, kind, sourcePath, meta) {
    const info = meta || {};
    const target = this.allocFile(scope, path.basename(sourcePath));
    fs.copyFileSync(sourcePath, target.file);
    const stat = fs.statSync(target.file);
    return this.register({
      scope,
      kind: kind || "file",
      name: target.name,
      file: target.file,
      size: stat.size,
      from: info.from,
      ip: info.ip,
    });
  }

  /** 接收网页端放上桌面的文件：返回 { file, name }，由调用方写入流 */
  allocUpload(scope, rawName, kind) {
    const fallback = kind === "image" ? "image.png" : "file";
    return this.allocFile(scope, rawName, fallback);
  }

  removeFile(entry) {
    if (!entry || typeof entry.file !== "string") return;
    try {
      fs.rmSync(entry.file, { force: true });
    } catch {
      /* 文件可能已被移动或删除 */
    }
  }
}

module.exports = { Store, DEFAULT_SETTINGS, MAX_CLIPBOARD_ITEMS, normalizeSettings, clampCoord };
