import { cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const distDir = path.join(root, "dist");
const bridgeDir = path.join(root, "bridge");

if (!existsSync(distDir)) {
  console.error("未找到 dist 目录，请先执行 vite build");
  process.exit(1);
}

cpSync(bridgeDir, distDir, { recursive: true });

// uTools 打包会拒绝 .DS_Store 与 source map 调试文件，构建后统一清理
function clean(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      clean(target);
      continue;
    }
    if (entry.name === ".DS_Store" || entry.name.endsWith(".map")) {
      rmSync(target, { force: true });
    }
  }
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    throw new Error(`缺少目录：${dir}`);
  }
  if (!statSync(dir).isDirectory()) {
    throw new Error(`不是目录：${dir}`);
  }
}

ensureDir(distDir);
clean(distDir);

if (!existsSync(path.join(distDir, "lan", "index.html"))) {
  console.error("错误：dist/lan/index.html 不存在，网页端无法访问");
  process.exit(1);
}

console.log("已复制 preload.js、lib/、package.json 到 dist/ 并清理 .DS_Store / .map");
