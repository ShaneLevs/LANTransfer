import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes, formatTime } from "@/lib/format";
import type { TransferItem } from "@/types";
import { Download } from "lucide-react";

export function FilesPanel({ items, host }: { items: TransferItem[]; host: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{host} 分享的文件（{items.length}）</CardTitle>
        <CardDescription>由 {host} 分享，点击即可下载。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">对方还没有分享文件。</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={item.name}>
                  {item.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBytes(item.size)} · {formatTime(item.time)}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <a href={`/api/file/${item.id}`}>
                  <Download />
                  下载
                </a>
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
