import { useState } from "react";
import type { GuestRecord } from "../../lib/guests-store";
import { guestQrPayload } from "../../lib/guest-qr";
import { QrCode } from "../../components/QrCode";

const T = { accent: "#1C2942", charcoal: "#1C2942", border: "#E7E1D8", muted: "#78716C", white: "#FFFFFF" };

export function GuestQrModal({ guest, onClose }: { guest: GuestRecord; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(28, 41, 66,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ backgroundColor: T.white }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold" style={{ color: T.charcoal }}>Check-in QR code</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100" style={{ color: T.muted }} aria-label="Close">✕</button>
        </div>
        <p className="text-sm font-semibold mb-4" style={{ color: T.charcoal }}>{guest.name}</p>
        <div className="flex justify-center mb-4 p-4 rounded-xl" style={{ border: `1px solid ${T.border}` }}>
          <QrCode payload={guestQrPayload(guest.id)} onDataUrlReady={setDataUrl} />
        </div>
        <p className="text-xs mb-5" style={{ color: T.muted }}>
          Show this at the door — staff can scan it on the Check-in page to mark this guest as arrived.
        </p>
        {dataUrl && (
          <a
            href={dataUrl}
            download={`${guest.name.replace(/\s+/g, "-").toLowerCase()}-qr.png`}
            className="inline-block w-full py-2.5 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: T.accent, color: T.white }}
          >
            Download
          </a>
        )}
      </div>
    </div>
  );
}
