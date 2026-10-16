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
}): () => void {
  const source = new EventSource("/api/events");
  source.addEventListener("open", () => handlers.onStatus(true));
  source.addEventListener("changed", () => handlers.onChanged());
  source.addEventListener("error", () => handlers.onStatus(false));
  return () => source.close();
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
