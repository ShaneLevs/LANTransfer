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
  preview?: string;
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
  status: ServerStatus;
  items: TransferItem[];
  dataDir: string;
}

export interface LanClientState {
  host: string;
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
  shareFiles(): Promise<ShareResult>;
  shareClipboardFiles(): Promise<ShareResult>;
  shareSystemClipboard(): { kind: "text" | "image" | "file"; count: number };
  addText(text: string): TransferItem;
  removeItem(id: string): Promise<void>;
  clearScope(scope: ItemScope): Promise<void>;
  revealItem(id: string): void;
  openItem(id: string): void;
  copyText(text: string): boolean;
  /** 把条目复制回系统剪贴板（文本/图片/文件自动选择对应 API） */
  copyItem(id: string): void;
  /** 把图片（data URL）分享到共享剪贴板 */
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
