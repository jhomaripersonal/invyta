// Guest tools helpers: RSVP settings and deadline (src/lib/rsvp-settings.ts),
// calendar links (src/lib/calendar.ts), guest-list CSV export
// (src/lib/guest-export.ts) and reminder messages (src/lib/reminders.ts).
// Run: pnpm test:unit
import { cleanAnswers, formatDeadline, philippineToday, rsvpClosed, rsvpSettings } from "../../src/lib/rsvp-settings.ts";
import { googleCalendarUrl, icsFile } from "../../src/lib/calendar.ts";
import { csvCell, exportFileName, guestsToCsv } from "../../src/lib/guest-export.ts";
import { normalizePhone, reminderLinks, reminderMessage } from "../../src/lib/reminders.ts";

let failures = 0;
let passes = 0;
const check = (label, ok, extra = "") => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${extra ? "  — " + extra : ""}`);
};

console.log("=== RSVP settings ===");
const settings = rsvpSettings({
  deadline: "2026-10-03",
  questions: [
    { id: "song", label: "Song request?", type: "text" },
    { id: "shirt", label: "Shirt size", type: "choice", options: ["S", "M", "", "L"], required: true },
    { id: "empty", label: "   ", type: "text" },
    { id: "nochoices", label: "Pick", type: "choice", options: [] },
    { label: "No id" },
  ],
});
check("deadline kept", settings.deadline === "2026-10-03");
check("only complete questions kept", settings.questions.map((q) => q.id).join(",") === "song,shirt", settings.questions.map((q) => q.id).join(","));
check("choice options cleaned", JSON.stringify(settings.questions[1].options) === '["S","M","L"]');
check("impossible date is no deadline", rsvpSettings({ deadline: "2026-02-31" }).deadline === null);
check("non-date is no deadline", rsvpSettings({ deadline: "soon" }).deadline === null);
check("at most 5 questions", rsvpSettings({ questions: Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, label: `Q${i}` })) }).questions.length === 5);

// 2026-10-03 23:30 in Manila is 15:30 UTC; 2026-10-04 00:30 Manila is 16:30 UTC.
check("open on the deadline day (Manila evening)", !rsvpClosed(settings, new Date("2026-10-03T15:30:00Z")));
check("closed the day after (Manila just past midnight)", rsvpClosed(settings, new Date("2026-10-03T16:30:00Z")));
check("no deadline never closes", !rsvpClosed(rsvpSettings({}), new Date("2099-01-01T00:00:00Z")));
check("Philippine date rolls over at 16:00 UTC", philippineToday(new Date("2026-10-03T16:00:00Z")) === "2026-10-04");
check("formatDeadline", formatDeadline("2026-10-03") === "October 3, 2026", formatDeadline("2026-10-03"));

const answers = cleanAnswers(settings.questions, { song: "  September  ", shirt: "XL", other: "x" });
check("answers: trimmed, unknown ids and invalid choices dropped", JSON.stringify(answers) === '{"song":"September"}', JSON.stringify(answers));
check("answers: length capped", cleanAnswers(settings.questions, { song: "x".repeat(500) }).song.length === 300);

console.log("=== Calendar ===");
const ev = { title: "Elena & Marco", date: "2026-10-10", time: "16:00", location: "The Blue Leaf, Taguig", url: "https://invyta.example/i/em" };
const g = new URL(googleCalendarUrl(ev));
check("Google: 4 PM Manila is 08:00 UTC, 4 hours long", g.searchParams.get("dates") === "20261010T080000Z/20261010T120000Z", g.searchParams.get("dates"));
check("Google: title and location", g.searchParams.get("text") === "Elena & Marco" && g.searchParams.get("location") === "The Blue Leaf, Taguig");
const early = new URL(googleCalendarUrl({ ...ev, time: "06:30" }));
check("an early-morning start becomes the previous UTC day", early.searchParams.get("dates").startsWith("20261009T223000Z"), early.searchParams.get("dates"));
const allDay = new URL(googleCalendarUrl({ ...ev, time: undefined }));
check("no time → all-day event", allDay.searchParams.get("dates") === "20261010/20261011", allDay.searchParams.get("dates"));
check("no date → no link", googleCalendarUrl({ ...ev, date: "" }) === null);

const ics = icsFile({ ...ev, location: "Hall A, 2F; Makati, Metro Manila" }, "evt-1", new Date("2026-09-26T00:00:00Z"));
check("ICS: UTC start/end", ics.includes("DTSTART:20261010T080000Z") && ics.includes("DTEND:20261010T120000Z"));
check("ICS: commas and semicolons escaped", ics.includes("LOCATION:Hall A\\, 2F\\; Makati\\, Metro Manila"), ics.split("\r\n").find((l) => l.startsWith("LOCATION")));
check("ICS: CRLF line endings, wrapped in VCALENDAR", ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
const longIcs = icsFile({ ...ev, title: "Ñ".repeat(60) }, "evt-2");
check("ICS: long lines folded to ≤75 octets", longIcs.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75));
check("ICS: all-day uses VALUE=DATE", icsFile({ ...ev, time: "" }, "x").includes("DTSTART;VALUE=DATE:20261010"));

console.log("=== CSV export ===");
check("formula-like cells neutralized", csvCell("=HYPERLINK(\"x\")") === `"'=HYPERLINK(""x"")"` && csvCell("+63917") === "'+63917" && csvCell("@x") === "'@x" && csvCell("-1") === "'-1");
check("commas, quotes and newlines quoted", csvCell('Hi, "you"\nthere') === '"Hi, ""you""\nthere"');
check("empty values", csvCell(undefined) === "" && csvCell(null) === "");
const csv = guestsToCsv(
  [
    { name: "Ana Cruz", rsvpStatus: "confirmed", numberOfGuests: 2, mealPreference: "Fish", checkedIn: true, submittedAt: "2026-09-20T10:00:00Z", answers: { song: "September" }, group: "Family" },
    { name: "Ben Reyes", rsvpStatus: "declined", numberOfGuests: 3, checkedIn: false, submittedAt: "2026-09-21T10:00:00Z" },
    { name: "Carla Santos", rsvpStatus: "pending", numberOfGuests: 1, checkedIn: false, submittedAt: "2026-09-01T10:00:00Z" },
  ],
  settings.questions,
);
const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
check("starts with a BOM (Excel reads it as UTF-8)", csv.startsWith("﻿"));
check("header includes question labels", lines[0] === "Name,RSVP,Party size,Group,Email,Phone,Meal,Message,Notes,Checked in,Responded,Song request?,Shirt size", lines[0]);
check("confirmed row", lines[1] === "Ana Cruz,Confirmed,2,Family,,,Fish,,,Yes,2026-09-20,September,", lines[1]);
check("declined counts 0 people", lines[2].startsWith("Ben Reyes,Declined,0,"), lines[2]);
check("pending has no response date", lines[3] === "Carla Santos,Pending,1,,,,,,,No,,,", lines[3]);
const noMeal = guestsToCsv([{ name: "Dan", rsvpStatus: "confirmed", numberOfGuests: 1, checkedIn: false }]).replace(/^\uFEFF/, "").split("\r\n")[0];
check("no Meal column when no guest has one", noMeal === "Name,RSVP,Party size,Group,Email,Phone,Message,Notes,Checked in,Responded", noMeal);
check("file name", exportFileName("Elena & Marco's Wedding!", new Date("2026-09-26T00:00:00Z")) === "elena-marco-s-wedding-guests-2026-09-26.csv");

console.log("=== Reminders ===");
const msg = reminderMessage("Hi {name}! RSVP for {event}{deadline}: {link}", { guestName: "  Ana Maria Cruz", eventName: "Elena & Marco", link: "https://x/i/em", deadline: "October 3, 2026" });
check("message fills first name, event, deadline, link", msg === "Hi Ana! RSVP for Elena & Marco by October 3, 2026: https://x/i/em", msg);
check("no deadline leaves no gap", reminderMessage("RSVP{deadline}.", { guestName: "A", eventName: "E", link: "L" }) === "RSVP.");
for (const [input, want] of [["0917 123 4567", "639171234567"], ["+63 917-123-4567", "639171234567"], ["9171234567", "639171234567"], ["(02) 8123 4567", "0281234567"], ["123", null], [undefined, null]]) {
  check(`normalizePhone(${JSON.stringify(input)}) → ${want}`, normalizePhone(input) === want, String(normalizePhone(input)));
}
const links = reminderLinks("Hi & bye", "https://x/i/em", { phone: "09171234567", email: "ana@example.com" }, true);
check("WhatsApp link with number and text", links.whatsapp === "https://wa.me/639171234567?text=Hi%20%26%20bye", links.whatsapp);
check("SMS link", links.sms === "sms:+639171234567?&body=Hi%20%26%20bye", links.sms);
check("email link", links.email.startsWith("mailto:ana%40example.com?subject="));
check("Messenger on phones shares the link", links.messenger === "fb-messenger://share/?link=https%3A%2F%2Fx%2Fi%2Fem");
check("Messenger on desktop opens messenger.com", reminderLinks("m", "l", {}, false).messenger === "https://www.messenger.com/");
const bare = reminderLinks("m", "l", {}, true);
check("no phone/email → only Messenger and Viber", Object.keys(bare).sort().join(",") === "messenger,viber", Object.keys(bare).join(","));

console.log(`\n${failures === 0 ? "ALL" : failures + " OF"} ${passes + failures} GUEST TOOL CHECKS ${failures === 0 ? "PASS" : "FAILED"}`);
if (failures) process.exit(1);
