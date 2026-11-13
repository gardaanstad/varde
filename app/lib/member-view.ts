/**
 * A moderator can see the app as a member does. The choice is a cookie, so
 * the server gives them a member's rights too; it can only take rights away,
 * so it needs no protection.
 */
export const memberViewCookie = "varde-member-view";

export function memberViewOn(cookieHeader: string | null | undefined) {
  return (cookieHeader ?? "")
    .split(";")
    .some((part) => part.trim() === `${memberViewCookie}=1`);
}

/** Client only. */
export function storeMemberView(on: boolean) {
  document.cookie = on
    ? `${memberViewCookie}=1; path=/; max-age=31536000; samesite=lax`
    : `${memberViewCookie}=; path=/; max-age=0; samesite=lax`;
}
