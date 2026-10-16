import { useEffect, useState } from "react";
import { DesktopPanel } from "@/components/DesktopPanel";
import { ServerPanel } from "@/components/ServerPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { QrCode } from "@/components/QrCode";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { useAction } from "@/hooks/use-action";
import { useIsDark } from "@/lib/theme";
import { AlertCircle, ExternalLink, Play, QrCodeIcon, Square, Wifi } from "lucide-react";
import type { AppState } from "@/types";

export default function App() {
  const dark = useIsDark();
  const run = useAction();
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("desktop");

  useEffect(() => {
    const services = window.services;
    if (!services) return;
    try {
      setState(services.getState());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    return services.subscribe((next) => {
      setState(next);
      setError("");
    });
  }, []);

  const toaster = <Toaster theme={dark ? "dark" : "light"} position="top-center" />;

  if (!window.services) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle />
          <AlertTitle>未检测到 uTools 运行环境</AlertTitle>
          <AlertDescription>
            请通过 uTools 开发者工具打开该插件应用，否则无法调用本地能力。
          </AlertDescription>
        </Alert>
        {toaster}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle />
          <AlertTitle>插件初始化失败</AlertTitle>
          <AlertDescription>
            {error || "未能读取插件状态，请重新构建插件后再试。"}
          </AlertDescription>
        </Alert>
        {toaster}
      </div>
    );
  }

  const clips = state.items.filter((item) => item.scope === "clipboard").length;
  const url = state.status.running
    ? state.status.url
    : `http://${state.displayIp}:${state.settings.port}`;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Wifi className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{state.user ? `${state.user} 的共享桌面` : "共享桌面"}</span>
        </div>
        {state.status.running ? (
          <Badge className="bg-emerald-600 text-white">运行中</Badge>
        ) : (
          <Badge variant="secondary">已停止</Badge>
        )}
        {state.status.running ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => run(() => window.services!.stopServer(), "服务已停止")}
          >
            <Square />
            停止
          </Button>
        ) : (
          <Button size="sm" onClick={() => run(() => window.services!.startServer(), "服务已启动")}>
            <Play />
            启动服务
          </Button>
        )}
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{url}</code>
        {state.status.running ? (
          <HoverCard openDelay={100} closeDelay={80}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                aria-label="二维码"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <QrCodeIcon />
              </button>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-auto p-3">
              <div className="flex flex-col items-center gap-1.5">
                <QrCode value={url} />
                <p className="text-xs text-muted-foreground">手机扫码打开共享桌面</p>
              </div>
            </HoverCardContent>
          </HoverCard>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={!state.status.running}
          onClick={() => run(() => window.services!.openPage())}
        >
          <ExternalLink />
          浏览器打开
        </Button>
      </header>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mx-4 mt-3 w-fit">
            <TabsTrigger value="desktop">
              共享桌面{clips ? `（${clips}）` : ""}
            </TabsTrigger>
            <TabsTrigger value="server">设置</TabsTrigger>
          </TabsList>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              <TabsContent value="desktop" className="mt-0">
                <DesktopPanel state={state} />
              </TabsContent>
              <TabsContent value="server" className="mt-0">
                <ServerPanel state={state} />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      {toaster}
    </div>
  );
}
