import type { ReactNode } from "react";
import { formatTime, KIND_LABEL, ownerName } from "@/lib/format";
import type { TransferItem } from "@/types";

/**
 * 卡片基础信息：上传人（登录用户名）· IP · 时间 · 类型
 */
export function ItemMeta({ item, className = "" }: { item: TransferItem; className?: string }) {
  const parts = [ownerName(item), item.ip, formatTime(item.time), KIND_LABEL[item.kind]].filter(Boolean);
  return (
    <div className={"flex items-center gap-x-1.5 text-xs whitespace-nowrap text-muted-foreground " + className}>
      {parts.map((part, index) => (
        <span key={index} className="flex min-w-0 items-center gap-1.5">
          {index > 0 ? <span className="opacity-50">·</span> : null}
          <span className="max-w-[14rem] truncate">{part}</span>
        </span>
      ))}
    </div>
  );
}

/** 统一的卡片外观：基础信息 + 内容预览 + 操作按钮 */
export function ItemCard({
  item,
  preview,
  actions,
  onClick,
  className = "",
}: {
  item: TransferItem;
  preview?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      className={"rounded-lg border bg-card p-3 " + (onClick ? "cursor-pointer hover:shadow-sm " : "") + className}
      onClick={onClick}
    >
      <ItemMeta item={item} />
      {preview ? <div className="mt-2">{preview}</div> : null}
      {actions ? <div className="mt-2 flex flex-wrap gap-1.5">{actions}</div> : null}
    </div>
  );
}
