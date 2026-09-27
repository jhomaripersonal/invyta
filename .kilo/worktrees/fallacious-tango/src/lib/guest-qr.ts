// Namespaced payload so the check-in scanner can tell an Invyta guest code
// apart from any other QR code someone might point the camera at. Shared
// between the organizer's "View QR" modal and the guest's own RSVP
// confirmation screen, which both need to render the identical code.
export const GUEST_QR_PREFIX = "INVYTA_GUEST:";

export function guestQrPayload(guestId: string): string {
  return `${GUEST_QR_PREFIX}${guestId}`;
}
