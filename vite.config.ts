import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const lanDir = fileURLToPath(new URL("./lan", import.meta.url));

/**
 * uTools 以 file:// 加载插件页面，带 crossorigin 的 module script 会走 CORS 拉取而被拦截，
 * 因此构建后需要把 HTML 中的 crossorigin 属性去掉。
 */
function removeCrossorigin() {
  return {
    name: "remove-crossorigin",
    enforce: "post" as const,
    transformIndexHtml: {
      order: "post" as const,
      handler: (html: string) => html.replace(/ crossorigin/g, ""),
    },
  };
}

const alias = {
  "@": srcDir,
  "@lan": lanDir,
};

/**
 * 插件主界面与网页端是两套入口：
 * - 主界面由 uTools 以 file:// 加载，必须单文件产物（不拆 chunk），产物在 dist/
 * - 网页端由插件内置的 HTTP 服务托管，产物在 dist/lan/，走独立的 `--mode lan` 构建
 */
export default defineConfig(({ mode }) => {
  const isLan = mode === "lan";
  return {
    base: "./",
    plugins: [react(), tailwindcss(), removeCrossorigin()],
    resolve: { alias },
    build: {
      // 主界面：uTools 以 file:// 加载，必须单文件产物，输出到 dist/
      // 网页端：产物与主界面共用 dist/assets，HTML 输出到 dist/lan/，因此不能清空 dist
      outDir: "dist",
      emptyOutDir: !isLan,
      publicDir: isLan ? false : undefined,
      modulePreload: false,
      rollupOptions: {
        input: isLan
          ? fileURLToPath(new URL("./lan/index.html", import.meta.url))
          : fileURLToPath(new URL("./index.html", import.meta.url)),
      },
    },
    // 开发时把网页端的接口请求转发到本机运行中的局域网服务
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8888",
      },
    },
  };
});
