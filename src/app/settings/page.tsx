"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState("");
  const [wordGoal, setWordGoal] = useState(500);
  const [challenge, setChallenge] = useState(50);
  const [message, setMessage] = useState("");

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
      <p className="mt-10 text-sm text-muted">
        BYOK keys are managed in the project Tools tab. Privacy: we never train on your book.{" "}
        <Link href="/privacy" className="text-accent underline">
          Privacy
        </Link>
      </p>
    </div>
  );
}
