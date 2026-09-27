// Invitation palettes (src/data/theme-presets.ts): every preset and every
// custom palette stays readable — button text on the main color, the main
// color and body text on the page — and all colors are 6-digit hex, since
// sections append alpha digits to them.
// Run: pnpm test:unit
import { COLOR_PALETTES, PALETTE_GROUPS, buildCustomPalette, contrastRatio, normalizeHex } from "../../src/data/theme-presets.ts";

let failures = 0;
let passes = 0;
const check = (label, ok, extra = "") => {
  if (ok) passes++;
  else failures++;
  if (!ok || process.env.VERBOSE) console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${extra ? "  — " + extra : ""}`);
};

const HEX = /^#[0-9A-F]{6}$/;
const COLOR_KEYS = ["primary", "onPrimary", "accent", "background", "surface", "text"];

function checkPalette(name, p) {
  for (const k of COLOR_KEYS) check(`${name}: ${k} is 6-digit hex`, HEX.test(p[k]), p[k]);
  const pairs = [
    ["button text on primary", p.onPrimary, p.primary],
    ["primary on background", p.primary, p.background],
    ["text on background", p.text, p.background],
    ["text on surface", p.text, p.surface],
  ];
  for (const [what, a, b] of pairs) {
    const r = contrastRatio(a, b);
    check(`${name}: ${what}`, r >= 4.5, r.toFixed(2));
  }
  const bgIsDark = contrastRatio("#FFFFFF", p.background) > contrastRatio("#000000", p.background);
  check(`${name}: dark flag matches background`, p.dark === bgIsDark);
}

console.log("=== Presets ===");
const ids = new Set();
for (const p of COLOR_PALETTES) {
  check(`${p.id}: unique id`, !ids.has(p.id));
  ids.add(p.id);
  check(`${p.id}: group exists`, PALETTE_GROUPS.some((g) => g.id === p.group));
  checkPalette(p.id, p);
}
check("no preset uses the custom id", !ids.has("custom"));

console.log("=== Custom ===");
// A sweep of hues and lightnesses, including the hard cases (near-white,
// near-black, pure yellow).
const samples = ["#FFFFFF", "#000000", "#FFFF00", "#F5F5DC", "#808080", "#FF69B4", "#0000FF", "#00FF00", "#7C9473", "#D9A5B3"];
for (let h = 0; h < 360; h += 30) {
  for (const l of [0.2, 0.5, 0.8]) {
    const a = 1 - Math.abs(2 * l - 1);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - (a / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    samples.push(`#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
  }
}
for (const primary of samples) {
  for (const dark of [false, true]) checkPalette(`custom ${primary} ${dark ? "dark" : "light"}`, buildCustomPalette({ primary, dark }));
}
checkPalette("custom with picked accent", buildCustomPalette({ primary: "#7A6143", accent: "#123456", dark: false }));
check("picked accent is kept", buildCustomPalette({ primary: "#7A6143", accent: "#123456", dark: false }).accent === "#123456");
check("invalid primary falls back to a preset color", HEX.test(buildCustomPalette({ primary: "red; background:url(x)", dark: false }).primary));
check("invalid accent is ignored", buildCustomPalette({ primary: "#7A6143", accent: "nope", dark: false }).accent !== "nope");

console.log("=== normalizeHex ===");
for (const [input, want] of [["#abc", "#AABBCC"], ["a1b2c3", "#A1B2C3"], [" #A1B2C3 ", "#A1B2C3"], ["#12345", null], ["red", null], [42, null], [undefined, null]]) {
  check(`normalizeHex(${JSON.stringify(input)}) → ${want}`, normalizeHex(input) === want, String(normalizeHex(input)));
}

console.log(`\n${failures === 0 ? "ALL" : failures + " OF"} ${passes + failures} PALETTE CHECKS ${failures === 0 ? "PASS" : "FAILED"}`);
if (failures) process.exit(1);
