import type { EventCategory } from "../types/models";

export interface TemplateOption {
  id: string;
  name: string;
  category: EventCategory;
  img: string;
  premium: boolean;
}

// Same demo template set shown on the landing page and dashboard template
// grids, tagged with the EventCategory each best suits, for the Create
// Event wizard's template-selection step. This is the single source of
// truth for "which templates exist" — the landing page's TemplateShowcase
// and the Dashboard's TemplatesView both import from here (rather than
// keeping their own copies) specifically so a template added once shows up
// everywhere a visitor or organizer can pick one. Full preview content per
// template (theme, sections, sample copy) lives separately in
// src/data/landing-template-previews.ts, keyed by this same `name`.
export const TEMPLATES: TemplateOption[] = [
  { id: "elegant-garden", name: "Elegant Garden", category: "wedding", img: "photo-1519741497674-611481863552", premium: true },
  { id: "golden-hour", name: "Golden Hour", category: "wedding", img: "photo-1511285560929-80b456fea0bc", premium: true },
  { id: "minimalist-ivory", name: "Minimalist Ivory", category: "wedding", img: "photo-1522673607200-164d1b6ce486", premium: true },
  { id: "wildflower-vows", name: "Wildflower Vows", category: "wedding", img: "photo-1583939003579-730e3918a45a", premium: false },
  { id: "pastel-dreams", name: "Pastel Dreams", category: "birthday", img: "photo-1464349153735-7db50ed83c84", premium: false },
  { id: "tropical-fiesta", name: "Tropical Fiesta", category: "birthday", img: "photo-1533105079780-92b9be482077", premium: false },
  { id: "balloon-bash", name: "Balloon Bash", category: "birthday", img: "photo-1530103862676-de8c9debad1d", premium: false },
  { id: "royal-debut", name: "Royal Debut", category: "debut", img: "photo-1566633806327-68e152aaf26d", premium: true },
  { id: "chandelier-ball", name: "Chandelier Ball", category: "debut", img: "photo-1519167758481-83f550bb49b3", premium: true },
  { id: "soft-blooms", name: "Soft Blooms", category: "baptism", img: "photo-1515488042361-ee00e0ddd4e4", premium: false },
  { id: "little-blessing", name: "Little Blessing", category: "baptism", img: "photo-1544126592-807ade215a0b", premium: false },
  { id: "modern-grad", name: "Modern Grad", category: "graduation", img: "photo-1517486808906-6ca8b3f04846", premium: false },
  { id: "cap-toss", name: "Cap Toss", category: "graduation", img: "photo-1622547748225-3fc4abd2cca0", premium: false },
  { id: "classic-navy", name: "Classic Navy", category: "company_party", img: "photo-1454165804606-c3d57bc86b40", premium: false },
  { id: "boardroom-classic", name: "Boardroom Classic", category: "company_party", img: "photo-1511578314322-379afb476865", premium: true },
  { id: "grand-summit", name: "Grand Summit", category: "company_party", img: "photo-1560439514-4e9645039924", premium: true },
];

export function templatesForCategory(category: EventCategory): TemplateOption[] {
  const matches = TEMPLATES.filter((t) => t.category === category);
  return matches.length > 0 ? matches : TEMPLATES;
}
