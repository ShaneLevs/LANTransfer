import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { AlertCircle, Copy, ExternalLink, FolderOpen, Play, Square } from "lucide-react";
import type { AppState } from "@/types";

const ALL_INTERFACES = "__all__";

export function ServerPanel({ state }: { state: AppState }) {
  const run = useAction();
  const { settings, status, ips, displayIp } = state;
  const url = status.running ? status.url : `http://${displayIp}:${settings.port}`;

  const [bindIp, setBindIp] = useState(settings.bindIp);
  const [port, setPort] = useState(String(settings.port));
  const [retentionDays, setRetentionDays] = useState(String(settings.retentionDays));

  useEffect(() => {
    setBindIp(settings.bindIp);
    setPort(String(settings.port));
    setRetentionDays(String(settings.retentionDays));
  }, [settings.bindIp, settings.port, settings.retentionDays]);

  const dirty =
    bindIp !== settings.bindIp ||
    Number(port) !== settings.port ||
    Number(retentionDays) !== settings.retentionDays;

  const save = () => {
    const portValue = Number(port);
    if (!Number.isInteger(portValue) || portValue < 1024 || portValue > 65535) {
      toast.error("端口需要是 1024 - 65535 之间的整数");
      return;
    }
    const days = Number(retentionDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      toast.error("共享桌面保留天数需要是 1 - 365 之间的整数");
      return;
    }
    run(
      () => window.services!.updateSettings({ bindIp, port: portValue, retentionDays: days }),
      "设置已保存"
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            服务状态
            {status.running ? (
              <Badge className="bg-emerald-600 text-white">运行中</Badge>
            ) : (
              <Badge variant="secondary">已停止</Badge>
            )}
          </CardTitle>
          <CardDescription>
            局域网内的设备打开下面的地址，就能一起使用这块共享桌面（电脑端可随意拖拽缩放，手机上是列表）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-sm">{url}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                run(() => {
                  if (!window.services!.copyText(url)) throw new Error("复制失败");
                }, "访问地址已复制")
              }
            >
              <Copy />
              复制地址
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!status.running}
              onClick={() => run(() => window.services!.openPage())}
            >
              <ExternalLink />
              浏览器打开
            </Button>
          </div>

          {status.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>启动失败</AlertTitle>
              <AlertDescription>{status.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center gap-2">
            {status.running ? (
              <Button variant="destructive" onClick={() => run(() => window.services!.stopServer(), "服务已停止")}>
                <Square />
                停止服务
              </Button>
            ) : (
              <Button onClick={() => run(() => window.services!.startServer(), "服务已启动")}>
                <Play />
                启动服务
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>设置</CardTitle>
          <CardDescription>修改端口或监听地址后，运行中的服务会自动重启。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="bind-ip">监听地址</Label>
              <Select
                value={bindIp || ALL_INTERFACES}
                onValueChange={(value) => setBindIp(value === ALL_INTERFACES ? "" : value)}
              >
                <SelectTrigger id="bind-ip" className="w-full">
                  <SelectValue placeholder="全部网卡" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_INTERFACES}>全部网卡</SelectItem>
                  {ips.map((ip) => (
                    <SelectItem key={ip.address} value={ip.address}>
                      {ip.address}（{ip.name}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="port">端口</Label>
              <Input
                id="port"
                inputMode="numeric"
                value={port}
                onChange={(event) => setPort(event.target.value.replace(/[^\d]/g, ""))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="retention">共享桌面保留天数</Label>
              <Input
                id="retention"
                inputMode="numeric"
                value={retentionDays}
                onChange={(event) => setRetentionDays(event.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>存储目录</Label>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-muted/60 px-3 py-2 font-mono text-xs">
                {settings.recvDir}
              </code>
              <Button variant="outline" size="sm" onClick={() => run(() => window.services!.pickRecvDir(), "存储目录已更新")}>
                <FolderOpen />
                选择目录
              </Button>
              <Button variant="outline" size="sm" onClick={() => run(() => window.services!.openRecvDir())}>
                打开目录
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              桌面上的文字、图片与文件都直接保存在这个目录里（旧版本 LANTransfer 目录及其 shared、uploads
              子目录里的旧文件仍可下载，可自行清理）。
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-start">自动启动服务</Label>
              <p className="text-xs text-muted-foreground">插件应用加载后自动开启局域网服务。</p>
            </div>
            <Switch
              id="auto-start"
              checked={settings.autoStart}
              onCheckedChange={(checked) => run(() => window.services!.updateSettings({ autoStart: checked }))}
            />
          </div>

          <div className="flex justify-end">
            <Button disabled={!dirty} onClick={save}>
              保存设置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
