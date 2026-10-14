import { useRef, useState } from "react";
import { toast } from "sonner";
import { uploadFile } from "@lan/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";
import { CircleCheck, Loader2, Upload, X } from "lucide-react";

interface UploadTask {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

let taskSeed = 0;

export function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [dragging, setDragging] = useState(false);

  const start = (files: File[]) => {
    if (!files.length) return;
    const created: UploadTask[] = files.map((file) => {
      taskSeed += 1;
      return {
        id: `task-${Date.now()}-${taskSeed}`,
        name: file.name || "未命名文件",
        size: file.size,
        progress: 0,
        status: "uploading",
      };
    });
    setTasks((prev) => [...created, ...prev]);

    files.forEach((file, index) => {
      const task = created[index];
      const update = (patch: Partial<UploadTask>) =>
        setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, ...patch } : item)));
      uploadFile(file, {
        kind: "file",
        toClipboard: false,
        onProgress: (progress) => update({ progress }),
      })
        .then(() => {
          update({ status: "done", progress: 1 });
          toast.success(`${task.name} 上传完成`);
        })
        .catch((error: unknown) => {
          update({ status: "error", error: error instanceof Error ? error.message : "上传失败" });
        });
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>上传文件到这台电脑</CardTitle>
          <CardDescription>上传的文件会直接保存到这台电脑的接收目录中，对方能看到并处理。</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              start(Array.from(event.dataTransfer.files));
            }}
            onClick={() => inputRef.current?.click()}
            className={
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors " +
              (dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60")
            }
          >
            <Upload className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">点击选择文件</p>
            <p className="text-xs text-muted-foreground">也可以把文件拖到这里，支持多选</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                start(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </div>
        </CardContent>
      </Card>

      {tasks.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>上传记录</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTasks((prev) => prev.filter((task) => task.status === "uploading"))}
              >
                <X />
                清理已完成
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{task.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(task.size)}
                  </span>
                  {task.status === "uploading" ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : task.status === "done" ? (
                    <CircleCheck className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <span className="shrink-0 text-xs text-destructive">{task.error}</span>
                  )}
                </div>
                <Progress value={Math.round(task.progress * 100)} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
