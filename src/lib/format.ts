export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** index;
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatTime(time: number): string {
  if (!time) return "";
  const date = new Date(time);
  const now = Date.now();
  const diff = now - time;
  if (diff >= 0 && diff < 60 * 1000) return "刚刚";
  if (diff >= 0 && diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff >= 0 && diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  const pad = (n: number) => String(n).padStart(2, "0");
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const stamp = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return sameYear ? stamp : `${date.getFullYear()}-${stamp}`;
}

/** 依据文件名后缀判断是否可直接预览 */
export function isImageName(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(name);
}
