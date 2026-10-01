// Category profiles (src/data/category-profiles.ts): every category has
// complete copy, personal celebrations keep the original wording, and
// memorial events never get celebration copy.
// Run: pnpm test:unit
import { categoryProfile } from "../../src/data/category-profiles.ts";
import { EVENT_CATEGORIES } from "../../src/data/event-categories.ts";

let failures = 0;
let passes = 0;
const check = (label, ok, extra = "") => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${extra ? "  — " + extra : ""}`);
};

const SECTION_TYPES = ["cover", "countdown", "details", "story", "schedule", "venue", "gallery", "video", "dress_code", "entourage", "gift_registry", "faq", "rsvp"];
// Sections whose heading is drawn from the profile alone.
const HEADED = ["story", "schedule", "venue", "gallery", "video", "dress_code", "entourage", "gift_registry", "faq"];

console.log("=== Every category has complete copy ===");
for (const { id } of EVENT_CATEGORIES) {
  const p = categoryProfile(id);
  const problems = [];
  for (const type of SECTION_TYPES) {
    if (!p.sections[type]?.name) problems.push(`${type}: no name`);
  }
  for (const type of HEADED) {
    if (!p.sections[type].eyebrow) problems.push(`${type}: no eyebrow`);
    if (!p.sections[type].heading) problems.push(`${type}: no heading`);
  }
  for (const [key, value] of Object.entries(p.rsvp)) {
    if (!value) problems.push(`rsvp.${key} empty`);
  }
  if (!p.coverSubtitle || !p.hostLine.includes("{host}") || !p.entourageRole) problems.push("cover/host/role copy");
  check(id, problems.length === 0, problems.join("; "));
}

console.log("\n=== Personal celebrations keep the original wording ===");
const wedding = categoryProfile("wedding");
check("cover subtitle", wedding.coverSubtitle === "You're invited to celebrate this {category}");
check("host line", wedding.hostLine === "Hosted by {host}");
check("RSVP prompt", wedding.rsvp.prompt === "Will you celebrate with us?");
check("story", wedding.sections.story.eyebrow === "Our Story" && wedding.sections.story.heading === "Our Story");
check("schedule heading", wedding.sections.schedule.heading === "Order of the" && wedding.sections.schedule.accent === "day");
check("registry keeps its short top-bar name", wedding.sections.gift_registry.short === "Registry");
check("nothing off by default", wedding.offByDefault.length === 0 && wedding.celebratory);
check("birthday matches wedding", categoryProfile("birthday") === wedding);
check("unknown category falls back", categoryProfile("not_a_category") === wedding);

console.log("\n=== Memorial events ===");
for (const id of EVENT_CATEGORIES.filter((c) => c.group === "Memorial").map((c) => c.id)) {
  const p = categoryProfile(id);
  const text = JSON.stringify({ ...p, celebratory: undefined }).toLowerCase();
  check(`${id}: no confetti, no countdown by default`, !p.celebratory && p.offByDefault.includes("countdown"));
  check(`${id}: no celebration wording`, !/celebrat|can't wait|with love|our film|favorites/.test(text), text.match(/celebrat|can't wait|with love|our film|favorites/)?.[0]);
}

console.log("\n=== Renamed sections ===");
const charity = categoryProfile("charity_event");
check("a renamed section drops the inherited short name", charity.sections.gift_registry.name === "Donations" && charity.sections.gift_registry.short === undefined);
check("a new heading drops the inherited accent", categoryProfile("wake").sections.schedule.accent === "schedule" && categoryProfile("seminar").sections.story.accent === undefined);
check("debut entourage is The 18s", categoryProfile("debut").sections.entourage.name === "The 18s");
check("baptism entourage is Godparents", categoryProfile("baptism").sections.entourage.name === "Godparents");
check("seminar asks about attending", categoryProfile("seminar").rsvp.prompt === "Will you be attending?");

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
