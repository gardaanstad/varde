import "server-only";

let last = 0;

/**
 * The server's time, never earlier than a time it gave before. The system
 * clock can step back (a VM resyncing, NTP), and unread counts compare times
 * taken in different requests, so a step back would reorder them.
 */
export function serverNow() {
  last = Math.max(Date.now(), last + 1);
  return new Date(last);
}
