import type { InvitationConfig, InvitationSectionType } from "../types/models";
import type { TemplateDesign } from "./landing-template-previews";
import { SECTION_STYLES } from "./section-styles";

// Restyles an existing invitation with a template's design — palette,
// fonts, buttons, page layout, cover style and section styles — without
// touching its content (text, photos, schedule, guest-facing details) or
// which sections are turned on. Styled sections the template doesn't set
// go back to their default look, so the result matches the template's
// preview rather than mixing in leftovers from the previous design.
// Gallery layout/filter aren't part of template designs and are kept.
export function applyTemplateDesign(config: InvitationConfig, design: TemplateDesign): InvitationConfig {
  return {
    theme: { ...design.theme },
    sections: config.sections.map((section) => {
      const style = styleFor(section.type, design);
      if (style === null) return section;
      const content = { ...section.content };
      if (style) content.style = style;
      else delete content.style;
      return { ...section, content };
    }),
  };
}

// The style a template gives a section: a style id, "" for the section's
// default look, or null for sections that have no styles at all.
function styleFor(type: InvitationSectionType, design: TemplateDesign): string | null {
  if (type === "cover") return design.coverStyle;
  if (!SECTION_STYLES[type]) return null;
  return design.sectionStyles[type] ?? "";
}
