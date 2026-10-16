/**
 * 访客昵称：存在浏览器 localStorage 里，上传时随请求带给服务端记入卡片署名。
 * 浏览器拿不到访客的系统用户名，所以让访客自己起一个。
 */
const KEY = "lan-transfer:guest-name";
const MAX_NAME = 24;

/** 随机昵称素材：形容词 + 名词，各随机一个拼成（例如「敏捷的水獭」） */
const RANDOM_ADJECTIVES = [
  "敏捷的",
  "勇敢的",
  "安静的",
  "好奇的",
  "快乐的",
  "神秘的",
  "闪亮的",
  "温柔的",
  "飞快的",
  "聪明的",
  "懒洋洋的",
  "毛茸茸的",
  "爱笑的",
  "打瞌睡的",
  "摸鱼的",
  "超认真的",
  "慢慢悠悠的",
  "蹦蹦跳跳的",
];
const RANDOM_NOUNS = [
  "水獭",
  "熊猫",
  "海豚",
  "小猫",
  "柴犬",
  "刺猬",
  "企鹅",
  "松鼠",
  "狐狸",
  "章鱼",
  "鲸鱼",
  "兔子",
  "猫头鹰",
  "小鹿",
  "柯基",
  "布偶猫",
  "仓鼠",
  "小恐龙",
];

/** 形容词 + 名词随机组合一个昵称 */
export function randomGuestName(): string {
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
  return `${pick(RANDOM_ADJECTIVES)}${pick(RANDOM_NOUNS)}`;
}

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
