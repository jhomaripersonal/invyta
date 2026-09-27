// Template & design-option consistency. Checks, by reading the sources:
//  • the database's Premium lists (design_style_is_premium,
//    template_is_premium) match the `premium` flags in the TypeScript
//    option lists — so what the UI locks is exactly what the server blocks;
//  • free templates use no Premium layout/cover/section style (otherwise
//    creating an event from one on the Free plan would be rejected);
//  • every Premium template uses at least one Premium option;
//  • no two templates in a category share a layout + cover pair;
//  • every style a template references exists.
// Run: pnpm test:templates
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
let failures = 0;
let passes = 0;
const check = (label, ok, extra = "") => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${extra ? "  — " + extra : ""}`);
};

const opts = (block) => [...block.matchAll(/id: "([a-z_]+)".*?premium: (true|false)/g)].map((m) => ({ id: m[1], premium: m[2] === "true" }));

// ── option lists ──
const pageLayouts = read("src/data/page-layouts.ts");
const layouts = opts(pageLayouts.slice(pageLayouts.indexOf("PAGE_LAYOUTS"), pageLayouts.indexOf("COVER_STYLES:")));
const covers = opts(pageLayouts.slice(pageLayouts.indexOf("COVER_STYLES:"), pageLayouts.indexOf("export function pageLayout")));
const sectionOpts = {};
for (const m of read("src/data/section-styles.ts").matchAll(/^ {2}([a-z_]+): \[([\s\S]*?)\n {2}\],/gm)) sectionOpts[m[1]] = opts(m[2]);

// ── SQL ──
const sql = read("supabase/schema.sql");
const fnBody = (name) => {
  const start = sql.indexOf(`create or replace function public.${name}`);
  return sql.slice(start, sql.indexOf("$$;", sql.indexOf("$$", start) + 2));
};

console.log("=== Database Premium lists match the app ===");
const design = fnBody("design_style_is_premium");
const sqlFreeLayouts = design.match(/not in \(([^)]*)\)/)[1].match(/'([a-z]+)'/g).map((x) => x.slice(1, -1)).sort();
const tsFreeLayouts = layouts.filter((l) => !l.premium).map((l) => l.id).sort();
check("free page layouts", tsFreeLayouts.join() === sqlFreeLayouts.join(), `TS=${tsFreeLayouts} SQL=${sqlFreeLayouts}`);
const sqlPairs = design.slice(design.indexOf("any (array[")).match(/'([a-z_]+:[a-z]+)'/g).map((x) => x.slice(1, -1)).sort();
const tsPairs = [
  ...covers.filter((c) => c.premium).map((c) => `cover:${c.id}`),
  ...Object.entries(sectionOpts).flatMap(([t, os]) => os.filter((o) => o.premium).map((o) => `${t}:${o.id}`)),
].sort();
check("Premium cover & section styles", tsPairs.join() === sqlPairs.join(), `TS=${tsPairs} SQL=${sqlPairs}`);

const catalog = read("src/data/templates.ts");
const tsPremiumTemplates = [...catalog.matchAll(/id: "([a-z-]+)".*premium: true/g)].map((m) => m[1]).sort();
const sqlPremiumTemplates = [...fnBody("template_is_premium").matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
check("Premium templates", tsPremiumTemplates.join() === sqlPremiumTemplates.join(), `TS=${tsPremiumTemplates} SQL=${sqlPremiumTemplates}`);

// ── templates ──
console.log("\n=== Templates ===");
const catalogLines = catalog.split(/\r?\n/);
const previews = read("src/data/landing-template-previews.ts");
const parts = previews.split(/templateName: /).slice(1).filter((p) => p.startsWith('"'));
const seen = {};
for (const part of parts) {
  const name = part.match(/^"([^"]+)"/)[1];
  const line = catalogLines.find((l) => l.includes(`name: "${name}"`));
  if (!line) {
    check(`${name}: in the template catalog`, false);
    continue;
  }
  const premiumTpl = /premium: true/.test(line);
  const category = line.match(/category: "([a-z_]+)"/)[1];
  const layout = part.match(/layout: "([a-z]+)"/)[1];
  const cover = part.match(/coverStyle: "([a-z]+)"/)[1];
  const ss = part.match(/sectionStyles: \{([^}]*)\}/);
  const sectionStyles = ss ? Object.fromEntries([...ss[1].matchAll(/([a-z_]+): "([a-z]+)"/g)].map((m) => [m[1], m[2]])) : {};
  const content = part.slice(part.indexOf("content: {"));

  const used = [layouts.find((x) => x.id === layout), covers.find((x) => x.id === cover)];
  const problems = [];
  if (!used[0]) problems.push(`unknown layout ${layout}`);
  if (!used[1]) problems.push(`unknown cover ${cover}`);
  for (const [type, id] of Object.entries(sectionStyles)) {
    const o = (sectionOpts[type] || []).find((x) => x.id === id);
    if (!o) problems.push(`unknown ${type} style ${id}`);
    else used.push(o);
    if (!new RegExp(`^\\s{6}${type}: `, "m").test(content)) problems.push(`styles ${type} but doesn't enable it`);
  }
  const usesPremium = used.some((u) => u?.premium);
  if (!premiumTpl && usesPremium) problems.push("free template uses a Premium option");
  if (premiumTpl && !usesPremium) problems.push("Premium template uses no Premium option");
  const key = `${category}|${layout}|${cover}`;
  if (seen[key]) problems.push(`same layout+cover as ${seen[key]}`);
  seen[key] = name;
  check(`${premiumTpl ? "[Premium] " : ""}${name} (${layout} / ${cover})`, problems.length === 0, problems.join("; "));
}
check("every catalog template has a design", parts.length === [...catalog.matchAll(/\{ id: "/g)].length, `${parts.length} designs`);

console.log(failures === 0 ? `\nALL ${passes} TEMPLATE CHECKS PASS` : `\n${failures} FAILURE(S), ${passes} passed`);
process.exitCode = failures === 0 ? 0 : 1;
