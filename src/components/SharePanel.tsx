import { useState } from "react";
import { toast } from "sonner";
import { ItemRow } from "@/components/ItemRow";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { ClipboardPaste, Eraser, FolderOpen, Link, Share2 } from "lucide-react";
import type { AppState, ShareResult } from "@/types";

const CLIPBOARD_KIND_LABEL = { text: "文字", image: "图片", file: "文件" } as const;

export function SharePanel({ state }: { state: AppState }) {
  const run = useAction();
  const [text, setText] = useState("");
  const { items, settings, status, displayIp } = state;
  const shared = items.filter((item) => item.scope === "shared");
  const baseUrl = status.running ? status.url : `http://${displayIp}:${settings.port}`;

  const reportShare = (result: ShareResult, emptyMessage: string) => {
    if (!result.count) {
      toast.info(emptyMessage);
      return;
    }
    const extra = result.skipped ? `，跳过 ${result.skipped} 个文件夹` : "";
    toast.success(`已分享 ${result.count} 个文件${extra}`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>分享给局域网设备</CardTitle>
          <CardDescription>
            分享的文件会复制到接收目录，网页端的「文件」列表里可以下载。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                run(() => window.services!.shareFiles()).then((result) => {
                  if (result) reportShare(result, "未选择文件");
                })
              }
            >
              <Share2 />
              选择文件分享
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                run(() => window.services!.shareSystemClipboard()).then((result) => {
                  if (result) {
                    toast.success(`已把剪贴板中的${CLIPBOARD_KIND_LABEL[result.kind]}发到共享剪贴板`);
                  }
                })
              }
            >
              <ClipboardPaste />
              分享系统剪贴板
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                "输入或粘贴要共享给所有人的文字，Ctrl / Cmd + Enter 发送\n" +
                "提示：粘贴图片请到「共享剪贴板」页，支持 Ctrl / Cmd + V 直接粘贴图片"
              }
              className="min-h-24"
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  sendText();
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                这里只能发文字；图片和文件请用上方按钮或到「共享剪贴板」页操作
              </p>
              <Button
                disabled={!text.trim()}
                onClick={sendText}
              >
                发送文本
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>已分享的文件（{shared.length}）</span>
            {shared.length ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => run(() => window.services!.clearScope("shared"), "已清空分享列表")}
              >
                <Eraser />
                清空
              </Button>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {shared.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              还没有分享文件，点击上面的「选择文件分享」添加。
            </p>
          ) : (
            shared.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                actions={
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        run(() => {
                          if (!window.services!.copyText(`${baseUrl}/api/file/${item.id}`)) {
                            throw new Error("复制失败");
                          }
                        }, "下载链接已复制")
                      }
                    >
                      <Link />
                      链接
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.services!.revealItem(item.id)}>
                      <FolderOpen />
                      显示
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => run(() => window.services!.removeItem(item.id), "已删除")}
                    >
                      删除
                    </Button>
                  </>
                }
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );

  function sendText() {
    const content = text.trim();
    if (!content) return;
    run(() => window.services!.addText(content), "已发送到共享剪贴板").then((item) => {
      if (item) setText("");
    });
  }
}
