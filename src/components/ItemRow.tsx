import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatTime } from "@/lib/format";
import type { ItemKind, TransferItem } from "@/types";

const KIND_LABEL: Record<ItemKind, string> = {
  text: "文本",
  image: "图片",
  file: "文件",
};

export function ItemRow({
  item,
  actions,
  extra,
}: {
  item: TransferItem;
  actions?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium" title={item.file}>
            {item.name}
          </span>
          <Badge variant="secondary" className="shrink-0">
            {KIND_LABEL[item.kind]}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{formatBytes(item.size)}</span>
          <span title={new Date(item.time).toLocaleString()}>{formatTime(item.time)}</span>
          {item.from ? <span>来自 {item.from}</span> : null}
        </div>
        {extra}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">{actions}</div>
      ) : null}
    </div>
  );
}
