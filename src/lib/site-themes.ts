import type { CSSProperties } from "react";

/** Theme presets for author mini-sites and launch pages; they swap the site's color variables. */
export const SITE_THEMES = {
  paper: {
    label: "Paper",
    vars: {},
  },
  ink: {
    label: "Ink",
    vars: {
      "--ink": "#f1ece2",
      "--paper": "#16140f",
      "--paper-deep": "#221f18",
      "--accent": "#d8b36a",
      "--accent-soft": "#e6c88b",
      "--muted": "#a89f90",
      "--line": "#3a352b",
    },
  },
  sage: {
    label: "Sage",
    vars: {
      "--ink": "#1f2a24",
      "--paper": "#eef2ec",
      "--paper-deep": "#dde6da",
      "--accent": "#4a6b57",
      "--accent-soft": "#5f8570",
      "--muted": "#5d6b62",
      "--line": "#c4d1c3",
    },
  },
  rose: {
    label: "Rose",
    vars: {
      "--ink": "#2b1a1d",
      "--paper": "#faf1ef",
      "--paper-deep": "#f1dfdb",
      "--accent": "#9b3b4b",
      "--accent-soft": "#b2566a",
      "--muted": "#76605f",
      "--line": "#e2c9c4",
    },
  },
} as const;

export type SiteThemeId = keyof typeof SITE_THEMES;

export function normalizeTheme(raw: unknown): SiteThemeId {
  return typeof raw === "string" && raw in SITE_THEMES ? (raw as SiteThemeId) : "paper";
}

export function themeStyle(theme: SiteThemeId): CSSProperties {
  return {
    ...(SITE_THEMES[theme].vars as Record<string, string>),
    background: "var(--paper)",
    color: "var(--ink)",
  } as CSSProperties;
}
