"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MIME_TYPES = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  "7z": "application/x-7z-compressed",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  return MIME_TYPES[ext] || "application/octet-stream";
}

/** 去掉路径、控制字符与系统非法字符，仅保留一个安全的文件名 */
function sanitizeName(raw, fallback) {
  let name = String(raw == null ? "" : raw)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
  name = path.basename(name).replace(/[\\/:*?"<>|]/g, "_").trim();
  if (!name || name === "." || name === "..") {
    name = fallback || "file";
  }
  if (name.length > 160) {
    const ext = path.extname(name).slice(0, 16);
    name = name.slice(0, 160 - ext.length) + ext;
  }
  return name;
}

/** 在目录内生成不冲突的文件路径，重名时追加 -1、-2 */
function uniquePath(dir, name) {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = path.join(dir, name);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem}-${index}${ext}`);
    index += 1;
  }
  return candidate;
}

function timestamp(date) {
  const d = date ? new Date(date) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

const PRIVATE_PREFIXES = [
  (ip) => ip.startsWith("192.168."),
  (ip) => ip.startsWith("10."),
  (ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip),
];

/** 列出本机所有非内部 IPv4 地址，私有网段优先 */
function listIps() {
  const result = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] || []) {
      if (info.family !== "IPv4" || info.internal) continue;
      if (info.address.startsWith("169.254.")) continue;
      result.push({ name, address: info.address });
    }
  }
  const rank = (ip) => {
    const index = PRIVATE_PREFIXES.findIndex((test) => test(ip));
    return index === -1 ? PRIVATE_PREFIXES.length : index;
  };
  result.sort((a, b) => rank(a.address) - rank(b.address));
  return result;
}

/** 取一个用于生成访问地址的 IP，优先已选定的绑定地址 */
function pickDisplayIp(bindIp) {
  if (bindIp) return bindIp;
  const ips = listIps();
  return ips.length ? ips[0].address : "127.0.0.1";
}

function readJsonSafe(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

/** 判断 target 是否位于 base 目录内，避免路径穿越 */
function isInside(base, target) {
  const rel = path.relative(path.resolve(base), path.resolve(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("请求内容过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readJsonBody(req, limit) {
  return readBody(req, limit || 1024 * 1024).then((buf) => {
    if (!buf.length) return {};
    try {
      return JSON.parse(buf.toString("utf8"));
    } catch {
      throw new Error("请求内容不是合法的 JSON");
    }
  });
}

module.exports = {
  contentType,
  isInside,
  listIps,
  pickDisplayIp,
  readBody,
  readJsonBody,
  readJsonSafe,
  sanitizeName,
  timestamp,
  uniquePath,
  writeJsonAtomic,
};
