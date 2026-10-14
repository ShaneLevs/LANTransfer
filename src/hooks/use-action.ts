import { useCallback } from "react";
import { toast } from "sonner";

type Runner = <T>(action: () => T | Promise<T>, successMessage?: string) => Promise<T | undefined>;

/** 统一处理操作异常与成功提示 */
export function useAction(): Runner {
  return useCallback(async (action, successMessage) => {
    try {
      const result = await action();
      if (successMessage) toast.success(successMessage);
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }, []) as Runner;
}
