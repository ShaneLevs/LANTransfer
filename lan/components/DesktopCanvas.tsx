import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { moveItem, sendText, uploadFile } from "@lan/lib/api";
import { CardActions, CardBody, CardViewerDialog } from "@lan/components/CardDetail";
import { CardComposer } from "@/components/CardComposer";
import { ItemMeta } from "@/components/ItemCard";
import { Button } from "@/components/ui/button";
import type { TransferItem } from "@/types";
import { Grid2x2, Maximize, Plus, ZoomIn, ZoomOut } from "lucide-react";

/** 桌面卡片的名义宽度与自动排布间距（世界坐标），与服务端默认网格一致 */
const CARD_W = 320;
const GAP_X = 360;
const GAP_Y = 240;
const PER_ROW = 5;
const MIN_K = 0.2;
const MAX_K = 3;

type Pos = { x: number; y: number };
type View = { x: number; y: number; k: number };

function gridPos(index: number): Pos {
  return { x: 60 + (index % PER_ROW) * GAP_X, y: 60 + Math.floor(index / PER_ROW) * GAP_Y };
}

function collectFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  if (files.length) return files;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

type Gesture =
  | { mode: "pan"; startX: number; startY: number; origin: View }
  | { mode: "card"; id: string; startX: number; startY: number; origin: Pos; moved: boolean }
  | null;

/** 共享桌面：可平移缩放的桌面（电脑浏览器专用） */
export function DesktopCanvas({ items }: { items: TransferItem[] }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>(null);

  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // 拖动中的临时坐标：松手写回服务端，其它端广播后以服务端为准
  const [overrides, setOverrides] = useState<Record<string, Pos>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  const entries = useMemo(() => {
    // 没有坐标的老条目按旧→新补网格；新条目自带服务端坐标，不会吃掉补位序号，位置不随新内容漂移
    const legacyCount = items.filter((item) => !Number.isFinite(item.x) || !Number.isFinite(item.y)).length;
    let legacySeen = 0;
    return items.map((item, index) => {
      const positioned = Number.isFinite(item.x) && Number.isFinite(item.y);
      const slot = positioned ? 0 : legacyCount - 1 - legacySeen++;
      return {
        item,
        pos: overrides[item.id] ?? (positioned ? { x: item.x!, y: item.y! } : gridPos(slot)),
        // items 是新→旧，后插入 DOM 的会盖住先插入的，给新条目更高 z 避免被老卡片压住
        z: items.length - index,
      };
    });
  }, [items, overrides]);

  /** 屏幕坐标 → 世界坐标 */
  const toWorld = useCallback((clientX: number, clientY: number): Pos => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - (rect?.left ?? 0) - v.x) / v.k, y: (clientY - (rect?.top ?? 0) - v.y) / v.k };
  }, []);

  const viewportCenter = useCallback(
    (): Pos => toWorld((surfaceRef.current?.clientWidth ?? 0) / 2, (surfaceRef.current?.clientHeight ?? 0) / 2),
    [toWorld]
  );

  /** 以某个屏幕锚点缩放 */
  const zoomTo = useCallback((factor: number, anchor?: { sx: number; sy: number }) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const sx = anchor?.sx ?? (rect?.width ?? 0) / 2;
    const sy = anchor?.sy ?? (rect?.height ?? 0) / 2;
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const ratio = k / v.k;
      return { k, x: sx - (sx - v.x) * ratio, y: sy - (sy - v.y) * ratio };
    });
  }, []);

  /** 滚轮缩放（触控板捏合会带 ctrlKey） */
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = surface.getBoundingClientRect();
      zoomTo(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), {
        sx: event.clientX - rect.left,
        sy: event.clientY - rect.top,
      });
    };
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  /** 清理已消失条目的覆盖坐标 */
  useEffect(() => {
    setOverrides((current) => {
      const ids = new Set(items.map((item) => item.id));
      const next: Record<string, Pos> = {};
      let changed = false;
      for (const [id, pos] of Object.entries(current)) {
        if (ids.has(id)) next[id] = pos;
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [items]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-card-id]");
    // 合成事件或不支持指针捕获的浏览器不能把整个拖拽打断
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* 忽略 */
    }
    if (card) {
      const id = card.dataset.cardId!;
      const entry = entries.find((each) => each.item.id === id);
      if (!entry) return;
      setDraggingId(id);
      gesture.current = {
        mode: "card",
        id,
        startX: event.clientX,
        startY: event.clientY,
        origin: entry.pos,
        moved: false,
      };
      return;
    }
    gesture.current = { mode: "pan", startX: event.clientX, startY: event.clientY, origin: view };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = gesture.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.mode === "pan") {
      setView({ k: drag.origin.k, x: drag.origin.x + dx, y: drag.origin.y + dy });
      return;
    }
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    drag.moved = true;
    const k = viewRef.current.k;
    setOverrides((current) => ({ ...current, [drag.id]: { x: drag.origin.x + dx / k, y: drag.origin.y + dy / k } }));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = gesture.current;
    gesture.current = null;
    setDraggingId(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // 没拖动过的卡片当一次点击：文字 / 图片打开放大查看（file 走下载，没有弹窗）
    if (drag && drag.mode === "card" && !drag.moved) {
      const item = items.find((each) => each.id === drag.id);
      if (item && item.kind !== "file") setViewerId(item.id);
    }
    if (!drag || drag.mode !== "card" || !drag.moved) return;
    const pos = overrides[drag.id];
    if (!pos) return;
    moveItem(drag.id, pos.x, pos.y).catch((error) => {
      toast.error(error instanceof Error ? error.message : "位置保存失败");
    });
  };

  const pushFiles = useCallback(
    async (files: File[], pos?: Pos) => {
      if (!files.length) return;
      const at = pos ?? viewportCenter();
      setUploading((count) => count + files.length);
      await Promise.all(
        files.map(async (file, index) => {
          try {
            await uploadFile(file, {
              kind: file.type.startsWith("image/") ? "image" : "file",
              // 一次放多个文件时错开一点，避免完全重叠
              pos: { x: at.x + (index % 3) * 24, y: at.y + Math.floor(index / 3) * 24 },
            });
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "上传失败");
          } finally {
            setUploading((count) => Math.max(0, count - 1));
          }
        })
      );
      toast.success(files.length > 1 ? `已放 ${files.length} 个文件到桌面` : "已放到桌面");
    },
    [viewportCenter]
  );

  /** 粘贴：文字直接填进新建弹窗，图片/文件立刻成为卡片 */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) {
        return;
      }
      const files = collectFiles(event.clipboardData);
      if (files.length) {
        event.preventDefault();
        void pushFiles(files);
        return;
      }
      const pasted = event.clipboardData?.getData("text/plain") ?? "";
      if (pasted.trim()) {
        event.preventDefault();
        setComposerText(pasted);
        setComposerOpen(true);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [pushFiles]);

  /** 拖拽文件进来 */
  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropping(false);
    const files = collectFiles(event.dataTransfer);
    if (!files.length) return;
    void pushFiles(files, toWorld(event.clientX, event.clientY));
  };

  const openComposer = () => {
    setComposerText("");
    setComposerOpen(true);
  };

  /** 双击空白处也在该点开一张字条（弹窗会记住落点） */
  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-card-id],[data-stop]")) return;
    openComposer();
  };

  /** 重新按网格排布所有卡片，并写回服务端 */
  const arrange = () => {
    const next: Record<string, Pos> = {};
    entries.forEach((entry, index) => {
      next[entry.item.id] = gridPos(index);
    });
    setOverrides(next);
    setView({ x: 0, y: 0, k: 1 });
    Promise.all(Object.entries(next).map(([id, pos]) => moveItem(id, pos.x, pos.y).catch(() => {}))).then(() =>
      toast.success("已重新排布")
    );
  };

  const viewerItem = viewerId ? items.find((item) => item.id === viewerId) ?? null : null;

  return (
    <>
      <div
        ref={surfaceRef}
        className="relative h-full min-h-[420px] touch-none overflow-hidden rounded-xl border bg-muted/20 select-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, color-mix(in oklab, currentColor 20%, transparent) 1px, transparent 0)",
          backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
          cursor: "grab",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDropping(false);
        }}
        onDrop={onDrop}
      >
        {/* 世界坐标层：卡片按桌面坐标摆放，随平移缩放。
            will-change 让整层预先栅格化，避免缩放下悬停时浏览器重新光栅化导致文字发糊 */}
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.k})`, willChange: "transform" }}
        >
          {entries.map(({ item, pos, z }) => (
            <div
              key={item.id}
              data-card-id={item.id}
              className={
                "absolute top-0 left-0 rounded-lg border bg-card p-3 shadow-sm " +
                (draggingId === item.id
                  ? items.find((each) => each.id === item.id)?.kind !== "file"
                    ? "cursor-grabbing shadow-lg ring-2 ring-primary/40"
                    : "cursor-grabbing shadow-lg"
                  : "hover:shadow-md")
              }
              style={{ width: CARD_W, transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, zIndex: z }}
            >
              <ItemMeta item={item} className="mb-1.5" />
              <CardBody item={item} />
              <div className="mt-2 flex gap-1.5" data-stop onPointerDown={(event) => event.stopPropagation()}>
                <CardActions item={item} />
              </div>
            </div>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
            桌面还是空的：粘贴、拖入文件，或点右上角「新建卡片」
          </div>
        ) : null}

        {dropping ? (
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/5 text-sm font-medium">
            松手即成为卡片
          </div>
        ) : null}

        {/* 顶部工具条：左侧缩放 + 提示，右侧新建 */}
        <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 p-2" data-stop>
          <div
            className="flex items-center gap-1 rounded-full bg-background/80 p-1 shadow-sm backdrop-blur-xl"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-2.5" onClick={() => zoomTo(1 / 1.2)} title="缩小">
              <ZoomOut className="size-4" />
            </Button>
            <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(view.k * 100)}%
            </span>
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-2.5" onClick={() => zoomTo(1.2)} title="放大">
              <ZoomIn className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-2.5" onClick={() => setView({ x: 0, y: 0, k: 1 })} title="回到原位">
              <Maximize className="size-4" />
            </Button>
            {items.length ? (
              <Button variant="ghost" size="sm" className="h-8 rounded-full px-2.5" onClick={arrange} title="网格排布">
                <Grid2x2 className="size-4" />
                排布
              </Button>
            ) : null}
            {uploading ? (
              <span className="px-2 text-xs text-muted-foreground">正在放 {uploading} 个文件…</span>
            ) : null}
          </div>

          <p className="hidden min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground md:block">
            可以直接粘贴文字、截图，或把文件拖进来；拖动卡片摆位置，点卡片放大查看
          </p>

          <div
            className="ml-auto flex items-center gap-1 rounded-full bg-background/80 p-1 shadow-sm backdrop-blur-xl"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Button size="sm" className="h-8 rounded-full px-3" onClick={openComposer}>
              <Plus />
              新建卡片
            </Button>
          </div>
        </div>
      </div>

      <CardComposer
        open={composerOpen}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) setComposerText("");
        }}
        initialText={composerText}
        onSubmitText={(text) =>
          sendText(text, viewportCenter()).then(() => {
            toast.success("已放到桌面");
          })
        }
        onFiles={(files) => void pushFiles(files)}
        placementHint="会作为新卡片放在当前视野中央"
      />

      {/* 放大查看：文字显示全部内容，图片显示大图 */}
      <CardViewerDialog item={viewerItem} onClose={() => setViewerId(null)} />
    </>
  );
}
