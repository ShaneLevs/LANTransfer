import type { LanClientState } from "@/types";

const jsonHeaders = { "Content-Type": "application/json" };

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

export function sendText(text: string): Promise<void> {
  return fetch("/api/clipboard/text", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ text }),
  }).then(async (response) => {
    if (!response.ok) throw new Error(await parseError(response));
  });
}

export async function fetchText(id: string): Promise<string> {
  const response = await fetch(`/api/file/${id}?inline=1`, { cache: "no-store" });
  if (!response.ok) throw new Error(await parseError(response));
  return response.text();
}

export function uploadFile(
  file: File,
  options: {
    kind: "file" | "image";
    toClipboard: boolean;
    onProgress?: (progress: number) => void;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ name: file.name || "file" });
    if (options.kind === "image") params.set("kind", "image");
    const endpoint = options.toClipboard ? "/api/clipboard/file" : "/api/upload";
    const request = new XMLHttpRequest();
    request.open("POST", `${endpoint}?${params.toString()}`);
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
