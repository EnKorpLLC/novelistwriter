import { SERIAL_PLATFORMS } from "@/lib/serial-export";

/** The author's release schedule for a book posted as a serial. Client-safe. */
export type SerialSettings = {
  platforms: string[];
  /** 0 = Sunday … 6 = Saturday */
  weekdays: number[];
  remind: boolean;
  noteAfter: string;
  lastRemindedOn?: string | null;
};

export const SERIAL_MIGRATION_HINT = "Database needs an update. Run supabase/migration_serial_posting.sql in the Supabase SQL editor.";

export function normalizeSerialSettings(raw: unknown): SerialSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const ids = new Set(SERIAL_PLATFORMS.map((p) => p.id));
  return {
    platforms: (Array.isArray(o.platforms) ? o.platforms : []).map(String).filter((p) => ids.has(p)).slice(0, 12),
    weekdays: [...new Set((Array.isArray(o.weekdays) ? o.weekdays : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
    remind: o.remind === true,
    noteAfter: String(o.noteAfter || "").slice(0, 2000),
    lastRemindedOn: typeof o.lastRemindedOn === "string" ? o.lastRemindedOn : null,
  };
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
