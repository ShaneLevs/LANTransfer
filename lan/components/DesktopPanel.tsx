import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CardActions, CardBody, CardViewerDialog } from "@lan/components/CardDetail";
import { sendText, uploadFile } from "@lan/lib/api";
import { CardComposer } from "@/components/CardComposer";
import { ItemCard } from "@/components/ItemCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Maximize2, Plus } from "lucide-react";
import type { TransferItem } from "@/types";

/** 手机 / 平板上的共享桌面：列表视图，卡片信息与桌面端一致 */
export function DesktopPanel({ items }: { items: TransferItem[] }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);

  const pushFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const failed: string[] = [];
    await Promise.all(
      files.map((file) =>
        uploadFile(file, { kind: file.type.startsWith("image/") ? "image" : "file" }).catch(() => {
          failed.push(file.name || "内容");
        })
      )
    );
    if (failed.length === files.length) {
      toast.error("上传失败，请重试");
      return;
    }
    toast.success(files.length > 1 ? `已放 ${files.length - failed.length} 个文件到桌面` : "已放到桌面");
  }, []);

  /** 手机上粘贴图片/文件直接成卡片 */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      void pushFiles(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [pushFiles]);

  const viewerItem = viewerId ? items.find((item) => item.id === viewerId) ?? null : null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>共享桌面（{items.length}）</span>
            <Button size="sm" onClick={() => setComposerOpen(true)}>
              <Plus />
              新建卡片
            </Button>
          </CardTitle>
          <CardDescription>粘贴或发送的文字、图片、文件所有人立刻可见，点卡片可放大查看。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              桌面还是空的，点「新建卡片」或粘贴内容试试。
            </p>
          ) : (
            items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                preview={<CardBody item={item} />}
                onClick={item.kind === "file" ? undefined : () => setViewerId(item.id)}
                actions={
                  <>
                    <CardActions item={item} />
                    {item.kind !== "file" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          setViewerId(item.id);
                        }}
                      >
                        <Maximize2 className="size-3.5" />
                        查看
                      </Button>
                    ) : null}
                  </>
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <CardComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onSubmitText={(text) =>
          sendText(text).then(() => {
            toast.success("已放到桌面");
          })
        }
        onFiles={(files) => void pushFiles(files)}
      />

      <CardViewerDialog item={viewerItem} onClose={() => setViewerId(null)} />
    </>
  );
}
