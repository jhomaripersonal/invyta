import { useState } from "react";
import type { EventRecord } from "../../lib/events-store";
import type { GuestRecord } from "../../lib/guests-store";
import { DEFAULT_REMINDER_TEMPLATE, reminderLinks, reminderMessage, type ReminderChannel } from "../../lib/reminders";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  white: "#FFFFFF",
  green: "#2E7D55",
  gold: "#B08D57",
};

const CHANNEL_LABELS: Record<ReminderChannel, string> = {
  messenger: "Messenger",
  viber: "Viber",
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
};
const CHANNEL_ORDER: ReminderChannel[] = ["messenger", "viber", "whatsapp", "sms", "email"];

const TEMPLATE_KEY = "invyta:reminder-template";

function loadTemplate(): string {
  try {
    return localStorage.getItem(TEMPLATE_KEY) || DEFAULT_REMINDER_TEMPLATE;
  } catch {
    return DEFAULT_REMINDER_TEMPLATE;
  }
}

function saveTemplate(value: string) {
  try {
    localStorage.setItem(TEMPLATE_KEY, value);
  } catch {
    // Private mode or blocked storage: the template just isn't remembered.
  }
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Props {
  event: EventRecord;
  guests: GuestRecord[];
  // Personalized links (Pro) send each guest their own link; otherwise
  // everyone gets the invitation's public link.
  personalLinks: boolean;
  deadline?: string;
  onReminded: (guestId: string) => Promise<void>;
  onClose: () => void;
}

// "Nudge pending guests": each pending guest with a ready reminder and
// one-tap buttons for the apps the host already uses. Tapping one records
// the reminder, so the host can see who's already been nudged.
export default function RemindGuestsModal({ event, guests, personalLinks, deadline, onReminded, onClose }: Props) {
  const [template, setTemplate] = useState(loadTemplate);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [remindedNow, setRemindedNow] = useState<Record<string, string>>({});
  const mobile = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const published = event.status === "published";
  const baseLink = `${window.location.origin}/i/${event.slug}`;

  const linkFor = (g: GuestRecord) => (personalLinks ? `${baseLink}/g/${g.id}` : baseLink);
  const messageFor = (g: GuestRecord) => reminderMessage(template, { guestName: g.name, eventName: event.name, link: linkFor(g), deadline });

  function markReminded(g: GuestRecord) {
    setRemindedNow((r) => ({ ...r, [g.id]: new Date().toISOString() }));
    onReminded(g.id).catch(() => {
      // Recording the reminder is a convenience; the message still went out.
    });
  }

  async function copy(g: GuestRecord) {
    const text = messageFor(g);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(g.id);
      setTimeout(() => setCopiedId((c) => (c === g.id ? null : c)), 1500);
      return true;
    } catch {
      window.prompt("Copy this reminder:", text);
      return false;
    }
  }

  async function send(g: GuestRecord, channel: ReminderChannel, href: string) {
    // Messenger can't prefill text, so the message goes on the clipboard.
    if (channel === "messenger") await copy(g);
    markReminded(g);
    window.open(href, channel === "email" || channel === "sms" ? "_self" : "_blank", "noopener");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(28, 41, 66,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl" style={{ backgroundColor: T.white }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Remind pending guests">
        <div className="flex items-start justify-between gap-3 p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: T.charcoal }}>Remind pending guests</h2>
            <p className="text-xs mt-1" style={{ color: T.muted }}>
              {guests.length} {guests.length === 1 ? "guest hasn't" : "guests haven't"} replied. Tap an app to send a reminder from your own account.
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-stone-100" style={{ color: T.muted }} aria-label="Close">✕</button>
        </div>

        <div className="px-6 pb-4">
          {!published && (
            <p className="text-xs rounded-lg px-3 py-2 mb-3" style={{ backgroundColor: "rgba(176,141,87,0.12)", color: T.charcoal }}>
              This invitation isn't published yet, so the link won't open for guests. Publish it first from the builder.
            </p>
          )}
          <label className="block text-xs font-semibold mb-1.5" style={{ color: T.muted }} htmlFor="reminder-template">Message</label>
          <textarea
            id="reminder-template"
            rows={3}
            value={template}
            onChange={(e) => {
              setTemplate(e.target.value);
              saveTemplate(e.target.value);
            }}
            maxLength={600}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal }}
          />
          {guests[0] && (
            <p className="text-xs mt-2 rounded-lg px-3 py-2 break-words" style={{ backgroundColor: T.cream, color: T.charcoal }}>
              <span className="font-semibold" style={{ color: T.muted }}>Preview: </span>
              {messageFor(guests[0])}
            </p>
          )}
          <div className="flex items-center justify-between mt-1">
            <p className="text-[11px]" style={{ color: T.muted }}>
              {"{name}"} first name · {"{event}"} · {"{deadline}"} · {"{link}"} {personalLinks ? "their personal link" : "the invitation link"}
            </p>
            {template !== DEFAULT_REMINDER_TEMPLATE && (
              <button
                type="button"
                onClick={() => {
                  setTemplate(DEFAULT_REMINDER_TEMPLATE);
                  saveTemplate(DEFAULT_REMINDER_TEMPLATE);
                }}
                className="text-[11px] font-semibold underline flex-shrink-0 ml-2"
                style={{ color: T.muted }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
          {guests.map((g) => {
            const links = reminderLinks(messageFor(g), linkFor(g), g, mobile);
            const reminded = remindedNow[g.id] ?? g.remindedAt;
            return (
              <div key={g.id} className="rounded-xl p-3.5" style={{ border: `1px solid ${T.border}` }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold truncate" style={{ color: T.charcoal }}>{g.name}</span>
                  <span className="text-[11px] flex-shrink-0" style={{ color: reminded ? T.green : T.muted }}>
                    {reminded ? `Reminded ${formatShortDate(reminded)}` : "Not reminded yet"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CHANNEL_ORDER.filter((c) => links[c]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => send(g, c, links[c]!)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:bg-stone-100"
                      style={{ border: `1px solid ${T.border}`, color: T.charcoal }}
                    >
                      {CHANNEL_LABELS[c]}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={async () => {
                      if (await copy(g)) markReminded(g);
                    }}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:bg-stone-100"
                    style={{ border: `1px solid ${T.border}`, color: copiedId === g.id ? T.green : T.charcoal }}
                  >
                    {copiedId === g.id ? "Copied!" : "Copy message"}
                  </button>
                </div>
                {!g.phone && !g.email && (
                  <p className="text-[11px] mt-2" style={{ color: T.muted }}>Add a phone number or email to this guest for SMS, WhatsApp and email.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
