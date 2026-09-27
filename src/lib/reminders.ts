// "Nudge pending guests": a ready-to-send reminder for each guest who
// hasn't replied, opened in the app the host already uses with that guest
// (Messenger, Viber, WhatsApp, SMS or email). Nothing is sent by Invyta —
// these are share links the host taps, so no messaging service, sender
// fees or guest consent for third-party messages are involved.

export interface ReminderContext {
  guestName: string;
  eventName: string;
  link: string;
  deadline?: string; // already formatted, e.g. "October 3, 2026"
}

export const DEFAULT_REMINDER_TEMPLATE =
  "Hi {name}! Just a friendly reminder to RSVP for {event}{deadline}. Here's your invitation: {link}";

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function reminderMessage(template: string, ctx: ReminderContext): string {
  return template
    .replace(/\{name\}/g, firstName(ctx.guestName))
    .replace(/\{event\}/g, ctx.eventName)
    .replace(/\{deadline\}/g, ctx.deadline ? ` by ${ctx.deadline}` : "")
    .replace(/\{link\}/g, ctx.link);
}

// Philippine mobile numbers as typed by hosts (0917…, 917…, +63 917…,
// 63-917…) → "639171234567", the international form wa.me and sms: need.
// Anything else is returned digits-only, if it looks like a phone number.
export function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export type ReminderChannel = "messenger" | "viber" | "whatsapp" | "sms" | "email";

// Messenger can't open a chat with an arbitrary person from a link, so on
// phones it shares the invitation link and the host picks the recipient
// (on desktop it just opens Messenger); either way the message is copied
// first so it can be pasted. The others prefill recipient and text.
export function reminderLinks(message: string, link: string, guest: { phone?: string; email?: string }, mobile: boolean): Partial<Record<ReminderChannel, string>> {
  const text = encodeURIComponent(message);
  const phone = normalizePhone(guest.phone);
  const out: Partial<Record<ReminderChannel, string>> = {
    messenger: mobile ? `fb-messenger://share/?link=${encodeURIComponent(link)}` : "https://www.messenger.com/",
    viber: `viber://forward?text=${text}`,
  };
  if (phone) {
    out.whatsapp = `https://wa.me/${phone}?text=${text}`;
    out.sms = `sms:+${phone}?&body=${text}`;
  }
  if (guest.email) out.email = `mailto:${encodeURIComponent(guest.email)}?subject=${encodeURIComponent("Reminder: please RSVP")}&body=${text}`;
  return out;
}
