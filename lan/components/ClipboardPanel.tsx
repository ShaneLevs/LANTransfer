import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchText, sendText, uploadFile } from "@lan/lib/api";
import { copyText } from "@lan/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, formatTime } from "@/lib/format";
import type { TransferItem } from "@/types";
import { Copy, Download, ExternalLink, FileUp, Loader2, Send } from "lucide-react";

function collectFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  if (files.length) return files;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

export function ClipboardPanel({ items }: { items: TransferItem[] }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const pushFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploading((count) => count + files.length);
    await Promise.all(
      files.map(async (file) => {
        try {
          await uploadFile(file, {
            kind: file.type.startsWith("image/") ? "image" : "file",
            toClipboard: true,
          });
          toast.success(`${file.name || "内容"} 已共享给所有人`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "共享失败");
        } finally {
          setUploading((count) => Math.max(0, count - 1));
        }
      })
    );
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = collectFiles(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      void pushFiles(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [pushFiles]);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setSending(true);
    try {
      await sendText(content);
      setText("");
      toast.success("已共享给所有人");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发送失败");
    } finally {
      setSending(false);
    }
  };

  const copy = async (item: TransferItem) => {
    try {
      const content = await fetchText(item.id);
      const ok = await copyText(content);
      if (ok) toast.success("已复制到剪贴板");
      else toast.error("当前浏览器不支持自动复制，请长按选择文本");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制失败");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>共享剪贴板</CardTitle>
          <CardDescription>
            粘贴文字、截图或文件后所有人立刻可见，也可以复制别人的内容。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="输入或粘贴要共享的文字…"
            className="min-h-24"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <FileUp />
                选择文件
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  void pushFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
              {uploading ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  正在共享 {uploading} 个文件
                </span>
              ) : null}
            </div>
            <Button disabled={!text.trim() || sending} onClick={send}>
              <Send />
              发送
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>共享内容（{items.length}）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              还没有共享内容，粘贴一段文字或一张图片试试。
            </p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {item.from ? `来自 ${item.from} · ` : ""}
                    {formatTime(item.time)}
                    {item.kind === "file" ? ` · ${formatBytes(item.size)}` : ""}
                  </span>
                  {item.kind === "text" ? (
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => void copy(item)}>
                      <Copy />
                      复制
                    </Button>
                  ) : item.kind === "image" ? (
                    <Button asChild variant="outline" size="sm" className="shrink-0">
                      <a href={`/api/file/${item.id}?inline=1`} target="_blank" rel="noreferrer">
                        <ExternalLink />
                        查看
                      </a>
                    </Button>
                  ) : (
                    <Button asChild variant="outline" size="sm" className="shrink-0">
                      <a href={`/api/file/${item.id}`}>
                        <Download />
                        下载
                      </a>
                    </Button>
                  )}
                </div>

                {item.kind === "text" ? (
                  <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm">
                    {item.preview || "（空内容）"}
                  </p>
                ) : item.kind === "image" ? (
                  <img
                    src={`/api/file/${item.id}?inline=1`}
                    alt={item.name}
                    loading="lazy"
                    className="mt-2 max-h-64 w-auto rounded-md border"
                  />
                ) : (
                  <p className="mt-2 text-sm font-medium">{item.name}</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
