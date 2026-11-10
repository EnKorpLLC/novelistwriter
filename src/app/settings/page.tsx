"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SPAM_TIP } from "@/components/EmailOptInPrompt";
import { BlockedAuthors } from "@/components/BlockedAuthors";

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState("");
  const [wordGoal, setWordGoal] = useState(500);
  const [challenge, setChallenge] = useState(50);
  const [message, setMessage] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [aiDisabled, setAiDisabled] = useState(false);
  const [aiDisabledSince, setAiDisabledSince] = useState<string | null>(null);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [readerDigest, setReaderDigest] = useState(false);
  const [digestGenres, setDigestGenres] = useState("");
  const [featureOnSocials, setFeatureOnSocials] = useState(false);
  const [trustMessage, setTrustMessage] = useState("");
  const [trustBusy, setTrustBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/profile/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return;
        setAiDisabled(Boolean(s.aiDisabled));
        setAiDisabledSince(s.aiDisabledSince || null);
        setEmailNotifications(Boolean(s.emailNotifications));
        setReaderDigest(Boolean(s.readerDigest));
        setDigestGenres(s.readerDigestGenres || "");
        setFeatureOnSocials(Boolean(s.featureOnSocials));
      });
  }, []);

  async function updateTrust(patch: { aiDisabled?: boolean; emailNotifications?: boolean; readerDigest?: boolean; readerDigestGenres?: string; featureOnSocials?: boolean }) {
    setTrustBusy(true);
    setTrustMessage("");
    try {
      const res = await fetch("/api/profile/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setAiDisabled(Boolean(data.aiDisabled));
      setAiDisabledSince(data.aiDisabledSince || null);
      setEmailNotifications(Boolean(data.emailNotifications));
      setReaderDigest(Boolean(data.readerDigest));
      setFeatureOnSocials(Boolean(data.featureOnSocials));
      if (patch.emailNotifications === true || patch.readerDigest === true) setTrustMessage(SPAM_TIP);
      else if (patch.aiDisabled === true) setTrustMessage("AI tools are off. Your books can now show the AI-off badge.");
      else setTrustMessage("Saved.");
    } catch (err) {
      setTrustMessage(err instanceof Error ? err.message : "Could not save");
    } finally {
      setTrustBusy(false);
    }
  }

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) {
        setDisplayName(data.display_name || "");
        setWordGoal(data.word_goal_daily || 500);
        setChallenge(data.challenge_level || 50);
      }
    })();
  }, []);

  async function save() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        word_goal_daily: wordGoal,
        challenge_level: challenge,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setMessage(error ? error.message : "Saved.");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setPasswordMessage("Use at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords don't match.");
      return;
    }
    setPasswordBusy(true);
    const { error } = await createClient().auth.updateUser({ password: newPassword });
    setPasswordBusy(false);
    if (error) {
      setPasswordMessage(error.message);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("Password changed.");
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <Link href="/dashboard" className="font-ui text-sm text-accent">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-6 text-3xl">Settings</h1>
      <div className="font-ui mt-8 space-y-4">
        <label className="block text-sm">
          Display name
          <input
            className="mt-1 w-full border border-line px-3 py-2"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Daily word goal
          <input
            type="number"
            className="mt-1 w-full border border-line px-3 py-2"
            value={wordGoal}
            onChange={(e) => setWordGoal(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          Default challenge level: {challenge}
          <input
            type="range"
            min={0}
            max={100}
            className="mt-1 w-full"
            value={challenge}
            onChange={(e) => setChallenge(Number(e.target.value))}
          />
        </label>
        <button type="button" onClick={save} className="bg-accent px-4 py-2 text-paper">
          Save
        </button>
        {message && <p className="text-sm text-muted">{message}</p>}
      </div>
      <section className="font-ui mt-12 space-y-5">
        <h2 className="font-display text-2xl">AI and email</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={aiDisabled}
            disabled={trustBusy}
            onChange={(e) => void updateTrust({ aiDisabled: e.target.checked })}
          />
          <span>
            <span className="text-ink">Turn off all AI tools</span>
            <span className="mt-0.5 block text-xs text-muted">
              Hides AI critique and AI bible extract everywhere and blocks them on our servers. Your
              author page and books show &ldquo;AI tools off
              {aiDisabled && aiDisabledSince
                ? ` since ${new Date(aiDisabledSince).toLocaleDateString()}`
                : ""}
              &rdquo;. Turning AI back on resets that date.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={emailNotifications}
            disabled={trustBusy}
            onChange={(e) => void updateTrust({ emailNotifications: e.target.checked })}
          />
          <span>
            <span className="text-ink">Email me notifications</span>
            <span className="mt-0.5 block text-xs text-muted">
              Reading reminders, Studio time running low, and new books from authors you follow.
              Password resets and ARC access emails always send.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={readerDigest}
            disabled={trustBusy}
            onChange={(e) => void updateTrust({ readerDigest: e.target.checked })}
          />
          <span>
            <span className="text-ink">Weekly reader digest</span>
            <span className="mt-0.5 block text-xs text-muted">
              Every Thursday: new books from authors you follow, launches, new releases, free advance copies, and book
              promotions. Every book is written by its author, not AI.
            </span>
          </span>
        </label>
        {readerDigest && (
          <label className="ml-7 block text-xs text-muted">
            Genres to focus on (optional, separated by commas)
            <span className="mt-1 flex gap-2">
              <input
                value={digestGenres}
                onChange={(e) => setDigestGenres(e.target.value)}
                placeholder="Fantasy, cozy mystery, romance"
                className="w-full border border-line px-3 py-1.5 text-sm text-ink"
              />
              <button type="button" disabled={trustBusy} className="border border-line px-3 text-sm text-ink" onClick={() => void updateTrust({ readerDigestGenres: digestGenres })}>
                Save
              </button>
            </span>
          </label>
        )}
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={featureOnSocials}
            disabled={trustBusy}
            onChange={(e) => void updateTrust({ featureOnSocials: e.target.checked })}
          />
          <span>
            <span className="text-ink">Feature my books on Novelist Writer&apos;s social accounts</span>
            <span className="mt-0.5 block text-xs text-muted">
              New releases, launches, advance copies, and beta reads may be shared from our accounts, using your cover, title,
              tagline, and author page link. Needs a public author page. Every post is reviewed by a person first.
            </span>
          </span>
        </label>
        {trustMessage && <p className="text-sm text-muted">{trustMessage}</p>}
      </section>
      <BlockedAuthors />
      <form onSubmit={(e) => void changePassword(e)} className="font-ui mt-12 space-y-4">
        <h2 className="font-display text-2xl">Change password</h2>
        <label className="block text-sm">
          New password
          <input
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full border border-line px-3 py-2"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full border border-line px-3 py-2"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={passwordBusy}
          className="bg-accent px-4 py-2 text-paper disabled:opacity-60"
        >
          {passwordBusy ? "Saving…" : "Change password"}
        </button>
        {passwordMessage && <p className="text-sm text-muted">{passwordMessage}</p>}
      </form>
      <p className="mt-10 text-sm text-muted">
        BYOK keys are managed in the project Tools tab. Privacy: we never train on your book.{" "}
        <Link href="/privacy" className="text-accent underline">
          Privacy
        </Link>
      </p>
    </div>
  );
}
