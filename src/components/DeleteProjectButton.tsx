"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteProjectButton({
  projectId,
  title,
}: {
  projectId: string;
  title: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        `Delete “${title}” and all its chapters?\n\nThis cannot be undone.`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Delete failed");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={loading}
      className="font-ui text-xs text-danger hover:underline disabled:opacity-50"
    >
      {loading ? "Deleting…" : "Delete"}
    </button>
  );
}
