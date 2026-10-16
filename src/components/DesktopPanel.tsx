import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { useAction } from "@/hooks/use-action";
import { formatBytes } from "@/lib/format";
import { Eraser, Plus } from "lucide-react";
import type { AppState, TransferItem } from "@/types";

const thumbnailCache = new Map<string, string>();

function ImageThumb({ id }: { id: string }) {
  const [src, setSrc] = useState<string | undefined>(() => thumbnailCache.get(id));

  useEffect(() => {
    if (src !== undefined) return;
    const data = window.services?.readImage(id) ?? null;
    if (data) {
      thumbnailCache.set(id, data);
      setSrc(data);
    }
  }, [id, src]);

  if (!src) {
    return <div className="mt-2 h-16 w-24 animate-pulse rounded-md bg-muted" />;
  }
  return <img src={src} alt="" className="mt-2 max-h-24 rounded-md border object-contain" />;
}

/** 插件端列表视图（可拖拽的桌面布局只在电脑浏览器里出现） */
export function DesktopPanel({ state }: { state: AppState }) {
  const run = useAction();
  const [composerOpen, setComposerOpen] = useState(false);
  const clips = state.items.filter((item) => item.scope === "clipboard");

  // 插件窗口里 Ctrl/Cmd+V 粘图片，直接成为桌面卡片（输入框里的粘贴交给弹窗自己处理，避免重复）
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) {
        return;
      }
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (!files.length) return;
      event.preventDefault();
      void pushImages(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const pushImages = async (files: File[]) => {
    for (const file of files) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("读取图片失败"));
          reader.readAsDataURL(file);
        });
        window.services!.addImage(dataUrl);
        toast.success("图片已放到桌面");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "图片发送失败");
      }
    }
  };

  /** 弹窗里选择的文件：图片走 dataURL，其它文件请改用原生选择（拖拽可能拿不到路径） */
  const handleFiles = (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    const others = files.filter((file) => !file.type.startsWith("image/"));
    if (images.length) void pushImages(images);
    if (others.length) {
      toast.info("请用「选择文件」添加非图片文件（拖拽拿不到本地路径）");
    }
  };

  const handleDropPaths = (paths: string[]) => {
    run(() => window.services!.addDesktopFiles(paths), "已放到桌面");
  };

  const copyLink = (item: TransferItem) => {
    const base = state.status.url;
    if (!base) {
      toast.error("请先在「设置」页启动服务，才能生成分享链接");
      return;
    }
    run(() => {
      if (!window.services!.copyText(`${base}/?card=${encodeURIComponent(item.id)}`)) {
        throw new Error("复制失败");
      }
    }, "卡片链接已复制");
  };

  const copyContent = (item: TransferItem) => {
    run(() => window.services!.copyItem(item.id), "已复制到系统剪贴板");
  };

  /** 图片 / 文件的「下载」：弹系统保存对话框（取消则不提示） */
  const saveContent = (item: TransferItem) => {
    void run(() => {
      const target = window.services!.saveItem(item.id);
      if (target) toast.success(`已保存到 ${target}`);
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>共享桌面（{clips.length}）</span>
            <span className="flex gap-1">
              <Button size="sm" onClick={() => setComposerOpen(true)}>
                <Plus />
                新建卡片
              </Button>
              {clips.length ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => run(() => window.services!.clearScope("clipboard"), "已清空共享桌面")}
                >
                  <Eraser />
                  清空
                </Button>
              ) : null}
            </span>
          </CardTitle>
          <CardDescription>
            {state.user ? state.user + " 的桌面" : "本机桌面"}：内容保存到磁盘，超过 {state.settings.retentionDays} 天自动清理；
            也可以直接 Ctrl / Cmd + V 粘贴图片。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {clips.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              桌面还是空的，点「新建卡片」写文字、粘图片或放文件。
            </p>
          ) : (
            clips.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                preview={
                  item.kind === "text" ? (
                    <p className="line-clamp-4 whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                      {item.preview || "（空）"}
                    </p>
                  ) : item.kind === "image" ? (
                    <ImageThumb id={item.id} />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(item.size)}</span>
                    </div>
                  )
                }
                actions={
                  <>
                    {item.kind === "text" || item.kind === "image" ? (
                      <Button variant="outline" size="sm" onClick={() => copyContent(item)}>
                        复制
                      </Button>
                    ) : null}
                    {item.kind !== "text" ? (
                      <Button variant="outline" size="sm" onClick={() => saveContent(item)}>
                        下载
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={() => copyLink(item)}>
                      复制链接
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => run(() => window.services!.removeItem(item.id), "已移入回收站")}
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

      <CardComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onSubmitText={(text) => {
          run(() => window.services!.addText(text), "已放到桌面");
        }}
        onFiles={handleFiles}
        onDropPaths={handleDropPaths}
        onPickFiles={() =>
          run(() => window.services!.pickDesktopFiles()).then((result) => {
            if (result?.count) {
              const extra = result.skipped ? `，跳过 ${result.skipped} 个文件夹` : "";
              toast.success(`已放 ${result.count} 个文件到桌面${extra}`);
            }
          })
        }
        placementHint="会作为新卡片放到桌面，网页端立刻可见"
      />
    </>
  );
}
