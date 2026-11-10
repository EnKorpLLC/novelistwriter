/** Buttons authors can put on their own site or newsletter. Every one goes back to the book's launch page. */
export const EMBED_BUTTONS = [
  { id: "buy", label: "Get the book", path: "", when: "Once it's out (before then the page shows preorders or Coming soon)" },
  { id: "notify", label: "Notify me on release", path: "", when: "Before release" },
  { id: "beta", label: "Join my beta", path: "", when: "While beta reading is open" },
  { id: "arc", label: "Request an ARC", path: "", when: "While advance copies are open" },
  { id: "sample", label: "Read a sample", path: "/sample", when: "When the first-chapter sample is on" },
] as const;

export type EmbedButtonId = (typeof EMBED_BUTTONS)[number]["id"];

/** PNG size at 2x; show it at half size so it stays sharp on phones. */
export function buttonImageSize(label: string, check = false) {
  return { width: Math.max(320, Math.ceil(label.length * 17) + (check ? 140 : 112)), height: 88 };
}

export function embedButton(id: string) {
  return EMBED_BUTTONS.find((b) => b.id === id) || null;
}

/** Tagged so marketing results show which button and where it was posted. */
export function buttonLink(launchUrl: string, id: EmbedButtonId, where: "website" | "newsletter") {
  const b = embedButton(id)!;
  const u = new URL(`${launchUrl}${b.path}`);
  u.searchParams.set("utm_source", where);
  u.searchParams.set("utm_medium", where === "newsletter" ? "email" : "referral");
  u.searchParams.set("utm_campaign", `button-${id}`);
  return u.toString();
}
