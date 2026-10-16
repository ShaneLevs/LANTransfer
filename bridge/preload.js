"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { Store } = require("./lib/store.js");
const { LanServer } = require("./lib/server.js");
const { contentType, hostUser, listIps, pickDisplayIp, timestamp } = require("./lib/util.js");

const ROOT_DIR = __dirname;
const LAN_DIR = path.join(ROOT_DIR, "lan");
const PRUNE_INTERVAL = 30 * 60 * 1000;

/** 兼容同步与异步两种返回形式 */
function resolveResult(value) {
  return value && typeof value.then === "function" ? value : Promise.resolve(value);
}

function imageKind(filePath) {
  return contentType(filePath).startsWith("image/") ? "image" : "file";
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ""));
  if (!match) throw new Error("无法识别的图片数据");
  const buffer = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
  const ext = (match[1] || "image/png").split("/")[1] || "png";
  return { buffer, ext: ext.replace(/[^a-z0-9]/gi, "") || "png" };
}

let store = null;
let server = null;
let setupError = null;
const listeners = new Set();

function snapshot() {
  if (setupError) {
    throw new Error(`插件初始化失败：${setupError.message || setupError}`);
  }
  return {
    settings: { ...store.settings },
    ips: listIps(),
    displayIp: pickDisplayIp(store.settings.bindIp),
    user: hostUser(),
    status: server ? server.snapshot() : { running: false, error: "", url: "" },
    items: store.items,
    dataDir: store.dataDir,
  };
}

function notify() {
  const state = snapshot();
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (error) {
      console.error("[LANTransfer] 状态回调异常", error);
    }
  }
}

function afterShare(notifyClients) {
  notify();
  if (server && notifyClients) {
    server.broadcast();
  }
}

/** 本机条目的署名：登录用户名 + 本机对内 IP */
function localMeta() {
  return { from: hostUser(), ip: pickDisplayIp(store.settings.bindIp) };
}

/** 保存图片二进制到桌面目录 */
function saveImageBuffer(buffer, ext) {
  const target = store.allocFile("clipboard", `image-${timestamp()}.${ext}`, "image.png");
  fs.writeFileSync(target.file, buffer);
  return store.register({
    scope: "clipboard",
    kind: "image",
    name: target.name,
    file: target.file,
    size: buffer.length,
    ...localMeta(),
  });
}

function addText(text, pos) {
  const item = store.addText(text, localMeta());
  if (pos) {
    store.moveItem(item.id, pos.x, pos.y);
  }
  afterShare(true);
  return item;
}

/** 把本机文件复制进存储目录并放到共享桌面 */
function sharePaths(paths, scope, pos) {
  const files = [];
  const skipped = [];
  for (const raw of paths || []) {
    if (!raw || typeof raw !== "string") continue;
    let stat;
    try {
      stat = fs.statSync(raw);
    } catch {
      skipped.push(raw);
      continue;
    }
    if (stat.isDirectory()) {
      skipped.push(raw);
      continue;
    }
    files.push(raw);
  }
  if (!files.length) {
    throw new Error("没有可放到桌面的文件（暂不支持文件夹）");
  }
  for (const file of files) {
    const entry = store.copyIn(scope, imageKind(file), file, localMeta());
    if (pos) store.moveItem(entry.id, pos.x, pos.y);
  }
  afterShare(true);
  return { count: files.length, skipped: skipped.length };
}

async function pickFiles(scope, title) {
  const picked = await resolveResult(
    utools.showOpenDialog({
      title,
      defaultPath: utools.getPath("downloads"),
      properties: ["openFile", "multiSelections"],
    })
  );
  if (!Array.isArray(picked) || !picked.length) {
    return { count: 0, skipped: 0 };
  }
  return sharePaths(picked, scope);
}

async function removeItem(id) {
  const item = store.get(id);
  if (!item) return;
  try {
    await resolveResult(utools.shellTrashItem(item.file));
  } catch {
    store.removeFile(item);
  }
  store.remove(id);
  afterShare(true);
}

async function clearScope(scope) {
  const removed = store.clearScope(scope);
  for (const item of removed) {
    try {
      await resolveResult(utools.shellTrashItem(item.file));
    } catch {
      store.removeFile(item);
    }
  }
  afterShare(true);
}

const services = {
  getState: () => snapshot(),

  subscribe(callback) {
    if (typeof callback !== "function") return () => {};
    listeners.add(callback);
    return () => listeners.delete(callback);
  },

  async startServer() {
    await server.start();
    return snapshot();
  },

  async stopServer() {
    await server.stop();
    return snapshot();
  },

  async updateSettings(patch) {
    const before = { ...store.settings };
    const next = store.updateSettings(patch);
    const endpointChanged = before.port !== next.port || before.bindIp !== next.bindIp;
    if (endpointChanged && server.running) {
      await server.restart().catch(() => {});
    }
    notify();
    return snapshot();
  },

  async pickRecvDir() {
    const picked = await resolveResult(
      utools.showOpenDialog({
        title: "选择存储目录",
        defaultPath: store.settings.recvDir,
        properties: ["openDirectory", "createDirectory"],
      })
    );
    if (!Array.isArray(picked) || !picked.length) return snapshot();
    return services.updateSettings({ recvDir: picked[0] });
  },

  openRecvDir() {
    return resolveResult(utools.shellOpenPath(store.settings.recvDir)).catch(() => {});
  },

  async pickDesktopFiles() {
    return pickFiles("clipboard", "选择要放到共享桌面的文件");
  },

  /** 拖拽进来的文件（Electron 下 File.path 可用时） */
  addDesktopFiles(paths, pos) {
    return sharePaths(paths, "clipboard", pos);
  },

  addText: (text, pos) => addText(text, pos),

  removeItem,

  clearScope,

  copyText(text) {
    return utools.copyText(String(text == null ? "" : text));
  },

  /** 把任意条目复制回系统剪贴板：文本/图片/文件分别用对应的 uTools API */
  copyItem(id) {
    const item = store.get(id);
    if (!item) throw new Error("内容不存在或已被清理");
    if (item.kind === "text") {
      if (!utools.copyText(this.readItemText(id))) throw new Error("复制失败，请重试");
      return;
    }
    if (item.kind === "image") {
      // copyImage 支持图片文件路径
      if (!utools.copyImage(item.file)) throw new Error("复制失败，请重试");
      return;
    }
    if (!utools.copyFile(item.file)) throw new Error("复制失败，请重试");
  },

  /** 把条目另存到用户选的位置（插件端的「下载」） */
  saveItem(id) {
    const item = store.get(id);
    if (!item) throw new Error("内容不存在或已被清理");
    const target = utools.showSaveDialog({
      title: "保存文件",
      defaultPath: path.join(utools.getPath("downloads"), item.name),
      buttonLabel: "保存",
    });
    if (!target) return null;
    fs.copyFileSync(item.file, target);
    return target;
  },

  /** 主界面粘贴图片时调用（FileReader 读成 data URL 后传入） */
  addImage(dataUrl, pos) {
    const { buffer, ext } = parseDataUrl(dataUrl);
    const item = saveImageBuffer(buffer, ext);
    if (pos) store.moveItem(item.id, pos.x, pos.y);
    afterShare(true);
    return item;
  },

  /** 读取图片条目的内容用于界面预览 */
  readImage(id) {
    const item = store.get(id);
    if (!item || item.kind !== "image") return null;
    try {
      const stat = fs.statSync(item.file);
      if (stat.size > 8 * 1024 * 1024) return null;
      return `data:${contentType(item.file)};base64,${fs.readFileSync(item.file).toString("base64")}`;
    } catch {
      return null;
    }
  },

  /** 读取文本条目的完整内容 */
  readItemText(id) {
    const item = store.get(id);
    if (!item || item.kind !== "text") return "";
    try {
      const stat = fs.statSync(item.file);
      if (stat.size > 1024 * 1024) return item.preview || "";
      return fs.readFileSync(item.file, "utf8");
    } catch {
      return item.preview || "";
    }
  },

  openPage() {
    const url = server.running ? server.snapshot().url : null;
    if (!url) throw new Error("请先启动局域网服务");
    return resolveResult(utools.shellOpenExternal(url)).catch(() => {});
  },
};

function handleMatchEnter(type, payload) {
  if (type === "files" && Array.isArray(payload)) {
    const files = payload.filter((file) => file && file.isFile).map((file) => file.path);
    const result = sharePaths(files, "clipboard");
    utools.showNotification(`已把 ${result.count} 个文件放到共享桌面`);
    return;
  }
  if (type === "img" && typeof payload === "string") {
    const { buffer, ext } = parseDataUrl(payload);
    saveImageBuffer(buffer, ext);
    afterShare(true);
    utools.showNotification("图片已放到共享桌面");
    return;
  }
  if (type === "over" && typeof payload === "string") {
    addText(payload);
    utools.showNotification("文字已放到共享桌面");
  }
}

function setup() {
  const dataDir = utools.getPluginLocalDataPath();
  // v0.3.0 起默认目录改为「共享桌面」；老用户已用旧目录（有内容）则继续沿用，避免文件“失踪”
  const downloads = utools.getPath("downloads");
  const legacyDir = path.join(downloads, "LANTransfer");
  const freshDir = path.join(downloads, "共享桌面");
  const legacyHasFiles = (dir) => {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .some((entry) => entry.isDirectory() || entry.name !== ".DS_Store");
    } catch {
      return false;
    }
  };
  const defaultRecvDir = fs.existsSync(legacyDir) && legacyHasFiles(legacyDir) ? legacyDir : freshDir;
  store = new Store({ dataDir, defaultRecvDir });
  server = new LanServer({
    store,
    rootDir: ROOT_DIR,
    lanDir: LAN_DIR,
    onState: () => notify(),
  });

  if (store.settings.autoStart) {
    server.start().catch(() => {});
  }

  setInterval(() => {
    const removed = store.prune();
    if (!removed.length) return;
    store.save();
    afterShare(true);
  }, PRUNE_INTERVAL);

  utools.onPluginEnter(({ type, payload }) => {
    try {
      handleMatchEnter(type, payload);
    } catch (error) {
      utools.showNotification(`操作失败：${error.message || error}`);
    }
  });
}

// 先把桥接接口挂到 window，再执行初始化：即使初始化抛错，前端也能拿到 window.services
// 并看到具体错误，而不是一个空白界面（preload 顶层抛错会中断后面的所有代码）
window.services = services;

try {
  setup();
} catch (error) {
  setupError = error;
  console.error("[LANTransfer] 初始化失败", error);
}
