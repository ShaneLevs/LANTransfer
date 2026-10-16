import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUp, Maximize2, Minimize2, Send } from "lucide-react";

/** Electron（uTools）下拖拽进来的文件带绝对路径 */
type PathFile = File & { path?: string };

export interface CardComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 发送一段文字 */
  onSubmitText: (text: string) => Promise<void> | void;
  /** 粘贴 / 选择的图片与文件 */
  onFiles: (files: File[]) => void;
  /** 拖拽进来且能拿到绝对路径的文件（仅插件环境） */
  onDropPaths?: (paths: string[]) => void;
  /** 传入后「选择文件」走这个回调（插件端用原生选盘对话框），否则用浏览器 file input */
  onPickFiles?: () => void;
  /** 文字卡片会放在哪里，用于提示文案 */
  placementHint?: string;
  /** 打开时就填好的文字（例如在桌面上粘贴了一段文本） */
  initialText?: string;
}

/**
 * 统一的「新建卡片」弹窗：一个输入框同时支持输入/粘贴文字、粘贴图片、选择或拖入文件。
 * 插件端与网页端共用，行为差异由回调决定。
 */
export function CardComposer({
  open,
  onOpenChange,
  onSubmitText,
  onFiles,
  onDropPaths,
  onPickFiles,
  initialText = "",
  placementHint = "会作为新卡片放到桌面上",
}: CardComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setText(initialText);
      setDragging(false);
      setExpanded(false);
      const timer = setTimeout(() => {
        const area = areaRef.current;
        if (!area) return;
        area.focus();
        area.setSelectionRange(area.value.length, area.value.length);
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [open, initialText]);

  const collect = (list: FileList | null): File[] => Array.from(list ?? []);

  const handleFiles = (files: File[]) => {
    if (!files.length) return;
    // 保持弹窗开启，方便连续粘几张图
    onFiles(files);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const files = collect(event.dataTransfer?.files ?? null);
    if (!files.length) return;
    const paths = onDropPaths
      ? files.map((file) => (file as PathFile).path).filter((p): p is string => Boolean(p))
      : [];
    if (paths.length === files.length && onDropPaths) {
      onDropPaths(paths);
      return;
    }
    handleFiles(files);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    handleFiles(files);
  };

  const submit = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await onSubmitText(content);
      setText("");
      onOpenChange(false);
    } catch {
      /* 失败提示由调用方 toast */
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          expanded
            ? "max-h-[calc(100dvh-2rem)] max-w-[min(1000px,calc(100vw-1.5rem))] grid-rows-[auto_minmax(0,1fr)_auto]"
            : ""
        }
      >
        <DialogHeader>
          <DialogTitle>新建卡片</DialogTitle>
          <DialogDescription>
            输入或粘贴文字，也可以直接 Ctrl / Cmd + V 粘贴图片，或把文件拖进来，{placementHint}。
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <textarea
            ref={areaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onPaste={handlePaste}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="写点什么，或粘贴图片 / 拖入文件…"
            className={
              "w-full flex-1 resize-none rounded-lg border bg-background p-3 pr-11 text-sm outline-none transition-colors " +
              (expanded ? "min-h-[45dvh]" : "min-h-32") +
              (dragging ? " border-primary ring-2 ring-primary/30" : " focus:border-primary/60")
            }
          />
          {/* 右上角：放大 / 还原输入框 */}
          <button
            type="button"
            title={expanded ? "还原窗口" : "放大窗口"}
            onClick={() => setExpanded((value) => !value)}
            className="absolute top-2 right-2 z-10 rounded-md border bg-background/90 p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
          {dragging ? (
            <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              松手就放进来
            </span>
          ) : null}
        </div>

        <DialogFooter className="justify-between">
          <span className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => (onPickFiles ? onPickFiles() : fileRef.current?.click())}
            >
              <FileUp />
              选择文件
            </Button>
            {onPickFiles ? null : (
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  handleFiles(collect(event.target.files));
                  event.target.value = "";
                }}
              />
            )}
          </span>
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button size="sm" disabled={!text.trim() || sending} onClick={() => void submit()}>
              <Send />
              发送文字
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
