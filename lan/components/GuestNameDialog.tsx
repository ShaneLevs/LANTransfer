import { useEffect, useState } from "react";
import { getGuestName, setGuestName } from "@lan/lib/guest";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserRound } from "lucide-react";

/**
 * 访客昵称引导与修改：
 * - 首次打开网页端（localStorage 里没有昵称）自动弹一次，可跳过
 * - 之后点 header 右侧的名字可随时改
 * 昵称只存当前浏览器，上传时随请求带给服务端记入卡片署名。
 */
export function GuestNameDialog({
  open,
  onOpenChange,
  onSaved,
  dismissable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 保存后通知父级更新 header 显示 */
  onSaved?: (name: string) => void;
  /** 首次引导 = 必须点一次（跳过也行）；改名模式 = 取消不保存 */
  dismissable: boolean;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue(getGuestName());
  }, [open]);

  const save = () => {
    const name = setGuestName(value);
    onSaved?.(name);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !dismissable) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-sm"
        showClose={dismissable}
        onInteractOutside={(event) => {
          if (!dismissable) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (!dismissable) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="size-4" />
            怎么称呼你？
          </DialogTitle>
          <DialogDescription>
            填个昵称，你放上桌面的内容会署你的名。只保存在这台设备的浏览器里，可随时改。
          </DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          maxLength={24}
          placeholder="例如：小明 / 工位电脑"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
        />
        <DialogFooter>
          {dismissable ? (
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {getGuestName() ? "取消" : "跳过"}
            </Button>
          ) : null}
          <Button size="sm" onClick={save}>
            {getGuestName() ? "保存" : "就用这个"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
