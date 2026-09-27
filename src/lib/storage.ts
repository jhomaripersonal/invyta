import { supabase } from "./supabase-client";

const BUCKET = "invitation-images";
// Background music (Pro) — see supabase/add-background-music.sql.
const AUDIO_BUCKET = "invitation-audio";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
// What the bucket accepts, by file extension — browsers report .m4a in
// several ways (or not at all), so the type is taken from the name.
const AUDIO_TYPES: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg" };
// The bucket's own limit (see schema.sql), applied to what we upload.
const MAX_BYTES = 5 * 1024 * 1024;
// What an organizer may pick: phone photos are often 8–15 MB, and they're
// shrunk below before upload, so the original can be much bigger.
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
// Longest edge after resizing — sharp on a full-width desktop hero, a
// fraction of a phone original's size.
const MAX_EDGE = 2000;
const QUALITY = 0.82;

// Guests open invitations on phones, often on mobile data, and every
// uploaded photo is downloaded as stored. So photos are resized to at most
// MAX_EDGE on their longest side and re-encoded (WebP where the browser
// can encode it, else JPEG) before upload — typically a few hundred KB
// instead of several MB. GIFs (which may be animated) and SVGs are left
// as they are, as is anything already small enough.
async function prepareImage(file: File): Promise<{ blob: Blob; ext: string }> {
  const originalExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { blob: file, ext: originalExt };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { blob: file, ext: originalExt };
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 600 * 1024) {
    bitmap.close();
    return { blob: file, ext: originalExt };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { blob: file, ext: originalExt };
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
  // toBlob silently falls back to PNG for types it can't encode — check.
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp" && webp.size < file.size) return { blob: webp, ext: "webp" };
  const jpeg = await encode("image/jpeg");
  if (jpeg && jpeg.size < file.size) return { blob: jpeg, ext: "jpg" };
  return { blob: file, ext: originalExt };
}

export async function uploadInvitationImage(ownerId: string, eventId: string, file: File): Promise<string> {
  if (file.size > MAX_INPUT_BYTES) throw new Error("Image is too large — 25MB max.");
  const { blob, ext } = await prepareImage(file);
  if (blob.size > MAX_BYTES) throw new Error("Image is too large even after resizing — please choose a smaller one.");
  // Path convention the Storage policies key off of: "<uid>/<eventId>/...".
  const path = `${ownerId}/${eventId}/${crypto.randomUUID()}.${ext}`;
  // Each upload gets a fresh random name, so it can be cached forever.
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { cacheControl: "31536000", upsert: false, contentType: blob.type || file.type });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Audio is streamed as uploaded (no re-encoding in the browser), so the
// limit is on the file itself: a 3–4 minute MP3 is typically 3–8 MB.
export async function uploadInvitationAudio(ownerId: string, eventId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = AUDIO_TYPES[ext];
  if (!contentType) throw new Error("Please choose an MP3, M4A, AAC or OGG audio file.");
  if (file.size > MAX_AUDIO_BYTES) throw new Error("Audio file is too large — 10MB max. A shorter clip or a lower-quality MP3 will fit.");
  const path = `${ownerId}/${eventId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType });
  if (error) throw error;
  return supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Removes every photo and audio file this organizer ever uploaded — used
// by account deletion, since Storage objects can't be deleted from SQL
// along with the rest of their data.
export async function deleteAllUserUploads(ownerId: string): Promise<void> {
  await deleteAllInBucket(BUCKET, ownerId);
  await deleteAllInBucket(AUDIO_BUCKET, ownerId);
}

// Objects are laid out as "<uid>/<eventId>/<file>", so list the user's
// folder for its event subfolders, then each subfolder for its files. The
// delete policy only allows removing your own folder.
async function deleteAllInBucket(bucketId: string, ownerId: string): Promise<void> {
  const bucket = supabase.storage.from(bucketId);
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
