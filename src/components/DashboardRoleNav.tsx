"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { rememberSide, type ProfileRoles } from "@/lib/beta-platform";

type Props = {
  roles: ProfileRoles;
  side: "author" | "beta";
};

export function DashboardRoleNav({ roles, side }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function enableBeta() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/profile/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableBetaReader: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not enable beta reader");
      rememberSide("beta");
      router.push("/beta/dashboard");
      router.refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function enableAuthor() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/profile/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableAuthor: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not enable author");
      rememberSide("author");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="font-ui flex flex-wrap items-center gap-3 text-sm">
      {side === "author" && roles.is_beta_reader && (
        <Link
          href="/beta/dashboard"
          className="text-accent hover:underline"
          onClick={() => rememberSide("beta")}
        >
          Beta reader dashboard
        </Link>
      )}
      {side === "author" && !roles.is_beta_reader && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enableBeta()}
          className="text-accent hover:underline disabled:opacity-60"
        >
          {busy ? "Enabling…" : "Become a beta reader"}
        </button>
      )}
      {side === "beta" && roles.is_author && (
        <Link
          href="/dashboard"
          className="text-accent hover:underline"
          onClick={() => rememberSide("author")}
        >
          Author dashboard
        </Link>
      )}
      {side === "beta" && !roles.is_author && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enableAuthor()}
          className="text-accent hover:underline disabled:opacity-60"
        >
          {busy ? "Enabling…" : "Become an author"}
        </button>
      )}
      {note && <span className="text-xs text-danger">{note}</span>}
    </div>
  );
}
