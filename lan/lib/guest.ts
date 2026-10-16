/**
 * 访客昵称：存在浏览器 localStorage 里，上传时随请求带给服务端记入卡片署名。
 * 浏览器拿不到访客的系统用户名，所以让访客自己起一个。
 */
const KEY = "lan-transfer:guest-name";
const MAX_NAME = 24;

export function getGuestName(): string {
  try {
    return localStorage.getItem(KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function setGuestName(name: string): string {
  const value =
    name
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, MAX_NAME) || "";
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    /* localStorage 不可用（隐私模式等）时本次会话仍可用 */
  }
  return value;
}
