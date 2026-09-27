import type { EventCategory } from "../types/models";

export interface EventCategoryOption {
  id: EventCategory;
  label: string;
  group: "Personal" | "Academic" | "Corporate" | "Community" | "Memorial";
}

// Mirrors the event categories in the product spec (§6).
export const EVENT_CATEGORIES: EventCategoryOption[] = [
  { id: "wedding", label: "Wedding", group: "Personal" },
  { id: "birthday", label: "Birthday", group: "Personal" },
  { id: "debut", label: "Debut", group: "Personal" },
  { id: "baptism", label: "Baptism", group: "Personal" },
  { id: "anniversary", label: "Anniversary", group: "Personal" },
  { id: "engagement", label: "Engagement", group: "Personal" },
  { id: "baby_shower", label: "Baby Shower", group: "Personal" },
  { id: "bridal_shower", label: "Bridal Shower", group: "Personal" },
  { id: "house_blessing", label: "House Blessing", group: "Personal" },
  { id: "graduation", label: "Graduation", group: "Academic" },
  { id: "recognition", label: "Recognition", group: "Academic" },
  { id: "school_reunion", label: "School Reunion", group: "Academic" },
  { id: "class_reunion", label: "Class Reunion", group: "Academic" },
  { id: "company_party", label: "Company Party", group: "Corporate" },
  { id: "team_building", label: "Team Building", group: "Corporate" },
  { id: "seminar", label: "Seminar", group: "Corporate" },
  { id: "conference", label: "Conference", group: "Corporate" },
  { id: "product_launch", label: "Product Launch", group: "Corporate" },
  { id: "christmas_party", label: "Christmas Party", group: "Corporate" },
  { id: "barangay_event", label: "Barangay Event", group: "Community" },
  { id: "fundraiser", label: "Fundraiser", group: "Community" },
  { id: "charity_event", label: "Charity Event", group: "Community" },
  { id: "organization_gathering", label: "Organization Gathering", group: "Community" },
  { id: "wake", label: "Wake", group: "Memorial" },
  { id: "memorial_gathering", label: "Memorial Gathering", group: "Memorial" },
  { id: "celebration_of_life", label: "Celebration of Life", group: "Memorial" },
];

export const EVENT_CATEGORY_GROUPS = ["Personal", "Academic", "Corporate", "Community", "Memorial"] as const;
