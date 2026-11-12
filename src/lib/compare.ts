/** Comparison and "Switching from" page content. Fair and dated; check prices before quoting them elsewhere. */

export const COMPARED_ON = "November 2026";

export type Mark = "yes" | "no" | "partial";

export const FEATURES = [
  "Write and organize your draft",
  "Ebook formatting",
  "Print-ready paperback PDF",
  "Cover tools",
  "Beta reader management",
  "Advance reader copies (ARCs)",
  "Author website and launch pages",
  "Proof a human wrote the book",
  "Works on Windows, Mac, and Chromebook",
  "Sell direct to readers",
  "Human-narrated audiobooks",
  "Hire human editors, designers, and narrators",
] as const;

/** Rows added after most comparisons were written; a comparison that doesn't mention one shows this. */
export const NEWER_FEATURES = ["Sell direct to readers", "Human-narrated audiobooks", "Hire human editors, designers, and narrators"] as const;
const NOT_LISTED: [Mark, string?] = ["no", "Not listed on their site"];
type CoreFeature = Exclude<(typeof FEATURES)[number], (typeof NEWER_FEATURES)[number]>;

/** A comparison's mark for a feature, with the newer rows defaulting to "Not listed on their site". */
export const markFor = (marks: Comparison["marks"], f: (typeof FEATURES)[number]): [Mark, string?] => marks[f] ?? NOT_LISTED;

export type Comparison = {
  slug: string;
  name: string;
  what: string;
  price: string;
  marks: Record<CoreFeature, [Mark, string?]> & Partial<Record<(typeof NEWER_FEATURES)[number], [Mark, string?]>>;
  chooseThem: string[];
  chooseUs: string[];
  switchSlug?: string;
  /** Rows only this comparison needs: [feature, Novelist Writer, them] */
  extraRows?: [string, [Mark, string?], [Mark, string?]][];
};

const US: Comparison["marks"] = {
  "Write and organize your draft": ["yes", "Chapters, scene notes, story bible, focus mode"],
  "Ebook formatting": ["yes", "8 book styles, per-store ebooks on Studio"],
  "Print-ready paperback PDF": ["yes", "Pro"],
  "Cover tools": ["yes", "Cover builder, wrap calculator, marketing images (Pro)"],
  "Beta reader management": ["yes", "Studio"],
  "Advance reader copies (ARCs)": ["yes", "Studio"],
  "Author website and launch pages": ["yes", "Pro"],
  "Proof a human wrote the book": ["yes", "Writing record and badges"],
  "Works on Windows, Mac, and Chromebook": ["yes", "In the browser"],
  "Sell direct to readers": ["yes", "Ebooks, audiobooks, printed paperbacks, pre-orders, extras, and signed copies from your shop (Pro)"],
  "Human-narrated audiobooks": ["yes", "Record it yourself or hire a narrator, mastered to ACX's specs (Studio)"],
  "Hire human editors, designers, and narrators": ["yes", "Agreements and held payments on every plan; the directory opens as founding pros join"],
};

export const NOVELIST_WRITER = { name: "Novelist Writer", price: "Free; Pro $19/month; Studio $49/month", marks: US };

export const COMPARISONS: Comparison[] = [
  {
    slug: "scrivener",
    name: "Scrivener",
    what: "A long-standing desktop writing app with a powerful binder and corkboard for organizing big projects.",
    price: "About $60 once per computer platform (desktop app)",
    marks: {
      "Write and organize your draft": ["yes", "Its biggest strength"],
      "Ebook formatting": ["partial", "Compile can make EPUB and Kindle files, with setup"],
      "Print-ready paperback PDF": ["partial", "Through Compile, with setup"],
      "Cover tools": ["no"],
      "Beta reader management": ["no"],
      "Advance reader copies (ARCs)": ["no"],
      "Author website and launch pages": ["no"],
      "Proof a human wrote the book": ["no"],
      "Works on Windows, Mac, and Chromebook": ["partial", "Windows and Mac apps, plus iOS; no Chromebook"],
    },
    chooseThem: ["You want an offline desktop app with deep organizing tools", "You only need drafting, and you'll format, publish, and market elsewhere"],
    chooseUs: [
      "You want writing, formatting, beta readers, ARCs, and launch in one place",
      "You want readers to see proof you wrote your book",
      "You switch between computers, including a Chromebook",
    ],
    switchSlug: "scrivener",
  },
  {
    slug: "vellum",
    name: "Vellum",
    what: "Beautiful book formatting for ebooks and paperbacks. It doesn't help you write; you bring a finished Word file.",
    price: "About $200 once for ebooks, or $250 once with paperbacks (Mac only)",
    marks: {
      "Write and organize your draft": ["no", "Formatting only"],
      "Ebook formatting": ["yes", "Many polished styles"],
      "Print-ready paperback PDF": ["yes", "With the paperback edition"],
      "Cover tools": ["no"],
      "Beta reader management": ["no"],
      "Advance reader copies (ARCs)": ["no"],
      "Author website and launch pages": ["no"],
      "Proof a human wrote the book": ["no"],
      "Works on Windows, Mac, and Chromebook": ["no", "Mac only"],
    },
    chooseThem: ["You're on a Mac, your book is finished, and you want the widest choice of book styles"],
    chooseUs: ["You're on Windows or a Chromebook", "You'd rather pay monthly than $200 to $250 up front", "You also want covers, beta readers, ARCs, and a launch plan"],
    switchSlug: "vellum",
  },
  {
    slug: "atticus",
    name: "Atticus",
    what: "A writing and formatting app that runs in the browser and on any computer, bought once.",
    price: "About $147 once",
    marks: {
      "Write and organize your draft": ["yes"],
      "Ebook formatting": ["yes"],
      "Print-ready paperback PDF": ["yes"],
      "Cover tools": ["no"],
      "Beta reader management": ["no"],
      "Advance reader copies (ARCs)": ["no"],
      "Author website and launch pages": ["no"],
      "Proof a human wrote the book": ["no"],
      "Works on Windows, Mac, and Chromebook": ["yes"],
    },
    chooseThem: ["You only need writing and formatting, and you prefer paying once"],
    chooseUs: ["You want beta readers, ARCs, covers, an author site, and launch tools with your formatting", "You want readers to see proof you wrote your book"],
    switchSlug: "atticus",
  },
  {
    slug: "betabooks",
    name: "BetaBooks",
    what: "A service for sharing your manuscript with beta readers and collecting their feedback.",
    price: "Paid plans from about $15 to $35 a month",
    marks: {
      "Write and organize your draft": ["no"],
      "Ebook formatting": ["no"],
      "Print-ready paperback PDF": ["no"],
      "Cover tools": ["no"],
      "Beta reader management": ["yes", "Its focus"],
      "Advance reader copies (ARCs)": ["no"],
      "Author website and launch pages": ["no"],
      "Proof a human wrote the book": ["no"],
      "Works on Windows, Mac, and Chromebook": ["yes", "In the browser"],
    },
    chooseThem: ["You already write elsewhere and only need beta reading"],
    chooseUs: [
      "Reader comments sit beside your chapter while you revise, in the same place you write",
      "Reader badges and insights help you pick readers and see where they stop",
      "ARCs, launch pages, and your audience list come with it",
    ],
  },
  {
    slug: "netgalley",
    name: "NetGalley",
    what: "A large, established marketplace where reviewers, librarians, and booksellers request advance copies.",
    price: "Hundreds of dollars per title (about $450 to $575+), or less through author co-ops",
    marks: {
      "Write and organize your draft": ["no"],
      "Ebook formatting": ["no"],
      "Print-ready paperback PDF": ["no"],
      "Cover tools": ["no"],
      "Beta reader management": ["no"],
      "Advance reader copies (ARCs)": ["yes", "A much larger reviewer audience than ours today"],
      "Author website and launch pages": ["no"],
      "Proof a human wrote the book": ["no"],
      "Works on Windows, Mac, and Chromebook": ["yes", "In the browser"],
    },
    chooseThem: ["You need the biggest possible reach to professional reviewers and librarians, and have the budget"],
    chooseUs: [
      "You want ARCs as part of a monthly plan instead of paying per title",
      "You want read-by deadlines, reminders, one-tap review links, and launch-day review pushes",
      "You're building your own reader list, not renting someone else's",
    ],
  },
  {
    slug: "writersforge",
    name: "WritersForge",
    what: "An AI story-development service: four AI tools (StoryBeats, StoryPlotter, StoryWriter, StoryEdit) share a Story Bible, and StoryWriter drafts scenes in your own voice. It also sells AI copy and line edits.",
    price: "Starter, Pro, and Max plans, monthly or yearly; copy and line edits $9 per 25,000 words",
    marks: {
      "Write and organize your draft": ["yes", "Story Bible, beat and scene plotting, manuscript import"],
      "Ebook formatting": ["no", "Not listed on their site"],
      "Print-ready paperback PDF": ["no", "Not listed on their site"],
      "Cover tools": ["no", "Not listed on their site"],
      "Beta reader management": ["no", "Not listed on their site"],
      "Advance reader copies (ARCs)": ["no", "Not listed on their site"],
      "Author website and launch pages": ["no", "Not listed on their site"],
      "Proof a human wrote the book": ["no", "Its StoryWriter drafts scenes for you"],
      "Works on Windows, Mac, and Chromebook": ["yes", "In the browser"],
    },
    extraRows: [
      ["AI drafts your prose", ["no", "By design: you write every word"], ["yes", "StoryWriter drafts scenes in your voice"]],
      ["AI feedback on your draft", ["yes", "Chapter critiques, on request"], ["yes", "StoryEdit, plus paid copy and line edits"]],
    ],
    chooseThem: [
      "You want AI to map your structure and draft scenes for you to revise",
      "You want an AI copy and line edit returned as tracked changes in your Word file",
    ],
    chooseUs: [
      "You write every word yourself and want readers to see the proof: a writing record and a verification badge on your book",
      "You'd rather no reader ever wonders whether an AI drafted your book",
      "You want formatting, covers, beta readers, ARCs, launch pages, direct sales, and an audiobook studio in one place, not just story development",
    ],
  },
  {
    slug: "mira-golds-writing-forge",
    name: "Mira Gold's Writing Forge",
    what: "An AI-native platform for long-form fiction. It builds premises, outlines, and world bibles, generates full chapters (its demo makes a 110,000-word novel in 45 minutes), and turns books into AI multi-voice audiobooks, covers, and Amazon listings.",
    price: "Plans from $14.99/month after a 14-day trial; AI model usage billed separately",
    marks: {
      "Write and organize your draft": ["yes", "World bible, outlines, continuity checks"],
      "Ebook formatting": ["no", "Not listed on their site"],
      "Print-ready paperback PDF": ["no", "Not listed on their site"],
      "Cover tools": ["yes", "AI-generated covers"],
      "Beta reader management": ["no", "Not listed on their site"],
      "Advance reader copies (ARCs)": ["no", "Not listed on their site"],
      "Author website and launch pages": ["no", "Not listed on their site"],
      "Proof a human wrote the book": ["no", "It generates chapters for you"],
      "Works on Windows, Mac, and Chromebook": ["yes", "In the browser"],
      "Human-narrated audiobooks": ["no", "AI multi-voice narration with your own voice-service keys"],
    },
    extraRows: [
      ["AI drafts your prose", ["no", "By design: you write every word"], ["yes", "Generates chapters and whole novels"]],
    ],
    chooseThem: ["You want AI to generate chapters or a whole draft from your outline", "You want an AI-voiced audiobook made from your manuscript"],
    chooseUs: [
      "You write the book yourself and want readers to see the proof",
      "You want a human-narrated audiobook, which ACX requires, recorded by you or a narrator you hire",
      "You want formatting, beta readers, ARCs, and launch tools alongside your draft",
    ],
  },
  {
    slug: "writeforge",
    name: "WriteForge",
    what: "A Windows desktop writing app with an Android companion: outlining, story bible, editor, formatting, a cover studio, and KDP and Draft2Digital packages, with optional AI help (managed credits or your own keys) and AI audiobook narration on higher plans.",
    price: "$79 once (Standalone, with your own AI keys), or $12, $29, or $59 a month",
    marks: {
      "Write and organize your draft": ["yes", "Outline, story bible, focused editor, research notes"],
      "Ebook formatting": ["yes", "EPUB, PDF, and DOCX export"],
      "Print-ready paperback PDF": ["yes", "PDF export and KDP packages"],
      "Cover tools": ["yes", "Cover design studio"],
      "Beta reader management": ["no", "Not listed on their site"],
      "Advance reader copies (ARCs)": ["no", "Not listed on their site"],
      "Author website and launch pages": ["no", "A browser library for sharing, not launch pages"],
      "Proof a human wrote the book": ["no", "Not listed on their site"],
      "Works on Windows, Mac, and Chromebook": ["partial", "Windows app and Android companion; Mac not yet"],
      "Human-narrated audiobooks": ["no", "AI narration, 2 to 10 hours a month on Pro and Ultimate"],
    },
    extraRows: [
      ["AI drafts your prose", ["no", "By design: you write every word"], ["partial", "Optional: AI assists, and can draft if you choose"]],
    ],
    chooseThem: ["You want a desktop app that keeps manuscripts on your computer and works offline", "You'd like to pay once ($79) and use your own AI keys"],
    chooseUs: [
      "You're on a Mac or Chromebook, or switch between computers",
      "You want beta readers, ARCs, an author site, launch pages, and direct sales",
      "You want readers to see proof you wrote the book",
    ],
  },
  {
    slug: "writerforge-os",
    name: "WriterForge OS",
    what: "A cloud suite for novels, screenplays, audio dramas, and music in one workspace, with AI from its own Orvyth model, real-time collaboration, and exports to PDF, ePub, Fountain, and HTML.",
    price: "Not published; their site says pricing is confirmed after a company verification step",
    marks: {
      "Write and organize your draft": ["yes", "Novel studio with chapters and character tracking"],
      "Ebook formatting": ["partial", "ePub export"],
      "Print-ready paperback PDF": ["partial", "PDF export; print layout not listed"],
      "Cover tools": ["no", "Not listed on their site"],
      "Beta reader management": ["no", "Not listed on their site"],
      "Advance reader copies (ARCs)": ["no", "Not listed on their site"],
      "Author website and launch pages": ["no", "Not listed on their site"],
      "Proof a human wrote the book": ["no", "Not listed on their site"],
      "Works on Windows, Mac, and Chromebook": ["yes", "In the browser"],
    },
    extraRows: [
      ["AI drafts your prose", ["no", "By design: you write every word"], ["yes", "AI continues stories and writes dialogue"]],
      ["Screenplays, audio dramas, and lyrics", ["no", "Novels and books"], ["yes", "Separate studios for each"]],
    ],
    chooseThem: ["You write screenplays, audio dramas, or lyrics as well as novels", "You work with a team editing together in real time"],
    chooseUs: [
      "You want published prices and a free plan you can start today",
      "You want formatting, covers, beta readers, ARCs, and launch tools for your book",
      "You want readers to see proof you wrote the book",
    ],
  },
  {
    slug: "writingforgepro",
    name: "WritingForgePro",
    what: "An offline-first desktop writing workstation for Windows and Mac. Projects are stored on your computer, and AI is optional through your own keys (OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, or local models).",
    price: "Free tier with DOCX and text export; Pro about $159 a year (offered free to beta and early Mac users)",
    marks: {
      "Write and organize your draft": ["yes", "Blueprints, manuscript, research, revision tools"],
      "Ebook formatting": ["partial", "EPUB export on paid tiers"],
      "Print-ready paperback PDF": ["partial", "PDF export on paid tiers"],
      "Cover tools": ["no", "Not listed on their site"],
      "Beta reader management": ["no", "Not listed on their site"],
      "Advance reader copies (ARCs)": ["no", "Not listed on their site"],
      "Author website and launch pages": ["no", "Not listed on their site"],
      "Proof a human wrote the book": ["no", "Not listed on their site"],
      "Works on Windows, Mac, and Chromebook": ["partial", "Windows and Mac apps; no Chromebook"],
    },
    extraRows: [
      ["AI drafts your prose", ["no", "By design: you write every word"], ["partial", "Optional, with your own keys; generation pipelines included"]],
      ["Works offline", ["no", "Needs an internet connection"], ["yes", "Offline-first; files stay on your computer"]],
    ],
    chooseThem: ["You want a private, offline desktop app with your files on your own computer", "You want optional AI on your own keys, or none at all"],
    chooseUs: [
      "You want to write on any computer, including a Chromebook, with nothing to install",
      "You want beta readers, ARCs, covers, an author site, and launch tools",
      "You want readers to see proof you wrote the book",
    ],
  },
  {
    slug: "the-writers-forge",
    name: "The Writers Forge",
    what: "An iPhone and iPad app for speaking your book. It transcribes your audio or video, and an AI assistant shapes your words into chapters, aiming for a first draft in 30 days.",
    price: "Free to download; a paid subscription unlocks the full app (the App Store lists a $49.99 purchase)",
    marks: {
      "Write and organize your draft": ["partial", "Arrange transcribed text into chapters"],
      "Ebook formatting": ["no", "Exports TXT, DOCX, and PDF"],
      "Print-ready paperback PDF": ["no", "Not listed"],
      "Cover tools": ["no", "Not listed"],
      "Beta reader management": ["no", "Not listed"],
      "Advance reader copies (ARCs)": ["no", "Not listed"],
      "Author website and launch pages": ["no", "Not listed"],
      "Proof a human wrote the book": ["no", "Not listed"],
      "Works on Windows, Mac, and Chromebook": ["no", "iPhone and iPad (and Apple-silicon Macs)"],
    },
    extraRows: [
      ["Write by speaking", ["partial", "Your device's dictation works in the editor"], ["yes", "Transcribes your recordings"]],
      ["AI drafts your prose", ["no", "By design: you write every word"], ["yes", "AI turns your words into chapters"]],
    ],
    chooseThem: ["You'd rather talk your book out than type it, mostly on a phone or iPad"],
    chooseUs: [
      "You type your book, on any computer",
      "You want formatting, covers, beta readers, ARCs, and a launch plan",
      "You want readers to see proof you wrote the book",
    ],
  },
  {
    slug: "reedsy",
    name: "Reedsy Studio",
    what: "A free writing and formatting app in the browser from Reedsy, which also runs a large marketplace of freelance editors, cover designers, and marketers.",
    price: "Free; add-ons Craft $4.99/month and Outlining $7.99/month",
    marks: {
      "Write and organize your draft": ["yes", "Editor, import, boards (full boards with the Outlining add-on)"],
      "Ebook formatting": ["yes", "EPUB 3 with themes"],
      "Print-ready paperback PDF": ["yes", "Print-ready PDF with trim sizes"],
      "Cover tools": ["partial", "No cover tools; hire a designer on the Reedsy Marketplace"],
      "Beta reader management": ["partial", "Read-only public previews"],
      "Advance reader copies (ARCs)": ["no", "Not in Studio"],
      "Author website and launch pages": ["no", "Not in Studio"],
      "Proof a human wrote the book": ["no", "Not listed on their site"],
      "Works on Windows, Mac, and Chromebook": ["yes", "In the browser"],
      "Sell direct to readers": ["no", "Not in Studio"],
      "Hire human editors, designers, and narrators": ["yes", "The Reedsy Marketplace, its biggest strength (10% from each side)"],
    },
    chooseThem: ["You want a free, simple app to write and format your book", "You plan to hire an editor or cover designer and want them all in one marketplace"],
    chooseUs: [
      "You want beta readers with progress and feedback, ARCs, an author site, and launch pages for your book",
      "You want readers to see proof you wrote it",
      "You want to sell your ebook direct, as well as through the stores",
    ],
    switchSlug: "word",
  },
  {
    slug: "sudowrite",
    name: "Sudowrite",
    what: "The best-known AI co-writer for fiction. Its Story Bible feeds Muse, its fiction-trained AI model, which continues scenes in your voice, drafts chapters from your outline, and rewrites or expands passages.",
    price: "$19, $29, or $59 a month ($10, $22, or $44 a month paid yearly)",
    marks: {
      "Write and organize your draft": ["yes", "Story Bible, outline, scenes, series folders"],
      "Ebook formatting": ["no", "Not listed on their site"],
      "Print-ready paperback PDF": ["no", "Not listed on their site"],
      "Cover tools": ["no", "Not listed on their site"],
      "Beta reader management": ["no", "AI \"beta reads\" on higher plans, not real readers"],
      "Advance reader copies (ARCs)": ["no", "Not listed on their site"],
      "Author website and launch pages": ["no", "Not listed on their site"],
      "Proof a human wrote the book": ["no", "Its AI drafts and continues your prose"],
      "Works on Windows, Mac, and Chromebook": ["yes", "In the browser"],
    },
    extraRows: [
      ["AI drafts your prose", ["no", "By design: you write every word"], ["yes", "First Draft, Write, and Draft generate prose"]],
      ["AI feedback on your draft", ["yes", "Chapter critiques, on request"], ["yes", "AI developmental and line edits on Professional and Max"]],
    ],
    chooseThem: ["You want an AI co-writer to continue scenes and draft chapters for you", "You write dark or adult fiction and want an AI that won't refuse it"],
    chooseUs: [
      "You write every word yourself and want readers to see the proof",
      "You want real beta readers, not AI ones",
      "You want formatting, covers, ARCs, launch pages, and direct sales in the same place you write",
    ],
  },
  {
    slug: "novelcrafter",
    name: "Novelcrafter",
    what: "A novel planning and writing app built around the Codex, a story bible that tracks every mention of your characters and places. AI is optional and runs on your own AI provider key.",
    price: "$4, $8, $14, or $20 a month (AI usage billed separately by your provider)",
    marks: {
      "Write and organize your draft": ["yes", "Codex, series, scene beats, mention tracking"],
      "Ebook formatting": ["no", "Book formatting not listed"],
      "Print-ready paperback PDF": ["no", "Not listed on their site"],
      "Cover tools": ["no", "Not listed on their site"],
      "Beta reader management": ["partial", "Invite viewers and editors to a novel"],
      "Advance reader copies (ARCs)": ["no", "Not listed on their site"],
      "Author website and launch pages": ["no", "Not listed on their site"],
      "Proof a human wrote the book": ["no", "Not listed on their site"],
      "Works on Windows, Mac, and Chromebook": ["yes", "In the browser"],
    },
    extraRows: [
      ["AI drafts your prose", ["no", "By design: you write every word"], ["partial", "Optional: writes from your scene beats, on your own key"]],
    ],
    chooseThem: ["You want a deep story bible with mention tracking and character progressions", "You want optional AI on your own key, or a $4 plan with no AI at all"],
    chooseUs: [
      "You want formatting, covers, beta readers, ARCs, and launch tools alongside your draft",
      "You want readers to see proof you wrote the book",
      "You'd like a free plan to write on",
    ],
  },
  {
    slug: "dabble",
    name: "Dabble",
    what: "A writing app for the browser, desktop, and phones, with the Plot Grid for plotting, story notes, and goals. The Author plan and up add track changes, comments, and beta-reader sharing.",
    price: "$19, $29, or $49 a month ($15, $23, or $39 paid yearly); Lifetime Author $699",
    marks: {
      "Write and organize your draft": ["yes", "Plot Grid, story notebook, goals and stats"],
      "Ebook formatting": ["no", "Manuscript export; book formatting not listed"],
      "Print-ready paperback PDF": ["no", "Not listed on their site"],
      "Cover tools": ["no", "Not listed on their site"],
      "Beta reader management": ["yes", "Beta-reader support on Author and up"],
      "Advance reader copies (ARCs)": ["no", "Not listed on their site"],
      "Author website and launch pages": ["no", "Not listed on their site"],
      "Proof a human wrote the book": ["no", "Not listed on their site"],
      "Works on Windows, Mac, and Chromebook": ["yes", "Browser, desktop, and phone apps"],
    },
    extraRows: [
      ["Phone and tablet apps", ["partial", "Works in a phone browser; best on a computer"], ["yes", "Mobile apps"]],
      ["Free plan", ["yes", "Write on Free; unlock more books for $9 each"], ["no", "14-day trial, then paid"]],
    ],
    chooseThem: ["You want polished phone and tablet apps for writing on the go", "You want track changes and an editor workflow inside your writing app"],
    chooseUs: [
      "You want a free plan instead of a trial",
      "You want ebook and paperback formatting, covers, ARCs, an author site, and launch pages",
      "You want readers to see proof you wrote the book",
    ],
  },
  {
    slug: "plottr",
    name: "Plottr",
    what: "A visual outlining tool: drag-and-drop timelines of scene cards and plotlines, 30+ plot templates, and a series bible. It's for planning; you write the book somewhere else.",
    price: "$60 a year or $150 once (desktop); Pro with the web app $9.99 a month, $99 a year, or $599 once",
    marks: {
      "Write and organize your draft": ["partial", "Outlining and series bible; drafting happens elsewhere"],
      "Ebook formatting": ["no", "Exports outlines to Word and Scrivener"],
      "Print-ready paperback PDF": ["no"],
      "Cover tools": ["no"],
      "Beta reader management": ["no"],
      "Advance reader copies (ARCs)": ["no"],
      "Author website and launch pages": ["no"],
      "Proof a human wrote the book": ["no", "No AI, but no writing record"],
      "Works on Windows, Mac, and Chromebook": ["partial", "Windows and Mac; Chromebook through the Pro web app"],
    },
    extraRows: [
      ["Visual timeline outlining", ["partial", "Scene notes and story bible; no timeline board"], ["yes", "Its core strength"]],
      ["Never uses AI to write for you", ["yes"], ["yes", "No AI at all"]],
    ],
    chooseThem: ["You plan in detail and want a visual timeline board", "You want desktop software with no AI at all"],
    chooseUs: [
      "You want to outline and write the book in the same place",
      "You want formatting, beta readers, ARCs, and launch tools once it's written",
      "You want readers to see proof you wrote the book",
    ],
  },
  {
    slug: "google-docs",
    name: "Google Docs",
    what: "Google's free online word processor. Great for drafting and for sharing with comments, but it isn't built for books: no story bible, book styles, or publishing tools.",
    price: "Free with a Google account",
    marks: {
      "Write and organize your draft": ["partial", "Tabs and headings; no story bible or chapter organizer"],
      "Ebook formatting": ["partial", "Basic EPUB download, no book styles"],
      "Print-ready paperback PDF": ["partial", "PDF download; no trim sizes or mirrored margins"],
      "Cover tools": ["no"],
      "Beta reader management": ["partial", "Share for comments; no progress or reader tracking"],
      "Advance reader copies (ARCs)": ["no"],
      "Author website and launch pages": ["no"],
      "Proof a human wrote the book": ["partial", "Version history shows edits, but nothing readers can check"],
      "Works on Windows, Mac, and Chromebook": ["yes", "In the browser"],
    },
    extraRows: [["Several people typing at once", ["no", "One writer per book; readers comment"], ["yes", "Real-time co-editing"]]],
    chooseThem: ["You co-write with someone in real time", "You only need a free place to draft and collect comments"],
    chooseUs: [
      "You want chapters, a story bible, and writing goals built for novels",
      "You want book-quality ebooks and paperbacks without fighting a word processor",
      "You want readers to see proof you wrote the book",
    ],
    switchSlug: "word",
  },
];

export type SwitchGuide = {
  slug: string;
  name: string;
  intro: string;
  steps: string[];
  maps: [string, string][];
  checklist: string[];
};

export const SWITCH_GUIDES: SwitchGuide[] = [
  {
    slug: "scrivener",
    name: "Scrivener",
    intro: "Your binder becomes chapters, your notes can go in the story bible, and your formatting moves to book styles.",
    steps: [
      "In Scrivener, choose File > Compile, pick a manuscript format, and compile as Microsoft Word (.docx). Make sure chapter titles are included.",
      "Create a book in Novelist Writer, open the Tools tab, and import the .docx.",
      "We split chapters at Word heading styles or at lines like \"Chapter One\", \"Chapter 1\", or \"Prologue\", and keep italics and bold.",
      "Check the chapter list, then set up your style, front pages, and book details in the Format tab.",
    ],
    maps: [
      ["Binder folders and documents", "Chapters (one per chapter heading)"],
      ["Front matter folder", "Front and back pages in the Format tab"],
      ["Character and setting sheets", "Story bible entries"],
      ["Compile formats", "Book styles, ebook and paperback builds"],
      ["Snapshots", "Version snapshots in the Tools tab"],
    ],
    checklist: ["Chapter titles came through", "Italics look right", "Scene breaks show as * * *", "Front matter pages are set", "Story bible has your key characters"],
  },
  {
    slug: "word",
    name: "Word or Google Docs",
    intro: "Bring your manuscript over in a couple of minutes. Heading styles help, but plain \"Chapter One\" lines work too.",
    steps: [
      "Google Docs: File > Download > Microsoft Word (.docx). Word: save as .docx.",
      "For the cleanest split, give chapter titles the Heading 1 style, or start each chapter with a line like \"Chapter 1\".",
      "Create a book in Novelist Writer, open the Tools tab, and import the .docx.",
      "Check the chapter list, then pick a book style in the Format tab.",
    ],
    maps: [
      ["Heading 1 chapter titles", "Chapters"],
      ["Italics, bold, lists", "Kept as they are"],
      ["Centered * * * or # lines", "Scene breaks with your style's ornament"],
      ["Title and copyright pages", "Generated from your book details"],
    ],
    checklist: ["Chapter titles came through", "Italics look right", "Scene breaks show as * * *", "Book details filled in for the copyright page"],
  },
  {
    slug: "vellum",
    name: "Vellum",
    intro: "Vellum formats a finished Word file, so start from the manuscript you imported into it.",
    steps: [
      "Find the Word (.docx) manuscript you originally imported into Vellum. Vellum doesn't export back to Word.",
      "Create a book in Novelist Writer, open the Tools tab, and import that .docx.",
      "In the Format tab, pick the book style closest to your Vellum style, and set chapter openings and scene breaks.",
      "Re-create front and back pages (dedication, also by, about the author) in the Format tab. Copyright and contents build themselves.",
    ],
    maps: [
      ["Vellum book styles", "8 book styles with drop caps, small caps, and ornaments"],
      ["Elements (dedication, also by, about the author)", "Front and back pages"],
      ["Store-specific ebooks", "Per-store ebooks on Studio"],
      ["Paperback export", "Print layout and PDF on Pro"],
    ],
    checklist: ["Chapter titles came through", "Book style picked", "Front and back pages re-created", "Ebook preview checked on Kindle and phone sizes"],
  },
  {
    slug: "atticus",
    name: "Atticus",
    intro: "Start from your original Word manuscript, or export your book from Atticus as Word if your version offers it.",
    steps: [
      "Use your original .docx manuscript, or export a Word file from Atticus if your version has that option.",
      "Create a book in Novelist Writer, open the Tools tab, and import the .docx.",
      "Pick a book style in the Format tab and set your chapter openings.",
      "Re-create front and back pages in the Format tab; copyright and contents build themselves.",
    ],
    maps: [
      ["Atticus themes", "Book styles"],
      ["Front and back matter", "Front and back pages"],
      ["Ebook and print export", "Styled ebook, per-store ebooks, and print PDF"],
    ],
    checklist: ["Chapter titles came through", "Book style picked", "Front and back pages re-created", "Ebook and print previews checked"],
  },
];

/** What a full author toolkit costs when bought separately (rough monthly figures, November 2026). */
export const REPLACES: { tool: string; cost: string; plan: "Free" | "Pro" | "Studio" }[] = [
  { tool: "Writing app (Scrivener, Dabble)", cost: "$5–$20/mo or ~$60 once", plan: "Free" },
  { tool: "Formatting (Vellum, Atticus)", cost: "$147–$250 once", plan: "Pro" },
  { tool: "Author website", cost: "$16–$30/mo", plan: "Pro" },
  { tool: "Cover templates and marketing images", cost: "$10–$30/mo", plan: "Pro" },
  { tool: "Beta reader service (BetaBooks)", cost: "$15–$35/mo", plan: "Studio" },
  { tool: "ARC service (Booksprout, BookFunnel)", cost: "$9–$59/mo", plan: "Studio" },
  { tool: "NetGalley listing", cost: "$450–$575+ per book", plan: "Studio" },
  { tool: "Ebook store and delivery (Payhip, BookFunnel)", cost: "$0–$29/mo plus fees", plan: "Pro" },
  { tool: "Shop for signed copies (Shopify)", cost: "$29–$39/mo", plan: "Pro" },
];
