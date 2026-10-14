import { useEffect, useRef, useState } from "react";
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
import { useAction } from "@/hooks/use-action";
import { Copy, Eraser, ExternalLink, FileUp, FolderOpen, ImagePlus, Trash2 } from "lucide-react";
import type { AppState } from "@/types";

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

export function ClipboardPanel({ state }: { state: AppState }) {
  const run = useAction();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const clips = state.items.filter((item) => item.scope === "clipboard");

  // 支持直接在插件窗口里 Ctrl/Cmd+V 粘贴图片（图片会发到共享剪贴板）
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
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
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "图片分享失败");
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>共享剪贴板（{clips.length}）</span>
          <span className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => imageInputRef.current?.click()}
            >
              <ImagePlus />
              选择图片
            </Button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void pushImages(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                run(() => window.services!.shareClipboardFiles()).then((result) => {
                  if (result?.count) {
                    const extra = result.skipped ? `，跳过 ${result.skipped} 个文件夹` : "";
                    toast.success(`已分享 ${result.count} 个文件${extra}`);
                  }
                })
              }
            >
              <FileUp />
              选择文件
            </Button>
            {clips.length ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => run(() => window.services!.clearScope("clipboard"), "已清空共享剪贴板")}
              >
                <Eraser />
                清空
              </Button>
            ) : null}
          </span>
        </CardTitle>
        <CardDescription>
          这里的内容所有打开网页的人都能看到，超过保留天数（{state.settings.retentionDays} 天）会自动清理。
          点「分享系统剪贴板」或直接 Ctrl / Cmd + V 把文字、图片、文件发过来。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {clips.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            还没有共享内容，可点上方「选择图片」「选择文件」，或在分享页点「分享系统剪贴板」。
          </p>
        ) : (
          clips.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              extra={
                item.kind === "text" ? (
                  <p className="mt-2 max-h-20 overflow-hidden whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                    {item.preview || "（空）"}
                  </p>
                ) : item.kind === "image" ? (
                  <ImageThumb id={item.id} />
                ) : null
              }
              actions={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      run(() => window.services!.copyItem(item.id), "已复制到系统剪贴板")
                    }
                  >
                    <Copy />
                    复制
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => window.services!.openItem(item.id)}>
                    <ExternalLink />
                    打开
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => window.services!.revealItem(item.id)}>
                    <FolderOpen />
                    显示
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => run(() => window.services!.removeItem(item.id), "已移入回收站")}
                  >
                    <Trash2 />
                    删除
                  </Button>
                </>
              }
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
