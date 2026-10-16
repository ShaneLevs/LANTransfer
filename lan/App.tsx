import { useCallback, useEffect, useMemo, useState } from "react";
import { CardStandalone } from "@lan/components/CardDetail";
import { DesktopCanvas } from "@lan/components/DesktopCanvas";
import { DesktopPanel } from "@lan/components/DesktopPanel";
import { GuestNameDialog } from "@lan/components/GuestNameDialog";
import { fetchState, subscribe } from "@lan/lib/api";
import { getGuestName } from "@lan/lib/guest";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Toaster } from "@/components/ui/sonner";
import { useIsDark } from "@/lib/theme";
import { AlertCircle, Loader2, UserRound } from "lucide-react";
import type { LanClientState } from "@/types";

/** 电脑浏览器 = 可随意拖排的桌面；手机 / 平板 = 列表 */
const CANVAS_QUERY = "(min-width: 768px) and (pointer: fine)";

function usePrefersCanvas() {
  const [prefers, setPrefers] = useState(() => window.matchMedia(CANVAS_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(CANVAS_QUERY);
    const onChange = () => setPrefers(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return prefers;
}

export default function App() {
  const dark = useIsDark();
  const [state, setState] = useState<LanClientState | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // 访客昵称：没有时首次弹一次引导；点 header 名字可再改
  const [guest, setGuest] = useState(() => getGuestName());
  const [nameDialogOpen, setNameDialogOpen] = useState(() => !getGuestName());
  // ?card=<id> 是单卡片分享链接，只展示那一条内容
  const cardId = useMemo(() => new URLSearchParams(window.location.search).get("card"), []);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchState();
      setState(next);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return subscribe({ onChanged: () => void refresh(), onStatus: setOnline });
  }, [refresh]);

  const user = state?.user || "主机";
  const items = state?.items ?? [];
  const prefersCanvas = usePrefersCanvas();
  const shared = cardId ? items.find((item) => item.id === cardId) ?? null : null;

  // 浏览器标签页标题也带上主机用户名
  useEffect(() => {
    if (state?.user) document.title = `${state.user} 的共享桌面`;
  }, [state?.user]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/70 px-3 py-2.5 backdrop-blur-xl sm:px-4">
        <span className="min-w-0 truncate text-sm font-semibold">{user} 的共享桌面</span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <span className={"size-2 rounded-full " + (online ? "bg-emerald-500" : "bg-amber-500")} />
          {online ? "已连接" : "重连中"}
        </span>
        {!cardId && items.length ? (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{items.length} 项</span>
        ) : null}
        {!cardId ? (
          <button
            type="button"
            title={guest ? "点击修改昵称" : "设置昵称，放上桌面的内容会署你的名"}
            onClick={() => setNameDialogOpen(true)}
            className={
              "ml-auto flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors hover:bg-accent " +
              (guest ? "text-muted-foreground" : "border-primary/40 text-primary")
            }
          >
            <UserRound className="size-3.5" />
            {guest || "设昵称"}
          </button>
        ) : null}
      </header>

      <GuestNameDialog
        open={nameDialogOpen}
        onOpenChange={setNameDialogOpen}
        onSaved={setGuest}
        dismissable={Boolean(guest)}
      />

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          正在连接…
        </div>
      ) : error && !state ? (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>无法连接这台电脑</AlertTitle>
            <AlertDescription>{error}，请确认服务仍在运行。</AlertDescription>
          </Alert>
        </div>
      ) : cardId ? (
        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto w-full max-w-2xl">
            {shared ? (
              <CardStandalone item={shared} />
            ) : (
              <Alert>
                <AlertTitle>这张卡片不存在</AlertTitle>
                <AlertDescription>可能已被删除或超过了保留天数。</AlertDescription>
              </Alert>
            )}
          </div>
        </main>
      ) : prefersCanvas ? (
        <main className="min-h-0 flex-1 p-2 sm:p-3">
          <DesktopCanvas items={items} />
        </main>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
          <div className="mx-auto w-full max-w-2xl">
            <DesktopPanel items={items} />
          </div>
        </main>
      )}

      <Toaster theme={dark ? "dark" : "light"} position="top-center" />
    </div>
  );
}
