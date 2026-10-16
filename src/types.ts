/** clipboard = 共享桌面；shared / upload 是旧版本残留的 scope，仅用于读入旧数据，界面不再展示 */
export type ItemScope = "clipboard" | "shared" | "upload";

export type ItemKind = "text" | "image" | "file";

export interface TransferItem {
  id: string;
  scope: ItemScope;
  kind: ItemKind;
  name: string;
  /** 本地绝对路径，仅插件主界面可见，不会下发给网页端 */
  file?: string;
  size: number;
  time: number;
  from: string;
  /** 来源 IP（本机条目为本机对内 IP） */
  ip?: string;
  preview?: string;
  /** 共享桌面桌面坐标（仅网页端桌面使用） */
  x?: number;
  y?: number;
}

export interface LanSettings {
  bindIp: string;
  port: number;
  recvDir: string;
  autoStart: boolean;
  retentionDays: number;
}

export interface ServerStatus {
  running: boolean;
  error: string;
  port: number;
  bindIp: string;
  url: string;
  host?: string;
}

export interface IpEntry {
  name: string;
  address: string;
}

export interface AppState {
  settings: LanSettings;
  ips: IpEntry[];
  displayIp: string;
  /** 主机登录用户名 */
  user: string;
  status: ServerStatus;
  items: TransferItem[];
  dataDir: string;
}

export interface LanClientState {
  /** 主机登录用户名 */
  user: string;
  items: TransferItem[];
  now: number;
}

export interface ShareResult {
  count: number;
  skipped: number;
}

export interface Services {
  getState(): AppState;
  subscribe(callback: (state: AppState) => void): () => void;
  startServer(): Promise<AppState>;
  stopServer(): Promise<AppState>;
  updateSettings(patch: Partial<LanSettings>): Promise<AppState>;
  pickRecvDir(): Promise<AppState>;
  openRecvDir(): Promise<void>;
  pickDesktopFiles(): Promise<ShareResult>;
  /** 拖拽进窗口的文件绝对路径（拿不到路径时不可用） */
  addDesktopFiles(paths: string[], pos?: { x: number; y: number }): Promise<ShareResult>;
  addText(text: string, pos?: { x: number; y: number }): TransferItem;
  removeItem(id: string): Promise<void>;
  clearScope(scope: ItemScope): Promise<void>;
  copyText(text: string): boolean;
  /** 把条目复制回系统剪贴板（文本/图片/文件自动选择对应 API） */
  copyItem(id: string): void;
  /** 另存条目到用户选的位置，取消时返回 null */
  saveItem(id: string): string | null;
  /** 把图片（data URL）放到共享桌面 */
  addImage(dataUrl: string): TransferItem;
  readImage(id: string): string | null;
  readItemText(id: string): string;
  openPage(): Promise<void>;
}

declare global {
  interface Window {
    services?: Services;
  }
}
