/**
 * 复制文本：非 HTTPS 环境下 navigator.clipboard 不可用，
 * 自动降级为 textarea + execCommand。
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* 继续尝试降级方案 */
    }
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 复制图片：需要 navigator.clipboard.write + ClipboardItem。
 * 局域网 HTTP 地址不是安全上下文，多数浏览器会直接拒绝，失败时返回 false 由界面提示。
 */
export async function copyImageByUrl(src: string): Promise<boolean> {
  try {
    if (!navigator.clipboard || !window.isSecureContext || typeof ClipboardItem === "undefined") {
      return false;
    }
    const response = await fetch(src, { cache: "no-store" });
    if (!response.ok) return false;
    const blob = await response.blob();
    // ClipboardItem 只接受 PNG / WebP / SVG 等少数类型
    const type = blob.type === "image/jpeg" || blob.type === "image/bmp" ? "image/png" : blob.type;
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
    return true;
  } catch {
    return false;
  }
}
