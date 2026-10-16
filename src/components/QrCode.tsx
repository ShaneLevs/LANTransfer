import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "cn";

/** 用当前主题色在 canvas 上生成二维码 */
export function QrCode({ value, size = 132, className = "" }: { value: string; size?: number; className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: dark ? "#f4f4f5" : "#18181b", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size, dark]);

  return (
    <div className={cn("rounded-md bg-white p-1.5 shadow-sm ring-1 ring-black/5", className)}>
      {dataUrl ? (
        <img src={dataUrl} alt="扫码打开共享桌面" width={size} height={size} className="block" />
      ) : (
        <div style={{ width: size, height: size }} className="animate-pulse rounded-sm bg-zinc-200" />
      )}
    </div>
  );
}
