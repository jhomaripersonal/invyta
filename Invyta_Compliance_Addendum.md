# Invyta — Compliance & Trust Addendum

Supplement to *Invyta_Complete_Product_Business_Specification.pdf*. Covers legal, privacy, and trust-and-safety requirements the base spec references but does not define. Written as a working addendum — items should be validated with counsel before launch, particularly the Data Privacy Act sections.

---

## 1. Philippine Data Privacy Act (RA 10173) Compliance

Invyta processes personal data of both organizers (account holders) and guests (invitees who never register). This is the single biggest compliance gap in the base spec.

**Personal data collected:**
- Organizers: name, email, phone, payment details (via processor, not stored raw).
- Guests: name, email, phone, RSVP responses, dietary restrictions, plus-one names, sometimes addresses (accommodation/transportation fields per §15 of the base spec).

**Requirements:**
- Register with the National Privacy Commission (NPC) if guest records exceed 1,000 individuals or processing is deemed high-risk (weddings/corporate events at scale will likely cross this).
- Publish a Privacy Policy covering: what is collected, purpose, retention period, third parties data is shared with (payment processors, SMS/email vendors), and how a data subject can request access, correction, or deletion.
- Guests submitting RSVP data have not "signed up" for Invyta — they are data subjects of the *organizer's* processing, with Invyta as processor. The organizer is the data controller for their event's guest list. This distinction should be stated explicitly in the ToS so liability is clear.
- Implement a Data Subject Access Request (DSAR) flow: a guest can ask "what do you have on me" or "delete my RSVP" without needing an account.
- Breach notification: any data breach affecting sensitive personal information (e.g., health-adjacent dietary/allergy data) must be reported to the NPC and affected users within 72 hours.

**Product implication:** the `guests` and `rsvps` tables (§33 of base spec) need a `consent_recorded_at` and `deleted_at` (soft-delete) column, not just standard CRUD fields.

## 2. Data Retention & Deletion

The base spec has no retention policy. Recommended defaults (adjust after legal review):

| Data | Retention | Trigger |
|---|---|---|
| Guest RSVP records | 12 months post-event, then anonymized or deleted | Event date + 365 days |
| Event analytics (aggregate) | Indefinite, but de-identified after 12 months | — |
| Organizer account data | Retained while account active; deleted 30 days after account deletion request | User-initiated |
| Uploaded photos (gallery) | Deleted with event, or after retention window | Event deletion or expiry |
| Payment records | 5 years (BIR record-keeping requirement for PH businesses) | — |

Add a scheduled job (background worker, per §36 tech stack) to enforce this rather than relying on manual admin cleanup.

## 3. Consent & Guest-Facing Notices

- RSVP forms must include a short consent line ("By submitting, you agree your info will be shared with the event organizer for guest management purposes") — not just a submit button.
- If SMS/email reminders are enabled (§27), guests should be able to opt out of reminders independent of their RSVP status.
- Cookie/analytics consent banner needed on the public landing page for EU/international visitors if the product later expands beyond PH (not urgent for MVP, flag for Phase 2+).

## 4. Terms of Service & Content Moderation

The base spec lists "abuse reports" as an Admin Portal module (§31) without defining what's reportable or how it's actioned.

**Needed:**
- A ToS defining prohibited content on invitations/galleries: no hate speech, no commercial spam, no impersonation, no content for events that don't exist (fraud risk — invitations could be misused for scams/fake fundraisers given the "Fundraisers, Charity Events" category in §6).
- A moderation workflow: user reports → queued in Admin Portal → reviewed within a defined SLA (e.g., 48 hours) → content takedown or account suspension.
- Especially relevant for the future Template Marketplace (§30) — designer-submitted templates need a review step before going live, plus an IP/copyright attestation from the submitter.

## 5. Payments Compliance

- Base spec (§32) correctly says "do not store raw card details" — confirm the PSP (payment service provider) used for GCash/Maya/cards is BSP-licensed (e.g., PayMongo, Xendit) and PCI-DSS compliant so Invyta itself never touches card data (tokenization only).
- Refund/cancellation policy is undefined. Recommend: event purchases (Premium/Pro tiers, §29) are non-refundable once the invitation is published or guests have been invited, refundable within 24 hours if unpublished — this needs to be stated at checkout, not just implied.
- BIR (Bureau of Internal Revenue) invoicing/receipt requirements for a PH-registered business — official receipts must be issued for paid transactions.

## 6. Accessibility Standard

The design prompt says "accessible design principles" without a target. Recommend formally adopting **WCAG 2.1 Level AA** as the acceptance bar for:
- Color contrast (relevant given the gold-on-cream palette — verify `#C9A96E` on `#FAF8F5` meets 4.5:1 for body text; it likely does not at small sizes and should be reserved for large text/accents only).
- Keyboard navigation through the Invitation Builder.
- Screen-reader labels on icon-only buttons (the current dashboard has several icon buttons — e.g. notification bell, search — without `aria-label`).

## 7. Guest Privacy Between Guests

Base spec §38 states guests should not automatically see other guests — this addendum adds the enforcement detail: guest-token URLs (personalized invitations, §17) must not be sequential/guessable IDs (use UUIDs or signed tokens), otherwise one guest could enumerate others' RSVP data by editing the URL.

**Status: enforced as of the Supabase migration (`supabase/schema.sql`).** Guest records now live in Postgres behind a Row Level Security policy that only grants `SELECT` to the owning event's organizer — no client-side code path can read another guest's RSVP data, not just "the UI doesn't show it." Event IDs and slugs are still UUIDs/random slugs, not sequential, satisfying the guessability note above too. The earlier `localStorage`-based prototype had neither property: all guest data for all events sat in one unauthenticated browser store, readable via devtools by anyone using that browser.

## 8. Open Items Requiring Legal Review Before Launch

1. NPC registration threshold confirmation for expected guest-list volumes.
2. Standard Privacy Policy / ToS drafting (not just this addendum) reviewed by PH counsel.
3. Confirm whether "Memorial: Wake, Memorial Gathering" (§6 category) requires special sensitivity handling in moderation guidelines.
4. Data processing agreement (DPA) template between Invyta and Event Planner Plan clients who manage guest data on behalf of their own clients (agency use case, §29).
