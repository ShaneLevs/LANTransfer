import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { fetchText } from "@lan/lib/api";
import { copyImageByUrl, copyText } from "@lan/lib/clipboard";
import { Button } from "@/components/ui/button";
import { ItemMeta } from "@/components/ItemCard";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes } from "@/lib/format";
import type { TransferItem } from "@/types";
import { Check, Copy, Download, Link as LinkIcon } from "lucide-react";

export { ItemMeta };

/** 分享链接专用：只看这一张卡片，内容全部展开 */
export function CardStandalone({ item }: { item: TransferItem }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <ItemMeta item={item} />
      <div className="mt-3">
        <CardBody item={item} mode="full" />
      </div>
      <CardActions className="mt-3" item={item} />
    </div>
  );
}

const textCache = new Map<string, string>();

/** 放大查看里的图片：默认适应窗口，点一下切换原始尺寸（可滚动） */
function FullImage({ item }: { item: TransferItem }) {
  const [actual, setActual] = useState(false);
  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="flex min-h-0 w-full flex-1 justify-center overflow-auto rounded-lg bg-muted/40 p-2">
        <img
          src={`/api/file/${item.id}?inline=1`}
          alt={item.name}
          draggable={false}
          onClick={() => setActual((value) => !value)}
          className={
            "shrink-0 rounded-md border bg-white " +
            (actual
              ? "cursor-zoom-out"
              : "max-h-full w-auto max-w-full cursor-zoom-in object-contain")
          }
        />
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">
        {actual ? "已显示原始尺寸，可拖动查看；点图片还原" : "点图片可切换到原始尺寸"}
      </p>
    </div>
  );
}

/** 单卡片分享链接：拿到链接的人只看到这一张卡片 */
export function cardUrl(id: string): string {
  return `${location.origin}${location.pathname}?card=${encodeURIComponent(id)}`;
}

function FullText({ id, preview }: { id: string; preview?: string }) {
  const [content, setContent] = useState<string | undefined>(() => textCache.get(id));

  useEffect(() => {
    if (content !== undefined) return;
    let alive = true;
    fetchText(id)
      .then((value) => {
        textCache.set(id, value);
        if (alive) setContent(value);
      })
      .catch(() => {
        if (alive) setContent(preview || "");
      });
    return () => {
      alive = false;
    };
  }, [content, id, preview]);

  if (content === undefined) {
    return <p className="text-sm text-muted-foreground">{preview || "正在读取…"}</p>;
  }
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-6">{content}</p>
  );
}

/**
 * 卡片内容。
 * mode = "preview" 列表/桌面里的缩略；"full" 放大查看（文字显示全部内容）。
 */
export function CardBody({
  item,
  mode = "preview",
  onExpand,
}: {
  item: TransferItem;
  mode?: "preview" | "full";
  onExpand?: () => void;
}) {
  if (item.kind === "text") {
    if (mode === "full") return <FullText id={item.id} preview={item.preview} />;
    return (
      <p className="line-clamp-6 whitespace-pre-wrap break-words text-sm">
        {item.preview || "（空内容）"}
      </p>
    );
  }

  if (item.kind === "image") {
    if (mode === "full") return <FullImage item={item} />;
    return (
      <img
        src={`/api/file/${item.id}?inline=1`}
        alt={item.name}
        loading="lazy"
        draggable={false}
        onClick={onExpand}
        className="max-h-40 w-full cursor-zoom-in rounded-md border object-contain"
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={item.name}>
        {item.name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(item.size)}</span>
    </div>
  );
}

/**
 * 卡片操作按钮：文字=复制，文件=下载，图片=两者；外加复制链接；网页端不提供删除。
 */
export function CardActions({
  item,
  onDelete,
  className = "",
}: {
  item: TransferItem;
  /** 只有插件端能删除，网页端传 undefined 就不显示 */
  onDelete?: () => void;
  className?: string;
}) {
  const [copied, setCopied] = useState<"" | "text" | "image" | "link">("");

  const flash = (kind: "text" | "image" | "link") => {
    setCopied(kind);
    setTimeout(() => setCopied(""), 1600);
  };

  const copyTextContent = async () => {
    try {
      const content = await fetchText(item.id);
      if (await copyText(content)) flash("text");
      else toast.error("当前浏览器不支持自动复制，请长按选择文本");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制失败");
    }
  };

  const copyImageContent = async () => {
    if (await copyImageByUrl(`/api/file/${item.id}?inline=1`)) flash("image");
    else toast.error("浏览器不允许在此地址复制图片，请下载或长按保存");
  };

  const copyLink = async () => {
    const url = cardUrl(item.id);
    if (await copyText(url)) flash("link");
    else toast.error("复制失败，请手动选择地址");
  };

  const icon = (active: boolean, fallback: ReactNode) => (active ? <Check className="size-3.5" /> : fallback);

  return (
    <div className={"flex flex-wrap items-center gap-1.5 " + className}>
      {item.kind === "text" ? (
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void copyTextContent()}>
          {icon(copied === "text", <Copy className="size-3.5" />)}
          {copied === "text" ? "已复制" : "复制"}
        </Button>
      ) : null}

      {item.kind === "image" ? (
        <>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void copyImageContent()}>
            {icon(copied === "image", <Copy className="size-3.5" />)}
            {copied === "image" ? "已复制" : "复制"}
          </Button>
          <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
            <a href={`/api/file/${item.id}`} download={item.name}>
              <Download className="size-3.5" />
              下载
            </a>
          </Button>
        </>
      ) : null}

      {item.kind === "file" ? (
        <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
          <a href={`/api/file/${item.id}`} download={item.name}>
            <Download className="size-3.5" />
            下载
          </a>
        </Button>
      ) : null}

      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void copyLink()}>
        {icon(copied === "link", <LinkIcon className="size-3.5" />)}
        {copied === "link" ? "已复制" : "复制链接"}
      </Button>

      {onDelete ? (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onDelete}>
          删除
        </Button>
      ) : null}
    </div>
  );
}

/** 放大查看弹窗：文字显示全部内容，图片显示大图 */
export function CardViewerDialog({
  item,
  onClose,
}: {
  item: TransferItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[min(1100px,calc(100vw-1.5rem))] grid-rows-[auto_minmax(0,1fr)_auto]">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8 break-all">
                {item.kind === "file" ? item.name : item.kind === "image" ? "图片" : "文字"}
              </DialogTitle>
              <ItemMeta item={item} />
            </DialogHeader>
            <div className="min-h-0 overflow-y-auto">
              <CardBody item={item} mode="full" />
            </div>
            <DialogFooter>
              <CardActions item={item} />
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
