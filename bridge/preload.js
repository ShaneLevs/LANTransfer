"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { Store } = require("./lib/store.js");
const { LanServer } = require("./lib/server.js");
const { contentType, listIps, pickDisplayIp, timestamp } = require("./lib/util.js");

// 读取系统剪贴板依赖 electron 的 clipboard：环境不提供时只影响「分享系统剪贴板」，
// 不能让它把整个 preload 打断（preload 中断会导致 window.services 缺失）
let systemClipboard = null;
try {
  systemClipboard = require("electron").clipboard;
} catch (error) {
  console.error("[LANTransfer] 无法加载系统剪贴板能力", error);
}

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

/** 保存图片二进制到剪贴板目录 */
function saveImageBuffer(buffer, ext, from) {
  const target = store.allocFile("clipboard", `image-${timestamp()}.${ext}`, "image.png");
  fs.writeFileSync(target.file, buffer);
  return store.register({
    scope: "clipboard",
    kind: "image",
    name: target.name,
    file: target.file,
    size: buffer.length,
    from,
  });
}

function addText(text, from) {
  const item = store.addText(text, from);
  afterShare(true);
  return item;
}

/** 把本机文件复制进接收目录并分享 */
function sharePaths(paths, scope) {
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
    throw new Error("没有可分享的文件（暂不支持分享文件夹）");
  }
  for (const file of files) {
    store.copyIn(scope, imageKind(file), file, "本机");
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

/** 读取系统剪贴板内容并分享到局域网剪贴板 */
function shareSystemClipboard() {
  const copiedFiles = utools.getCopiedFiles();
  if (Array.isArray(copiedFiles) && copiedFiles.length) {
    try {
      const result = sharePaths(
        copiedFiles.filter((file) => file.isFile).map((file) => file.path),
        "clipboard"
      );
      if (result.count > 0) return { kind: "file", count: result.count };
    } catch {
      /* 裁剪板里只有文件夹时继续尝试图片与文本 */
    }
  }

  const image = systemClipboard ? systemClipboard.readImage() : null;
  if (image && !image.isEmpty()) {
    const buffer = image.toPNG();
    saveImageBuffer(buffer, "png", "本机");
    afterShare(true);
    return { kind: "image", count: 1 };
  }

  const text = systemClipboard ? systemClipboard.readText() : "";
  if (text && text.trim()) {
    addText(text, "本机");
    return { kind: "text", count: 1 };
  }

  if (!systemClipboard) {
    throw new Error("当前环境不支持读取系统剪贴板，请改用「选择文件分享」或直接粘贴文本");
  }
  throw new Error("系统剪贴板中没有可分享的文字、图片或文件");
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
  afterShare(scope !== "upload");
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
        title: "选择接收目录",
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

  async shareFiles() {
    return pickFiles("shared", "选择要分享的文件");
  },

  async shareClipboardFiles() {
    return pickFiles("clipboard", "选择要发到共享剪贴板的文件");
  },

  shareSystemClipboard,

  addText: (text) => addText(text, "本机"),

  removeItem,

  clearScope,

  revealItem(id) {
    const item = store.get(id);
    if (item) utools.shellShowItemInFolder(item.file);
  },

  openItem(id) {
    const item = store.get(id);
    if (item) resolveResult(utools.shellOpenPath(item.file)).catch(() => {});
  },

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

  /** 主界面粘贴图片时调用（FileReader 读成 data URL 后传入） */
  addImage(dataUrl) {
    const { buffer, ext } = parseDataUrl(dataUrl);
    const item = saveImageBuffer(buffer, ext, "本机");
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
    const result = sharePaths(files, "shared");
    utools.showNotification(`已分享 ${result.count} 个文件到局域网`);
    return;
  }
  if (type === "img" && typeof payload === "string") {
    const { buffer, ext } = parseDataUrl(payload);
    saveImageBuffer(buffer, ext, "本机");
    afterShare(true);
    utools.showNotification("图片已发送到共享剪贴板");
    return;
  }
  if (type === "over" && typeof payload === "string") {
    addText(payload, "本机");
    utools.showNotification("文字已发送到共享剪贴板");
  }
}

function setup() {
  const dataDir = utools.getPluginLocalDataPath();
  const defaultRecvDir = path.join(utools.getPath("downloads"), "LANTransfer");
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
      utools.showNotification(`分享失败：${error.message || error}`);
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
