import { Reorder, useDragControls } from "framer-motion";
import type { EventCategory, InvitationSection, InvitationSectionType } from "../../../types/models";
import { categoryProfile } from "../../../data/category-profiles";
import { Icon } from "../../../components/Icon";
import { useEventPlan } from "../../../lib/event-plan-context";
import { planAllows } from "../../../data/plan-limits";
import { T } from "../../../lib/tokens";

const SECTION_ICON: Record<InvitationSectionType, Parameters<typeof Icon>[0]["name"]> = {
  cover: "photo",
  countdown: "clock",
  details: "list",
  story: "message",
  schedule: "calendar",
  venue: "pin",
  gallery: "images",
  video: "video",
  dress_code: "tag",
  entourage: "users",
  gift_registry: "gift",
  faq: "help",
  rsvp: "checkCircle",
};

function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill={T.muted}>
      {[3, 8, 13].map((y) =>
        [2, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />),
      )}
    </svg>
  );
}

interface Props {
  sections: InvitationSection[];
  // Sections are named for the event's category (see category-profiles.ts).
  category: EventCategory;
  selected: InvitationSectionType | null;
  onSelect: (type: InvitationSectionType) => void;
  onToggle: (type: InvitationSectionType) => void;
  onReorder: (order: InvitationSectionType[]) => void;
}

export function SectionSidebar({ sections, category, selected, onSelect, onToggle, onReorder }: Props) {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const copy = categoryProfile(category).sections;

  return (
    <Reorder.Group
      axis="y"
      values={ordered.map((s) => s.type)}
      onReorder={onReorder}
      className="h-full overflow-y-auto py-3 px-2 space-y-0.5"
    >
      {ordered.map((section) => (
        <SectionRow
          key={section.type}
          section={section}
          name={copy[section.type].name}
          active={selected === section.type}
          onSelect={() => onSelect(section.type)}
          onToggle={() => onToggle(section.type)}
        />
      ))}
    </Reorder.Group>
  );
}

function SectionRow({
  section,
  name,
  active,
  onSelect,
  onToggle,
}: {
  section: InvitationSection;
  name: string;
  active: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  // Dragging is opt-in from the grip handle only (dragListener={false} +
  // manually started drag controls) — otherwise the whole row would start
  // a drag on every tap, and picking a section to edit (the row's other
  // job) would fight with reordering it on both touch and mouse.
  const controls = useDragControls();
  const plan = useEventPlan();
  const lockedPro = section.type === "video" && !planAllows(plan, "video");

  return (
    <Reorder.Item
      value={section.type}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-1 rounded-xl px-1.5 py-1.5 transition-colors"
      style={{ backgroundColor: active ? T.surface : "transparent" }}
      whileDrag={{ backgroundColor: T.white, boxShadow: "0 4px 14px rgba(28,41,66,0.18)" }}
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        className="w-4 h-6 flex-shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        style={{ color: T.muted }}
        aria-label={`Drag to reorder ${name}`}
      >
        <GripIcon />
      </button>

      <button onClick={onSelect} className="flex items-center gap-2 flex-1 min-w-0 text-left py-1">
        <span className="flex-shrink-0"><Icon name={SECTION_ICON[section.type]} size={15} color={section.enabled ? T.accent : T.muted} /></span>
        <span
          className="text-sm truncate"
          style={{ color: section.enabled ? T.charcoal : T.muted, fontWeight: active ? 600 : 500 }}
        >
          {name}
        </span>
        {lockedPro && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: T.accent, color: T.white }}>Pro</span>}
      </button>

      <button
        role="switch"
        aria-checked={section.enabled}
        aria-label={`${section.enabled ? "Disable" : "Enable"} ${name}`}
        onClick={onToggle}
        className="w-7 h-4 rounded-full relative transition-colors ml-1 flex-shrink-0"
        style={{ backgroundColor: section.enabled ? T.accent : T.border }}
      >
        <span
          className="absolute top-0.5 w-3 h-3 rounded-full transition-transform"
          style={{ backgroundColor: T.white, transform: section.enabled ? "translateX(14px)" : "translateX(2px)" }}
        />
      </button>
    </Reorder.Item>
  );
}
