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
import { Eraser, ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import type { AppState } from "@/types";

export function ReceivePanel({ state }: { state: AppState }) {
  const run = useAction();
  const uploads = state.items.filter((item) => item.scope === "upload");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>收到的文件（{uploads.length}）</span>
          {uploads.length ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => run(() => window.services!.clearScope("upload"), "已清空接收列表")}
            >
              <Eraser />
              清空
            </Button>
          ) : null}
        </CardTitle>
        <CardDescription>
          局域网设备在网页端上传的文件会保存到接收目录的 uploads 子目录。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {uploads.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            还没有收到上传的文件。
          </p>
        ) : (
          uploads.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              actions={
                <>
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
