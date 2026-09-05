"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BetaFormFields } from "@/components/BetaFormFields";
import type { BetaApplicationForm } from "@/lib/beta-form";

type GateData = {
  projectId: string;
  title: string;
  genre: string;
  betaReady: boolean;
  authorUserId?: string;
  authorName: string;
  coverUrl: string | null;
  applicationForm: BetaApplicationForm;
  reviews: { id: string; body: string; createdAt: string; readerName: string }[];
  loggedIn: boolean;
  access: string;
  message?: string;
  reason?: string;
  readUrl?: string;
  email?: string | null;
  currentChapterId?: string | null;
  reapply?: boolean;
};

export default function BetaBookGatePage() {
  const params = useParams();
  const projectId = String(params.projectId || "");
  const router = useRouter();
  const [data, setData] = useState<GateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/beta/book/${projectId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Not found");
      setData(json);
      if (json.loggedIn && json.authorUserId) {
        const folRes = await fetch("/api/beta/follows");
        if (folRes.ok) {
          const fol = await folRes.json();
          const ids = new Set(
            ((fol.follows || []) as { authorUserId: string }[]).map((f) => f.authorUserId)
          );
          setFollowing(ids.has(json.authorUserId));
        }
      } else {
        setFollowing(false);
      }
      if (json.access === "approved" && json.readUrl) {
        const q = json.currentChapterId ? `?chapter=${json.currentChapterId}` : "";
        router.replace(`${json.readUrl}${q}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function apply() {
    if (!data?.email) return;
    setBusy(true);
    setApplyMsg("");
    try {
      const res = await fetch("/api/beta/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          email: data.email,
          displayName,
          answers,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || "Application failed");
      if (json.readUrl) {
        router.push(json.readUrl);
        return;
      }
      setApplyMsg(json.message || "Application submitted.");
      void load();
    } catch (err) {
      setApplyMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFollow() {
    if (!data?.authorUserId || !data.loggedIn) return;
    setFollowBusy(true);
    try {
      const action = following ? "unfollow" : "follow";
      const res = await fetch("/api/beta/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorUserId: data.authorUserId, action }),
      });
      const json = await res.json();
      if (!res.ok) return;
      setFollowing(Boolean(json.following));
    } finally {
      setFollowBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-danger">{error || "Not found"}</p>
        <Link href="/beta/dashboard" className="mt-4 inline-block text-accent underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (data.access === "approved") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-muted">Opening manuscript…</p>
      </div>
    );
  }

  const next = encodeURIComponent(`/beta/book/${projectId}`);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/beta/dashboard" className="font-ui text-xs text-accent underline">
        ← Dashboard
      </Link>
      <p className="font-ui mt-6 text-xs uppercase tracking-wide text-muted">Beta manuscript</p>
      <h1 className="font-display mt-2 text-3xl">{data.title}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">
          {data.authorName} · {data.genre}
        </p>
        {data.loggedIn && data.authorUserId && (
          <button
            type="button"
            disabled={followBusy}
            onClick={() => void toggleFollow()}
            className="font-ui border border-line px-3 py-1 text-xs text-accent disabled:opacity-60"
          >
            {followBusy ? "…" : following ? "Unfollow" : "Follow"}
          </button>
        )}
      </div>

      {!data.loggedIn && (
        <div className="mt-8 border border-line bg-paper p-5">
          <p className="text-sm text-ink">Log in or create a beta reader account to continue.</p>
          <div className="mt-4 flex flex-wrap gap-3 font-ui text-sm">
            <Link href={`/login?next=${next}`} className="bg-accent px-4 py-2 text-paper">
              Log in
            </Link>
            <Link href="/beta/signup" className="border border-line px-4 py-2 text-accent">
              Sign up as reader
            </Link>
          </div>
        </div>
      )}

      {data.loggedIn && data.access === "pending_review" && (
        <p className="mt-8 text-sm text-ink">
          {data.message}
          {data.reason ? ` ${data.reason}` : ""}
        </p>
      )}

      {data.loggedIn && (data.access === "denied" || data.access === "removed") && (
        <p className="mt-8 text-sm text-danger">
          {data.message}
          {data.reason ? ` ${data.reason}` : ""}
        </p>
      )}

      {data.loggedIn && data.access === "apply" && (
        <div className="mt-8 space-y-4 border border-line p-5">
          <h2 className="font-display text-xl">
            {data.reapply ? "Apply again" : "Apply to beta read"}
          </h2>
          {data.reapply && data.message && (
            <p className="text-sm text-muted">{data.message}</p>
          )}
          <BetaFormFields
            form={data.applicationForm}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            email={data.email || ""}
            showEmail={false}
            answers={answers}
            onAnswersChange={setAnswers}
          />
          <p className="text-xs text-muted">Applying as {data.email}</p>
          {applyMsg && <p className="text-sm text-accent">{applyMsg}</p>}
          <button
            type="button"
            disabled={busy || !displayName.trim()}
            onClick={() => void apply()}
            className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-60"
          >
            {busy ? "Submitting…" : data.reapply ? "Submit application again" : "Submit application"}
          </button>
        </div>
      )}

      {data.reviews.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl">Reader reviews</h2>
          <ul className="mt-4 space-y-4">
            {data.reviews.map((r) => (
              <li key={r.id} className="border-t border-line pt-4">
                <p className="text-xs text-muted">{r.readerName}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{r.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
