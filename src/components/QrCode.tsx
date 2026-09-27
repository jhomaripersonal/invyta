import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface Props {
  payload: string;
  size?: number;
  darkColor?: string;
  lightColor?: string;
  onDataUrlReady?: (dataUrl: string) => void;
}

export function QrCode({ payload, size = 220, darkColor = "#1C2942", lightColor = "#FFFFFF", onDataUrlReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setReady] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, payload, { width: size, margin: 1, color: { dark: darkColor, light: lightColor } }).then(() => setReady(true));
    }
    if (onDataUrlReady) {
      QRCode.toDataURL(payload, { width: size * 2, margin: 1 }).then(onDataUrlReady);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, size]);

  return <canvas ref={canvasRef} />;
}
