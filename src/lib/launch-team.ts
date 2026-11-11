/** L5: launch team tasks. Client-safe. */

export const TEAM_TASKS = [
  { id: "share", label: "Share the book on launch day", detail: "One post anywhere you like: social, a group chat, or your own newsletter." },
  { id: "review", label: "Post an honest review", detail: "Once you've read it, a review in launch week helps the most." },
  { id: "library", label: "Ask your library to stock it", detail: "Libraries buy what patrons ask for. Use the note below." },
] as const;

/** Teams take new members until two weeks after release */
export const TEAM_OPEN_AFTER_RELEASE_DAYS = 14;

export type TeamTaskId = (typeof TEAM_TASKS)[number]["id"];

export function isTeamTask(v: unknown): v is TeamTaskId {
  return TEAM_TASKS.some((t) => t.id === v);
}

/** Authors who thank readers this often in six months get a "Thanks readers" label on their listings */
export const THANKS_READERS_MIN = 3;

export function libraryNote(title: string, author: string) {
  return `Hello! I'd love to borrow ${title} by ${author}. Could the library add it to the collection? It's available from the usual distributors. Thank you!`;
}
