export type WorkspaceTab = "write" | "bible" | "beta" | "arc" | "publish" | "serial" | "sell" | "format" | "cover" | "audio" | "tools";

/** Every tab, with the label shown in its group's second row. Ids stay stable: links like ?tab=arc keep working. */
export const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "bible", label: "Bible" },
  { id: "beta", label: "Beta readers" },
  { id: "arc", label: "Advance copies" },
  { id: "publish", label: "Launch page" },
  { id: "serial", label: "Serial" },
  { id: "sell", label: "Sell" },
  { id: "format", label: "Format" },
  { id: "cover", label: "Cover" },
  { id: "audio", label: "Audio" },
  { id: "tools", label: "Tools" },
];

/** The top row: related tabs share one button, with their own row underneath. */
export const WORKSPACE_GROUPS: { id: string; label: string; tabs: WorkspaceTab[] }[] = [
  { id: "write", label: "Write", tabs: ["write"] },
  { id: "bible", label: "Bible", tabs: ["bible"] },
  { id: "readers", label: "Readers", tabs: ["beta", "arc"] },
  { id: "launch", label: "Launch", tabs: ["publish", "serial"] },
  { id: "sell", label: "Sell", tabs: ["sell"] },
  { id: "make", label: "Make", tabs: ["format", "cover", "audio"] },
  { id: "tools", label: "Tools", tabs: ["tools"] },
];

export function groupOf(tab: WorkspaceTab) {
  return WORKSPACE_GROUPS.find((g) => g.tabs.includes(tab)) || WORKSPACE_GROUPS[0];
}

export function tabLabel(tab: WorkspaceTab) {
  return WORKSPACE_TABS.find((t) => t.id === tab)?.label || tab;
}

export function isWorkspaceTab(value: string | null | undefined): value is WorkspaceTab {
  return WORKSPACE_TABS.some((t) => t.id === value);
}
