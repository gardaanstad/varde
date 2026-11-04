// Profiles open over the explorer like projects; any component can request one.
export const openProfileEvent = "varde-open-profile";

export function openProfile(username: string) {
  window.dispatchEvent(
    new CustomEvent<string>(openProfileEvent, { detail: username }),
  );
}
