export type WorkspaceTab = "write" | "bible" | "beta" | "arc" | "publish" | "tools";

export const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "bible", label: "Bible" },
  { id: "beta", label: "Beta" },
  { id: "arc", label: "ARC" },
  { id: "publish", label: "Publish" },
  { id: "tools", label: "Tools" },
];

export function isWorkspaceTab(value: string | null | undefined): value is WorkspaceTab {
  return WORKSPACE_TABS.some((t) => t.id === value);
}
