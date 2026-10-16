import type { LanClientState } from "@/types";
import { getGuestName } from "@lan/lib/guest";

const jsonHeaders = { "Content-Type": "application/json" };

/** 访客昵称参数：有昵称就带上，服务端记入卡片署名 */
function guestParams(params: URLSearchParams): URLSearchParams {
  const name = getGuestName();
  if (name) params.set("from", name);
  return params;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data.error === "string") return data.error;
  } catch {
    /* 忽略解析失败 */
  }
  return `请求失败（${response.status}）`;
}

export async function fetchState(): Promise<LanClientState> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as LanClientState;
}

export function subscribe(handlers: {
  onChanged: () => void;
  onStatus: (online: boolean) => void;
  /** 收到其它访客的光标（x/y 为桌面世界坐标；remove 为被移除的光标键） */
  onCursors?: (message: { cursors?: RemoteCursor[]; remove?: string }) => void;
}): () => void {
  const source = new EventSource("/api/events");
  source.addEventListener("open", () => handlers.onStatus(true));
  source.addEventListener("changed", () => handlers.onChanged());
  source.addEventListener("cursors", (event) => {
    try {
      handlers.onCursors?.(JSON.parse((event as MessageEvent).data));
    } catch {
      /* 忽略坏消息 */
    }
  });
  source.addEventListener("error", () => handlers.onStatus(false));
  return () => source.close();
}

/** 广播里的远端访客光标 */
export interface RemoteCursor {
  /** 光标标识：上报端浏览器生成的稳定 id，客户端用它过滤掉自己的光标 */
  cid: string;
  name: string;
  /** 服务端分配的颜色序号，配合 CURSOR_PALETTE 使用 */
  color: number;
  x: number;
  y: number;
}

/** 本端光标的唯一标识：同一浏览器多个标签页共享，用于别人过滤掉「自己」 */
const CLIENT_KEY = "lan-transfer:client-id";

export function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Math.random().toString(36).slice(2)}`;
  }
}

/** 上报本端光标位置（世界坐标），服务端转发给其它网页端 */
export function sendCursor(x: number, y: number): void {
  const body = JSON.stringify({ x, y, from: getGuestName(), cid: getClientId() });
  fetch("/api/cursor", { method: "POST", headers: jsonHeaders, body, keepalive: true }).catch(() => {
    /* 光标上报失败可忽略，下一次移动会再试 */
  });
}

/** 离开时通知服务端立刻移除自己的光标 */
export function sendCursorLeave(): void {
  const body = JSON.stringify({ leave: true, from: getGuestName(), cid: getClientId() });
  fetch("/api/cursor", { method: "POST", headers: jsonHeaders, body, keepalive: true }).catch(() => {
    /* 忽略 */
  });
}

export function sendText(text: string, pos?: { x: number; y: number }): Promise<void> {
  const body = JSON.stringify({ text, from: getGuestName(), ...(pos ? { x: pos.x, y: pos.y } : {}) });
  return fetch("/api/clipboard/text", {
    method: "POST",
    headers: jsonHeaders,
    body,
  }).then(async (response) => {
    if (!response.ok) throw new Error(await parseError(response));
  });
}

export async function fetchText(id: string): Promise<string> {
  const response = await fetch(`/api/file/${id}?inline=1`, { cache: "no-store" });
  if (!response.ok) throw new Error(await parseError(response));
  return response.text();
}

/** 共享桌面桌面上拖动卡片后保存坐标 */
export async function moveItem(id: string, x: number, y: number): Promise<void> {
  const response = await fetch("/api/clipboard/move", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ id, x, y }),
  });
  if (!response.ok) throw new Error(await parseError(response));
}

/** 把文件放到共享桌面（图片/普通文件都行） */
export function uploadFile(
  file: File,
  options: {
    kind: "file" | "image";
    pos?: { x: number; y: number };
    onProgress?: (progress: number) => void;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const params = guestParams(new URLSearchParams({ name: file.name || "file" }));
    if (options.kind === "image") params.set("kind", "image");
    if (options.pos) {
      params.set("x", String(Math.round(options.pos.x)));
      params.set("y", String(Math.round(options.pos.y)));
    }
    const request = new XMLHttpRequest();
    request.open("POST", `/api/clipboard/file?${params.toString()}`);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        options.onProgress?.(1);
        resolve();
        return;
      }
      let message = `上传失败（${request.status}）`;
      try {
        const data = JSON.parse(request.responseText);
        if (data && typeof data.error === "string") message = data.error;
      } catch {
        /* 忽略解析失败 */
      }
      reject(new Error(message));
    });
    request.addEventListener("error", () => reject(new Error("网络异常，上传中断")));
    request.addEventListener("abort", () => reject(new Error("上传已取消")));
    request.send(file);
  });
}
