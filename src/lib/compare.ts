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
] as const;

export type Comparison = {
  slug: string;
  name: string;
  what: string;
  price: string;
  marks: Record<(typeof FEATURES)[number], [Mark, string?]>;
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
      ["Sell your ebook direct to readers", ["yes", "Pro and Studio"], ["no", "Not listed on their site"]],
      ["Record and export your audiobook", ["yes", "Studio, mastered to ACX's specs"], ["no", "Not listed on their site"]],
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
];
