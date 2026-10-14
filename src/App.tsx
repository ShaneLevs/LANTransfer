import { useEffect, useState } from "react";
import { ClipboardPanel } from "@/components/ClipboardPanel";
import { ReceivePanel } from "@/components/ReceivePanel";
import { ServerPanel } from "@/components/ServerPanel";
import { SharePanel } from "@/components/SharePanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { useAction } from "@/hooks/use-action";
import { useIsDark } from "@/lib/theme";
import { AlertCircle, ExternalLink, Wifi } from "lucide-react";
import type { AppState } from "@/types";

export default function App() {
  const dark = useIsDark();
  const run = useAction();
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("server");

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

  const uploads = state.items.filter((item) => item.scope === "upload").length;
  const clips = state.items.filter((item) => item.scope === "clipboard").length;
  const url = state.status.running
    ? state.status.url
    : `http://${state.displayIp}:${state.settings.port}`;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Wifi className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">局域网传输</span>
        </div>
        {state.status.running ? (
          <Badge className="bg-emerald-600 text-white">运行中</Badge>
        ) : (
          <Badge variant="secondary">已停止</Badge>
        )}
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{url}</code>
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
          <TabsTrigger value="server">服务</TabsTrigger>
          <TabsTrigger value="share">分享</TabsTrigger>
          <TabsTrigger value="receive">
            接收{uploads ? `（${uploads}）` : ""}
          </TabsTrigger>
          <TabsTrigger value="clipboard">剪贴板{clips ? `（${clips}）` : ""}</TabsTrigger>
        </TabsList>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4">
            <TabsContent value="server" className="mt-0">
              <ServerPanel state={state} />
            </TabsContent>
            <TabsContent value="share" className="mt-0">
              <SharePanel state={state} />
            </TabsContent>
            <TabsContent value="receive" className="mt-0">
              <ReceivePanel state={state} />
            </TabsContent>
            <TabsContent value="clipboard" className="mt-0">
              <ClipboardPanel state={state} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
      {toaster}
    </div>
  );
}
