import { useCallback, useEffect, useState } from "react";
import { ClipboardPanel } from "@lan/components/ClipboardPanel";
import { FilesPanel } from "@lan/components/FilesPanel";
import { UploadPanel } from "@lan/components/UploadPanel";
import { fetchState, subscribe } from "@lan/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsDark } from "@/lib/theme";
import { AlertCircle, ArrowDownToLine, ClipboardPaste, Loader2, Upload } from "lucide-react";
import type { LanClientState } from "@/types";

const TAB_ITEMS = [
  { value: "files", label: "文件", icon: ArrowDownToLine },
  { value: "upload", label: "上传", icon: Upload },
  { value: "clipboard", label: "剪贴板", icon: ClipboardPaste },
] as const;

export default function App() {
  const dark = useIsDark();
  const [state, setState] = useState<LanClientState | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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

  const items = state?.items ?? [];
  const shared = items.filter((item) => item.scope === "shared");
  const clips = items.filter((item) => item.scope === "clipboard");
  const host = state?.host || "主机";
  const [tab, setTab] = useState<string>("files");
  const counts: Record<string, number> = { files: shared.length, clipboard: clips.length };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3 sm:px-6">
          <span className="truncate text-sm font-semibold">{host} 的局域网传输</span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <span
              className={
                "size-2 rounded-full " + (online ? "bg-emerald-500" : "bg-amber-500")
              }
            />
            {online ? "已连接" : "重连中"}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在连接…
          </div>
        ) : error && !state ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>无法连接这台电脑</AlertTitle>
            <AlertDescription>{error}，请确认服务仍在运行。</AlertDescription>
          </Alert>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsContent value="files" className="mt-0">
              <FilesPanel items={shared} host={host} />
            </TabsContent>
            <TabsContent value="upload" className="mt-0">
              <UploadPanel />
            </TabsContent>
            <TabsContent value="clipboard" className="mt-0">
              <ClipboardPanel items={clips} />
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* 底部导航：移动端贴底悬浮，桌面端居中悬浮条，均带高斯模糊 */}
      {state ? (
        <nav className="fixed inset-x-0 bottom-0 z-20 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto w-full max-w-4xl px-3 pb-3 sm:px-6 sm:pb-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mx-auto !h-[50px] flex w-full max-w-md rounded-full bg-background/70 p-1.5 shadow-lg shadow-black/5 backdrop-blur-xl group-data-horizontal/tabs:h-[50px]">
                {TAB_ITEMS.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="h-full flex-row gap-1.5 rounded-full border-0 px-4 text-sm shadow-none after:hidden data-active:border-0 data-active:bg-muted data-active:shadow-none dark:data-active:border-0 dark:data-active:bg-muted/60 dark:data-active:shadow-none"
                  >
                    <Icon className="size-4.5" />
                    <span>{label}</span>
                    {counts[value] ? (
                      <span className="text-xs text-muted-foreground">{counts[value]}</span>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </nav>
      ) : null}

      <Toaster theme={dark ? "dark" : "light"} position="top-center" />
    </div>
  );
}
