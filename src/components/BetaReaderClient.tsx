"use client";

import { useState } from "react";

type Chapter = {
  id: string;
  title: string;
  content_html: string;
};

export function BetaReaderClient({
  token,
  projectId,
  chapters,
}: {
  token: string;
  projectId: string;
  chapters: Chapter[];
}) {
  const [active, setActive] = useState(chapters[0]?.id || "");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");

  const chapter = chapters.find((c) => c.id === active);

  async function submit() {
    const res = await fetch("/api/beta/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, projectId, chapterId: active, body }),
    });
    if (res.ok) {
      setBody("");
      setMsg("Comment sent. Thank you.");
    } else {
      setMsg("Failed to send.");
    }
  }

  return (
    <div className="mt-8">
      <div className="font-ui flex flex-wrap gap-2">
        {chapters.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c.id)}
            className={`px-3 py-1 text-sm ${c.id === active ? "bg-accent text-paper" : "border border-line"}`}
          >
            {c.title}
          </button>
        ))}
      </div>
      <article
        className="prose mt-8 max-w-none"
        dangerouslySetInnerHTML={{ __html: chapter?.content_html || "<p>Empty</p>" }}
      />
      <div className="font-ui mt-10 border-t border-line pt-6">
        <h2 className="font-display text-xl">Leave feedback</h2>
        <textarea
          className="mt-2 w-full border border-line p-3"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What worked? What confused you?"
        />
        <button type="button" onClick={submit} className="mt-2 bg-accent px-4 py-2 text-paper">
          Send comment
        </button>
        {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
      </div>
    </div>
  );
}
