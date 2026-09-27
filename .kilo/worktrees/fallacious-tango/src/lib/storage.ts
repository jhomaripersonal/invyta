import { supabase } from "./supabase-client";

const BUCKET = "invitation-images";
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadInvitationImage(ownerId: string, eventId: string, file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error("Image is too large — 5MB max.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  // Path convention the Storage policies key off of: "<uid>/<eventId>/...".
  const path = `${ownerId}/${eventId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Removes every photo this organizer ever uploaded — used by account
// deletion, since Storage objects can't be deleted from SQL along with the
// rest of their data. Objects are laid out as "<uid>/<eventId>/<file>", so
// list the user's folder for its event subfolders, then each subfolder
// for its files. The delete policy only allows removing your own folder.
export async function deleteAllUserImages(ownerId: string): Promise<void> {
  const bucket = supabase.storage.from(BUCKET);
  const { data: folders, error } = await bucket.list(ownerId, { limit: 1000 });
  if (error) throw error;
  const paths: string[] = [];
  for (const entry of folders ?? []) {
    // Folders come back as entries with no id; files directly under the
    // user's root (not expected, but harmless) have one.
    if (entry.id) {
      paths.push(`${ownerId}/${entry.name}`);
      continue;
    }
    const { data: files, error: listError } = await bucket.list(`${ownerId}/${entry.name}`, { limit: 1000 });
    if (listError) throw listError;
    for (const file of files ?? []) paths.push(`${ownerId}/${entry.name}/${file.name}`);
  }
  for (let i = 0; i < paths.length; i += 100) {
    const { error: removeError } = await bucket.remove(paths.slice(i, i + 100));
    if (removeError) throw removeError;
  }
}
