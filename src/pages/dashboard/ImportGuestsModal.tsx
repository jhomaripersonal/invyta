import { useRef, useState, type ChangeEvent } from "react";
import type { GuestGroup } from "../../types/models";
import type { NewGuestInput } from "../../lib/guests-store";
import { GROUP_LABELS } from "./GuestFormModal";
import { T } from "../../lib/tokens";
import { useDialog } from "../../components/useDialog";

// Header aliases, compared after lowercasing and stripping everything but
// letters — so "Full Name", "full_name" and "FULLNAME" all match "fullname".
const COLUMN_ALIASES: Record<keyof ParsedGuest, string[]> = {
  name: ["name", "fullname", "guest", "guestname"],
  email: ["email", "emailaddress"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactnumber"],
  groupName: ["group", "groupname", "category", "side"],
  numberOfGuests: ["guests", "numberofguests", "pax", "partysize", "seats", "headcount"],
  notes: ["notes", "note", "remarks"],
};

const SAMPLE_CSV = "Name,Email,Phone,Group,Guests,Notes\nSample Guest,sample@example.com,09170000000,Family,2,Needs a vegetarian meal\n";

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z]/g, "");
}

// Minimal RFC 4180 parser: quoted fields, escaped quotes (""), commas and
// line breaks inside quotes. Excel in some locales saves with semicolons,
// so the delimiter is sniffed from the header line.
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

function toGroup(value: string): GuestGroup | undefined {
  const n = normalize(value);
  if (!n) return undefined;
  const match = (Object.entries(GROUP_LABELS) as [GuestGroup, string][]).find(([id, label]) => normalize(id) === n || normalize(label) === n);
  return match?.[0] ?? "other";
}

type ParsedGuest = Omit<NewGuestInput, "eventId" | "maxPartySize">;

function toGuests(rows: string[][]): { guests: ParsedGuest[]; skipped: number; error?: string } {
  if (rows.length < 2) return { guests: [], skipped: 0, error: "The file has no guest rows under its header." };
  const headers = rows[0].map(normalize);
  const col = (key: keyof ParsedGuest) => headers.findIndex((h) => COLUMN_ALIASES[key].includes(h));
  const idx = {
    name: col("name"),
    email: col("email"),
    phone: col("phone"),
    groupName: col("groupName"),
    numberOfGuests: col("numberOfGuests"),
    notes: col("notes"),
  };
  if (idx.name === -1) return { guests: [], skipped: 0, error: 'Couldn\'t find a "Name" column. Use the sample file\'s header row.' };

  const cell = (row: string[], i: number) => (i === -1 ? "" : (row[i] ?? "").trim());
  const guests: ParsedGuest[] = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const name = cell(row, idx.name);
    if (!name) {
      skipped++;
      continue;
    }
    const count = parseInt(cell(row, idx.numberOfGuests), 10);
    guests.push({
      name,
      email: cell(row, idx.email) || undefined,
      phone: cell(row, idx.phone) || undefined,
      groupName: toGroup(cell(row, idx.groupName)),
      numberOfGuests: Number.isFinite(count) ? Math.min(Math.max(count, 1), 20) : 1,
      notes: cell(row, idx.notes) || undefined,
    });
  }
  return { guests, skipped };
}

// Bulk-add a guest list from a spreadsheet saved as CSV. Rows are parsed
// in the browser and previewed before anything is written; on a plan with
// a guest cap, only as many rows as there are free slots are imported.
export default function ImportGuestsModal({ eventName, remainingSlots, onImport, onClose }: {
  eventName: string;
  remainingSlots: number | null;
  onImport: (guests: ParsedGuest[]) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useDialog(onClose);
  const [fileName, setFileName] = useState("");
  const [guests, setGuests] = useState<ParsedGuest[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toImport = remainingSlots === null ? guests : guests.slice(0, remainingSlots);
  const overLimit = guests.length - toImport.length;

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    const result = toGuests(parseCsv(await file.text()));
    setGuests(result.guests);
    setSkipped(result.skipped);
    if (result.error) setError(result.error);
    else if (result.guests.length === 0) setError("No rows with a guest name were found.");
    if (inputRef.current) inputRef.current.value = "";
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "invyta-guest-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    setImporting(true);
    setError("");
    try {
      await onImport(toImport);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import these guests. Please try again.");
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(28, 41, 66,0.45)" }} onClick={onClose}>
      <div {...dialog.props} className="outline-none w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: T.white }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 id={dialog.titleId} className="text-lg font-bold" style={{ color: T.charcoal }}>Import guests</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100" style={{ color: T.muted }} aria-label="Close">✕</button>
        </div>
        <p className="text-sm mb-5" style={{ color: T.muted }}>
          Add guests to <span className="font-semibold" style={{ color: T.charcoal }}>{eventName}</span> from a spreadsheet saved as CSV. Columns: Name (required), Email, Phone, Group, Guests, Notes.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <button onClick={() => inputRef.current?.click()} className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ border: `1px dashed ${T.border}`, color: T.accent }}>
            {fileName ? "Choose a different file" : "Choose CSV file"}
          </button>
          <button onClick={downloadSample} className="text-xs font-medium underline" style={{ color: T.muted }}>
            Download sample file
          </button>
          <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
        </div>

        {fileName && guests.length > 0 && (
          <>
            <p className="text-xs mb-2" style={{ color: T.muted }}>
              {fileName}: {guests.length} {guests.length === 1 ? "guest" : "guests"} found
              {skipped > 0 && ` · ${skipped} row${skipped === 1 ? "" : "s"} without a name skipped`}
            </p>
            <div className="rounded-xl overflow-hidden mb-3" style={{ border: `1px solid ${T.border}` }}>
              {toImport.slice(0, 5).map((g, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm" style={{ borderBottom: i < Math.min(toImport.length, 5) - 1 ? `1px solid ${T.border}` : undefined }}>
                  <span className="truncate" style={{ color: T.charcoal }}>{g.name}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: T.muted }}>
                    {[g.groupName ? GROUP_LABELS[g.groupName] : null, `${g.numberOfGuests} pax`].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ))}
              {toImport.length > 5 && (
                <div className="px-3.5 py-2 text-xs" style={{ backgroundColor: T.surface, color: T.muted }}>and {toImport.length - 5} more</div>
              )}
            </div>
            {overLimit > 0 && (
              <p className="text-xs mb-3" style={{ color: T.red }}>
                {remainingSlots === 0
                  ? "This event is already at its guest limit, so nothing can be imported. Upgrade for unlimited guests."
                  : `Only the first ${toImport.length} will be imported — the rest would go past this event's guest limit. Upgrade for unlimited guests.`}
              </p>
            )}
          </>
        )}

        {error && <p className="text-xs mb-3" style={{ color: T.red }}>{error}</p>}

        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ border: `1px solid ${T.border}`, color: T.charcoal }}>
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing || toImport.length === 0}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: T.accent, color: T.white }}
          >
            {importing ? "Importing..." : toImport.length > 0 ? `Import ${toImport.length} ${toImport.length === 1 ? "guest" : "guests"}` : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
