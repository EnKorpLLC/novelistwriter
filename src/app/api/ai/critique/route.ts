import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { debitCredits, refundCredits, getCreditBalance } from "@/lib/credits";
import {
  runCritiqueModel,
  parseAiJson,
  revisionModeInstructions,
  CRITIQUE_SYSTEM_PROMPT,
} from "@/lib/ai/critique";
import {
  computeCritiqueCost,
  defaultScopeForJob,
  isValidModelTier,
  isValidScope,
  type AiModelTier,
  type AiScope,
} from "@/lib/ai/pricing";
import { buildBookManuscript } from "@/lib/ai/manuscript";
import {
  estimateBibleExtractCost,
  planBibleExtract,
  runBibleExtractUnit,
  getBiblePass,
} from "@/lib/ai/bible-extract";
import { estimateArcsCost, planArcsExtract, runArcsUnit } from "@/lib/ai/arcs-multipass";
import type { JobType } from "@/lib/types";
import { z } from "zod";

/** Long multipass bible extracts / book jobs — requires Vercel Pro for full 300s. */
export const maxDuration = 300;

const bodySchema = z.object({
  jobType: z.string(),
  projectId: z.string().uuid(),
  chapterId: z.string().uuid().optional(),
  text: z.string().optional(),
  mode: z.enum(["line", "developmental", "structural", "voice"]).optional(),
  challengeLevel: z.number().min(0).max(100).optional(),
  targetAuthor: z.string().optional(),
  targetBook: z.string().optional(),
  persona: z.string().optional(),
  scope: z.enum(["selection", "chapter", "book"]).optional(),
  model: z.enum(["fast", "standard", "deep"]).optional(),
  /** Bible/arcs chunked runs: plan only (no debit / no AI). */
  planOnly: z.boolean().optional(),
  /** Bible extract: which category pass. */
  passId: z.string().optional(),
  /** Bible/arcs: which chapter batch (0-based). */
  batchIndex: z.number().int().min(0).optional(),
  /** Arcs continuity across batches (client-maintained subject list). */
  priorSubjects: z.string().optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const {
    jobType,
    projectId,
    chapterId,
    text,
    mode,
    challengeLevel,
    targetAuthor,
    targetBook,
    persona,
  } = parsed.data;
  const jt = jobType as JobType;

  const model: AiModelTier =
    parsed.data.model && isValidModelTier(parsed.data.model) ? parsed.data.model : "standard";
  let scope: AiScope =
    parsed.data.scope && isValidScope(parsed.data.scope)
      ? parsed.data.scope
      : defaultScopeForJob(jt);

  if (jt === "bible_extract") scope = "book";
  if (scope === "selection" && !(text && text.trim())) {
    return NextResponse.json(
      { error: "Select text in the editor to run a selection critique." },
      { status: 400 }
    );
  }
  if (scope === "chapter" && !chapterId && jt !== "bible_extract") {
    return NextResponse.json({ error: "No chapter selected." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("challenge_level, critique_preferences, byok_anthropic_key, byok_openai_key")
    .eq("id", user.id)
    .maybeSingle();

  const { data: bal } = await supabase
    .from("credit_balances")
    .select("subscription_tier")
    .eq("user_id", user.id)
    .maybeSingle();

  const isStudio = bal?.subscription_tier === "studio";
  const byokAnthropic = isStudio ? profile?.byok_anthropic_key : null;
  const byokOpenAi = isStudio ? profile?.byok_openai_key : null;
  const usingByok = Boolean(byokAnthropic || byokOpenAi);

  // ——— Story bible extract: plan or one batch×pass per request ———
  if (jt === "bible_extract") {
    const extractModel: AiModelTier =
      parsed.data.model && isValidModelTier(parsed.data.model) ? parsed.data.model : "standard";

    const { data: chapters } = await supabase
      .from("chapters")
      .select("title, content_text, sort_order")
      .eq("project_id", projectId)
      .order("sort_order");

    const chapterRows = (chapters || []).map((c) => ({
      title: c.title,
      content_text: c.content_text || "",
      sort_order: c.sort_order ?? 0,
    }));

    if (!chapterRows.length) {
      return NextResponse.json({ error: "No chapters to scan." }, { status: 400 });
    }

    if (parsed.data.planOnly) {
      const plan = planBibleExtract({
        chapters: chapterRows,
        model: extractModel,
        usingByok,
      });
      return NextResponse.json({
        plan: true,
        ...plan,
        chaptersPerBatch: 5,
        creditsRemaining: await remainingCredits(user.id),
      });
    }

    const passId = parsed.data.passId;
    const batchIndex = parsed.data.batchIndex;
    if (!passId || typeof batchIndex !== "number") {
      return NextResponse.json(
        {
          error:
            "Bible extract runs in separate requests. Send planOnly, or passId + batchIndex for each unit.",
        },
        { status: 400 }
      );
    }
    if (!getBiblePass(passId)) {
      return NextResponse.json({ error: `Unknown passId: ${passId}` }, { status: 400 });
    }

    const unitCost = usingByok
      ? 1
      : estimateBibleExtractCost({
          chapterCount: chapterRows.length,
          model: extractModel,
          usingByok,
        }).perCall;

    const debit = await debitCredits({
      userId: user.id,
      jobType: jt,
      cost: unitCost,
    });
    if (!debit.ok) {
      return NextResponse.json(
        {
          error: debit.error,
          code: "insufficient_credits",
          cost: debit.cost,
        },
        { status: 402 }
      );
    }

    const { data: bible } = await supabase
      .from("bible_entries")
      .select("entry_type, name")
      .eq("project_id", projectId);

    const existingKeys = new Set(
      (bible || []).map((b) => `${b.entry_type}:${String(b.name).toLowerCase().trim()}`)
    );

    const { data: job } = await supabase
      .from("ai_jobs")
      .insert({
        user_id: user.id,
        project_id: projectId,
        chapter_id: null,
        job_type: jt,
        status: "running",
        credit_cost: debit.charged,
        input: {
          scope: "book",
          model: extractModel,
          usingByok,
          passId,
          batchIndex,
          unit: true,
        },
      })
      .select("*")
      .single();

    try {
      const unit = await runBibleExtractUnit({
        chapters: chapterRows,
        passId,
        batchIndex,
        model: extractModel,
        byokAnthropic,
        byokOpenAi,
        existingKeys,
      });

      if (unit.empty) {
        await refundCredits({
          userId: user.id,
          amount: debit.charged,
          jobType: jt,
          reason: "bible_extract_empty_batch",
        });
        if (job) {
          await supabase
            .from("ai_jobs")
            .update({
              status: "complete",
              result: { summary: unit.summary, extras: { empty: true } },
              credit_cost: 0,
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }
        return NextResponse.json({
          jobId: job?.id,
          cost: 0,
          empty: true,
          batchCount: unit.batchCount,
          summary: unit.summary,
          extras: { added: [], calls: 0 },
          creditsRemaining: await remainingCredits(user.id),
        });
      }

      const inserted: unknown[] = [];
      for (const e of unit.entries.slice(0, 80)) {
        const { data: row } = await supabase
          .from("bible_entries")
          .insert({
            project_id: projectId,
            user_id: user.id,
            entry_type: e.entry_type,
            name: e.name.trim(),
            summary: e.summary || "",
            speech_notes: e.speech_notes || "",
            details: { source: "ai_extract", passId, batchIndex },
          })
          .select("*")
          .single();
        if (row) inserted.push(row);
      }

      const result = {
        summary: unit.summary,
        items: [] as unknown[],
        extras: {
          added: inserted,
          entries: unit.entries,
          passId,
          batchIndex,
          batchCount: unit.batchCount,
          batchLabel: unit.batchLabel,
          passLabel: unit.passLabel,
        },
      };

      if (job) {
        await supabase
          .from("ai_jobs")
          .update({
            status: "complete",
            result,
            credit_cost: debit.charged,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }

      return NextResponse.json({
        jobId: job?.id,
        cost: debit.charged,
        scope: "book",
        model: extractModel,
        usingByok,
        summary: result.summary,
        items: [],
        extras: result.extras,
        batchCount: unit.batchCount,
        creditsRemaining: await remainingCredits(user.id),
      });
    } catch (e) {
      try {
        await refundCredits({
          userId: user.id,
          amount: debit.charged,
          jobType: jt,
          reason: "ai_job_failed_refund",
        });
      } catch (refundErr) {
        console.error("credit refund failed", refundErr);
      }
      if (job) {
        await supabase
          .from("ai_jobs")
          .update({
            status: "failed",
            error: e instanceof Error ? e.message : "AI failed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : "AI failed",
          refunded: debit.charged,
          creditsRemaining: await remainingCredits(user.id),
        },
        { status: 500 }
      );
    }
  }

  // ——— Exact full-chapter arcs: plan or one batch per request ———
  if (jt === "arcs" && scope === "book") {
    const arcsModel: AiModelTier =
      parsed.data.model && isValidModelTier(parsed.data.model) ? parsed.data.model : "standard";

    const { data: chapters } = await supabase
      .from("chapters")
      .select("title, content_text, sort_order")
      .eq("project_id", projectId)
      .order("sort_order");

    const chapterRows = (chapters || []).map((c) => ({
      title: c.title,
      content_text: c.content_text || "",
      sort_order: c.sort_order ?? 0,
    }));

    if (!chapterRows.length) {
      return NextResponse.json({ error: "No chapters to scan." }, { status: 400 });
    }

    if (parsed.data.planOnly) {
      const plan = planArcsExtract({
        chapters: chapterRows,
        model: arcsModel,
        usingByok,
      });
      return NextResponse.json({
        plan: true,
        ...plan,
        chaptersPerBatch: 5,
        creditsRemaining: await remainingCredits(user.id),
      });
    }

    const batchIndex = parsed.data.batchIndex;
    if (typeof batchIndex !== "number") {
      return NextResponse.json(
        {
          error:
            "Whole-book arcs run in separate batch requests. Send planOnly, or batchIndex for each unit.",
        },
        { status: 400 }
      );
    }

    const unitCost = usingByok
      ? 1
      : estimateArcsCost({
          chapterCount: chapterRows.length,
          model: arcsModel,
          usingByok,
        }).perCall;

    const debit = await debitCredits({
      userId: user.id,
      jobType: jt,
      cost: unitCost,
    });
    if (!debit.ok) {
      return NextResponse.json(
        {
          error: debit.error,
          code: "insufficient_credits",
          cost: debit.cost,
        },
        { status: 402 }
      );
    }

    const { data: bible } = await supabase
      .from("bible_entries")
      .select("entry_type, name, summary, speech_notes, details")
      .eq("project_id", projectId);

    const level = challengeLevel ?? profile?.challenge_level ?? 50;
    const prefs = profile?.critique_preferences || {};

    const { data: job } = await supabase
      .from("ai_jobs")
      .insert({
        user_id: user.id,
        project_id: projectId,
        chapter_id: null,
        job_type: jt,
        status: "running",
        credit_cost: debit.charged,
        input: {
          scope: "book",
          model: arcsModel,
          usingByok,
          batchIndex,
          unit: true,
        },
      })
      .select("*")
      .single();

    try {
      const unit = await runArcsUnit({
        chapters: chapterRows,
        batchIndex,
        model: arcsModel,
        byokAnthropic,
        byokOpenAi,
        level,
        prefs,
        bible: bible || [],
        priorSubjects: parsed.data.priorSubjects,
      });

      if (unit.empty) {
        await refundCredits({
          userId: user.id,
          amount: debit.charged,
          jobType: jt,
          reason: "arcs_empty_batch",
        });
        if (job) {
          await supabase
            .from("ai_jobs")
            .update({
              status: "complete",
              result: { summary: unit.summary, extras: { empty: true } },
              credit_cost: 0,
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }
        return NextResponse.json({
          jobId: job?.id,
          cost: 0,
          empty: true,
          batchCount: unit.batchCount,
          summary: unit.summary,
          items: [],
          extras: { arcs: [], empty: true },
          creditsRemaining: await remainingCredits(user.id),
        });
      }

      for (const a of unit.arcs.slice(0, 20)) {
        await supabase.from("arc_tracks").insert({
          project_id: projectId,
          user_id: user.id,
          arc_type:
            a.arc_type === "character" || a.arc_type === "relationship"
              ? a.arc_type
              : "story",
          subject: a.subject,
          beats: a.beats || [],
          notes: a.notes || "",
        });
      }

      if (unit.items.length && job) {
        await supabase.from("critique_items").insert(
          unit.items.slice(0, 40).map((item) => ({
            job_id: job.id,
            project_id: projectId,
            chapter_id: null,
            user_id: user.id,
            severity: item.severity,
            confidence: item.confidence,
            category: item.category,
            title: item.title,
            body: item.body,
            citation_excerpt: item.citation_excerpt || null,
            example_text: item.example_text || null,
          }))
        );
      }

      const result = {
        summary: unit.summary,
        items: unit.items,
        extras: {
          arcs: unit.arcs,
          batchIndex,
          batchCount: unit.batchCount,
          batchLabel: unit.batchLabel,
        },
      };

      if (job) {
        await supabase
          .from("ai_jobs")
          .update({
            status: "complete",
            result,
            credit_cost: debit.charged,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }

      return NextResponse.json({
        jobId: job?.id,
        cost: debit.charged,
        scope: "book",
        model: arcsModel,
        usingByok,
        summary: result.summary,
        items: result.items,
        extras: result.extras,
        batchCount: unit.batchCount,
        creditsRemaining: await remainingCredits(user.id),
      });
    } catch (e) {
      try {
        await refundCredits({
          userId: user.id,
          amount: debit.charged,
          jobType: jt,
          reason: "ai_job_failed_refund",
        });
      } catch (refundErr) {
        console.error("credit refund failed", refundErr);
      }
      if (job) {
        await supabase
          .from("ai_jobs")
          .update({
            status: "failed",
            error: e instanceof Error ? e.message : "AI failed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : "AI failed",
          refunded: debit.charged,
          creditsRemaining: await remainingCredits(user.id),
        },
        { status: 500 }
      );
    }
  }

  const effectiveModel: AiModelTier = model;

  const cost = computeCritiqueCost({
    jobType: jt,
    scope,
    model: effectiveModel,
    usingByok,
  });

  const debit = await debitCredits({ userId: user.id, jobType: jt, cost });
  if (!debit.ok) {
    return NextResponse.json(
      { error: debit.error, code: "insufficient_credits", cost: debit.cost },
      { status: 402 }
    );
  }

  const level = challengeLevel ?? profile?.challenge_level ?? 50;
  const prefs = profile?.critique_preferences || {};

  let manuscript = "";
  if (scope === "selection") {
    manuscript = (text || "").trim();
  } else if (scope === "chapter" && chapterId) {
    const { data: ch } = await supabase
      .from("chapters")
      .select("content_text, title")
      .eq("id", chapterId)
      .single();
    manuscript = ch?.content_text || "";
  } else {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("title, content_text, sort_order")
      .eq("project_id", projectId)
      .order("sort_order");
    manuscript = buildBookManuscript(chapters || [], { jobType: jt });
  }

  if (!manuscript.trim()) {
    await refundCredits({
      userId: user.id,
      amount: debit.charged,
      jobType: jt,
      reason: "ai_job_empty_refund",
    });
    return NextResponse.json(
      { error: "Nothing to critique in that scope.", refunded: debit.charged },
      { status: 400 }
    );
  }

  const { data: bible } = await supabase
    .from("bible_entries")
    .select("entry_type, name, summary, speech_notes, details")
    .eq("project_id", projectId);

  const { data: job } = await supabase
    .from("ai_jobs")
    .insert({
      user_id: user.id,
      project_id: projectId,
      chapter_id: chapterId || null,
      job_type: jt,
      status: "running",
      credit_cost: debit.charged,
      input: {
        mode,
        targetAuthor,
        targetBook,
        persona,
        scope,
        model: effectiveModel,
        usingByok,
      },
    })
    .select("*")
    .single();

  const userPrompt = buildPrompt({
    jobType: jt,
    mode: mode || "developmental",
    level,
    prefs,
    manuscript,
    bible: bible || [],
    targetAuthor,
    targetBook,
    persona,
    scope,
  });

  try {
    const raw = await runCritiqueModel({
      system: CRITIQUE_SYSTEM_PROMPT,
      user: userPrompt,
      byokAnthropic,
      byokOpenAi,
      modelTier: effectiveModel,
    });
    const result = parseAiJson(raw);

    if (job) {
      await supabase
        .from("ai_jobs")
        .update({
          status: "complete",
          result,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (result.items?.length) {
        await supabase.from("critique_items").insert(
          result.items.map((item) => ({
            job_id: job.id,
            project_id: projectId,
            chapter_id: chapterId || null,
            user_id: user.id,
            severity: item.severity,
            confidence: item.confidence,
            category: item.category,
            title: item.title,
            body: item.body,
            citation_excerpt: item.citation_excerpt || null,
            example_text: item.example_text || null,
          }))
        );
      }

      // Persist structured extras for intelligence features
      if (jt === "promises" && Array.isArray(result.extras?.promises)) {
        const promises = result.extras.promises as Array<{ description: string }>;
        await supabase.from("story_promises").insert(
          promises.slice(0, 30).map((p) => ({
            project_id: projectId,
            user_id: user.id,
            description: p.description,
            source: "ai",
          }))
        );
      }
      if (jt === "arcs" && Array.isArray(result.extras?.arcs)) {
        const arcs = result.extras.arcs as Array<{
          arc_type: string;
          subject: string;
          beats: unknown[];
          notes?: string;
        }>;
        for (const a of arcs.slice(0, 20)) {
          await supabase.from("arc_tracks").insert({
            project_id: projectId,
            user_id: user.id,
            arc_type: a.arc_type === "character" || a.arc_type === "relationship" ? a.arc_type : "story",
            subject: a.subject,
            beats: a.beats || [],
            notes: a.notes || "",
          });
        }
      }

    }

    return NextResponse.json({
      jobId: job?.id,
      cost: debit.charged,
      scope,
      model: effectiveModel,
      usingByok,
      summary: result.summary,
      items: result.items,
      extras: result.extras,
      creditsRemaining: await remainingCredits(user.id),
    });
  } catch (e) {
    // Don't keep credits for a failed provider call
    try {
      await refundCredits({
        userId: user.id,
        amount: debit.charged,
        jobType: jt,
        reason: "ai_job_failed_refund",
      });
    } catch (refundErr) {
      console.error("credit refund failed", refundErr);
    }
    if (job) {
      await supabase
        .from("ai_jobs")
        .update({
          status: "failed",
          error: e instanceof Error ? e.message : "AI failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "AI failed",
        refunded: debit.charged,
        creditsRemaining: await remainingCredits(user.id),
      },
      { status: 500 }
    );
  }
}

async function remainingCredits(userId: string) {
  const bal = await getCreditBalance(userId);
  return (bal?.balance ?? 0) + (bal?.monthly_allowance_remaining ?? 0);
}

function buildPrompt(opts: {
  jobType: JobType;
  mode: string;
  level: number;
  prefs: unknown;
  manuscript: string;
  bible: unknown[];
  targetAuthor?: string;
  targetBook?: string;
  persona?: string;
  scope?: AiScope;
}) {
  const scopeLabel =
    opts.scope === "selection"
      ? "selected passage only"
      : opts.scope === "book"
        ? "full manuscript (all chapters)"
        : "single chapter";

  const base = `challenge_level: ${opts.level}
scope: ${scopeLabel}
author_preferences: ${JSON.stringify(opts.prefs)}
revision_lens: ${revisionModeInstructions(opts.mode)}
story_bible: ${JSON.stringify(opts.bible).slice(0, 8000)}

MANUSCRIPT:
"""
${opts.manuscript.slice(0, 90000)}
"""

Return JSON: {
  "summary": string,
  "items": [{ "severity": "must_fix"|"consider"|"style", "confidence": 0-1, "category": string, "title": string, "body": string, "citation_excerpt"?: string, "example_text"?: string }],
  "extras": object
}
Never provide replacement manuscript paragraphs. example_text must be labeled illustrative only.`;

  const jobHints: Partial<Record<JobType, string>> = {
    line_edit: "Task: line-edit / grammar / clarity critique.",
    developmental: "Task: developmental critique.",
    structural: "Task: structural critique.",
    voice_pass: "Task: voice consistency critique.",
    continuity: "Task: continuity and coherence issues across the manuscript.",
    plotholes: "Task: find plotholes and causal breaks. extras.plotholes = string[].",
    lore_lock: "Task: compare manuscript against bible lore/rules; flag contradictions.",
    arcs: "Task: track character and story arcs. extras.arcs = [{arc_type, subject, beats, notes}].",
    promises: "Task: find Chekhov's guns / unpaid foreshadowing. extras.promises = [{description}].",
    dialogue_fingerprint: "Task: per-character dialogue consistency; flag when A sounds like B.",
    pacing: "Task: pacing analysis. extras.heatmap = [{chapter, action, reflection, exposition}] percentages.",
    voice_analysis: "Task: analyze author voice (diction, rhythm, POV habits). extras.voice_profile = object.",
    discover_comps: "Task: discover comparable authors/books with reasons. extras.comps = [{name, type:'author'|'book', why}].",
    targeted_compare: `Task: compare manuscript to target author "${opts.targetAuthor || ""}" and/or book "${opts.targetBook || ""}". extras.comparison = {similarities, gaps, craft_differences}. Do NOT rewrite to sound like them.`,
    reading_list: "Task: recommend books to read based on content, POV, voice. extras.reading_list = [{title, author, why}].",
    sensitivity: "Task: optional sensitivity/authenticity advisory flags only. Never rewrite.",
    blurb_critique: "Task: critique the blurb/marketing copy only — do not write a replacement blurb.",
    beta_summary: "Task: summarize themes in provided beta feedback (in manuscript field).",
    custom_persona: `Task: critique through persona lens: ${opts.persona || "ruthless developmental editor"}. Still never write replacement prose.`,
    bible_extract:
      "Task: extract story-bible entities from the manuscript. extras.entries = [{entry_type:'character'|'place'|'note'|'lore'|'rule'|'timeline', name, summary, speech_notes?}]. Prefer named characters and places; include world rules/lore/timeline beats when evidenced. Do not invent unsupported entities. Do not write manuscript prose. items can briefly note confidence for each find.",
  };

  return `${jobHints[opts.jobType] || "Task: craft critique."}\n\n${base}`;
}
