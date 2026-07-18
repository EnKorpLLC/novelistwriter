"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateProjectButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function create() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Novel" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "needs_unlock") {
          router.push("/billing?unlock=1");
          return;
        }
        throw new Error(data.error || "Failed");
      }
      router.push(`/project/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={create}
        disabled={loading}
        className="font-ui rounded-sm bg-accent px-4 py-2 text-sm text-paper hover:bg-accent-soft disabled:opacity-60"
      >
        {loading ? "Creating…" : "New project"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
