import type { ContentKind } from "@/lib/content";

/**
 * First drafts for the guide library and the Human authorship standard, written from what Novelist Writer
 * actually does and the numbers its own tools use. They load into admin as drafts to edit and publish.
 */
export type StarterDraft = {
  kind: ContentKind;
  slug: string;
  title: string;
  summary: string;
  body: string;
  faq: { q: string; a: string }[];
  related_path: string;
  related_label: string;
};

export const STARTER_DRAFTS: StarterDraft[] = [
  {
    kind: "page",
    slug: "human-authorship-standard",
    title: "The human authorship standard",
    summary:
      "Novelist Writer shows who wrote a book by recording how its text arrived in the editor: typed or pasted, across how many sessions, over how many weeks. It records process numbers only, never the words themselves, and the author decides whether readers can see them.",
    related_path: "/authors",
    related_label: "Start writing with a record",
    body: `## Why a writing record

Readers are asking a fair question: did a person write this book? Today they check by hand. They look at an author's history, count how fast books come out, and some stop reading anything published after 2022.

Detectors that guess from the finished text get it wrong, in both directions. So we don't guess. We keep a record while the book is being written, the way a lab notebook records an experiment as it happens.

## What the record keeps

For each writing session in the editor, Novelist Writer saves:

- when the session started and ended;
- how many characters were typed;
- how many characters were pasted in;
- whether anything about the session looked wrong (flagged sessions don't count toward any badge).

It never stores what was typed in the record, and it never sends a manuscript anywhere to be judged.

Words that were already written when the book came in are kept apart:

- **Imported words** came in from a Word file or another app.
- **Before records** words existed before Novelist Writer kept records.

Neither counts as written here, and neither counts against the author. They're simply labeled for what they are.

## The badges

**Written in Novelist Writer.** A book earns this once all of these are true:

- at least **80%** of its recorded words were typed rather than pasted;
- it was written over at least **10** writing sessions;
- those sessions are spread over at least **14** days;
- at least **500** words were written in the editor.

A book written in one sitting, or pasted in, doesn't qualify. A book written the way people write books does.

**Before records.** The book was written before we kept records, and the author says so openly.

**No AI used on this book.** No AI tool in Novelist Writer has ever been run on the book. Our AI only critiques; it never writes. Authors can also switch every AI tool off for their whole account, and their pages say since when.

## What readers see

Nothing, unless the author chooses to share it. When they do, readers can see a summary like "written over 7 months, 140 sessions, 94% typed here" and a chart of words written per week. Readers never see the manuscript through the record.

## What the record can't prove

No record is perfect. Someone could type out text they didn't write. The record makes that slow, visible, and pointless: it shows months of real sessions, the way a book is actually written. It's evidence, not a verdict.

We don't publicly flag books as AI. False accusations hurt real authors. Readers who have a concern can report it to us privately, and we look at the writing record before anything else.

## How to cite this standard

"Novelist Writer human authorship standard: a book earns the Written in Novelist Writer badge when at least 80% of its recorded words were typed (not pasted) in the editor, across at least 10 sessions over at least 14 days." Link to this page.`,
    faq: [
      { q: "How can I prove I didn't use AI to write my book?", a: "Write it in an editor that records how the text arrived. Novelist Writer keeps a writing record of typed and pasted characters across sessions and weeks, never the text itself. A book earns the Written in Novelist Writer badge at 80% typed, 10+ sessions, over 14+ days." },
      { q: "Does Novelist Writer read my manuscript to decide?", a: "No. The record counts characters and sessions. It never judges your words, and AI critique only runs when you ask for it." },
      { q: "What if I wrote my book before using Novelist Writer?", a: "Import it. Imported and earlier words are labeled Before records, openly, and never count against you. Everything you write afterward is recorded." },
    ],
  },
  {
    kind: "guide",
    slug: "format-paperback-for-kdp",
    title: "How to format a paperback for KDP",
    summary:
      "Pick a trim size, set margins that grow with your page count (KDP's inside margin starts at 0.375 inches and rises to 0.875 inches for the longest books), embed your fonts in a print-ready PDF, and upload it with a cover built for that exact page count. Most novels need no bleed.",
    related_path: "/tools/spine-calculator",
    related_label: "Spine and cover size calculator",
    body: `## The short version

1. Choose a trim size (most novels: 5" x 8", 5.5" x 8.5", or 6" x 9").
2. Set margins, especially the inside (gutter) margin, from your page count.
3. Lay out the interior: title page, copyright, chapters starting on new pages, page numbers, running heads.
4. Export a PDF with fonts embedded.
5. Build the cover for the final page count, then upload both.

## Margins that follow KDP's rules

The inside margin is the one people get wrong, because it depends on how thick the book is. KDP's minimum inside margin, without bleed:

- 24 to 150 pages: **0.375"**
- 151 to 300 pages: **0.5"**
- 301 to 500 pages: **0.625"**
- 501 to 700 pages: **0.75"**
- 701 to 828 pages: **0.875"**

These are minimums. A little more keeps words out of the fold. Novelist Writer adds about 0.15" to KDP's number and recalculates every time your page count changes.

KDP paperbacks run from **24** pages up to **828** on white paper or **776** on cream.

## Bleed

Bleed means printing to the very edge of the page. A text-only novel interior doesn't need it: choose "No bleed" when you upload. You only need bleed for images that run off the page.

## Fonts and headings

Use a book serif at 10.5 to 12 points, with comfortable line spacing. Start chapters on a new page; many traditionally printed novels start them on a right-hand page. Running heads usually carry the author name on left pages and the title on right pages, and are left off chapter-opening pages.

## Before you upload

Check that:

- the trim size in your PDF matches the size you pick on KDP;
- every font is embedded;
- page numbers are right, and front matter is handled the way you want;
- the cover was made for this exact page count, because the spine width depends on it.

## Doing it in Novelist Writer

Pro builds the print-ready PDF from your manuscript: 5 trim sizes, running heads and page numbers, margins that follow KDP's page-count rules, and a checklist before you upload. The cover builder then makes the full wrap for the same page count.`,
    faq: [
      { q: "What margins does KDP require?", a: "KDP's minimum inside margin depends on page count: 0.375\" up to 150 pages, 0.5\" to 300, 0.625\" to 500, 0.75\" to 700, and 0.875\" to 828. Outside margins should be at least 0.25\" without bleed." },
      { q: "Does a novel need bleed?", a: "No, not if the interior is text only. Choose \"No bleed\" when you upload. Bleed is only for images that print to the edge." },
      { q: "How many pages can a KDP paperback have?", a: "From 24 pages up to 828 on white paper or 776 on cream paper." },
    ],
  },
  {
    kind: "guide",
    slug: "trim-size-for-novels",
    title: "Which trim size should my novel be?",
    summary:
      "Most novels print at 5\" x 8\", 5.25\" x 8\", 5.5\" x 8.5\", or 6\" x 9\". Smaller sizes feel like a classic paperback but add pages; 6\" x 9\" keeps long books thinner and cheaper to print.",
    related_path: "/tools/trim-sizes",
    related_label: "Trim size guide",
    body: `## The common choices

- **5" x 8"**: the feel of a mass-market or classic paperback. Good for shorter novels, romance, and cozy mysteries.
- **5.25" x 8"** and **5.06" x 7.81"**: close to many traditionally published trade paperbacks.
- **5.5" x 8.5"**: a comfortable middle ground for most fiction.
- **6" x 9"**: common for long fantasy and science fiction, and for nonfiction. More words fit on each page.

## What trim size changes

**Page count.** The same 90,000-word novel takes noticeably more pages at 5" x 8" than at 6" x 9". More pages means a thicker spine and a higher print cost.

**Price.** Print costs rise with page count, so a smaller trim can push your list price up. Check the printing cost before you commit.

**Feel.** Readers notice when a book doesn't look like others in its genre. Look at a few bestsellers in your genre and match them.

## How to choose

1. Look at the books your readers already buy, and note the size.
2. Estimate your page count at two sizes.
3. Check the print cost for both, then pick the one that looks right for the genre at a price that works.

You can change your mind later, but every change means a new cover, because the spine width changes with page count.

## In Novelist Writer

Switch trim sizes in the print studio and see the new page count straight away. The cover builder and spine calculator follow the page count you choose.`,
    faq: [
      { q: "What is the most common trim size for novels?", a: "Most novels use 5\" x 8\", 5.25\" x 8\", or 5.5\" x 8.5\". Long fantasy and science fiction often use 6\" x 9\" to keep page counts down." },
      { q: "Does trim size change my cover?", a: "Yes. A different trim size changes the page count, which changes the spine width and the full cover size." },
    ],
  },
  {
    kind: "guide",
    slug: "kdp-spine-width-and-cover-size",
    title: "How to calculate KDP spine width and cover size",
    summary:
      "Spine width is your page count times the paper thickness: 0.002252\" per page on white paper or 0.0025\" on cream. The full cover is bleed + back cover + spine + front cover + bleed wide, and bleed + trim height + bleed tall, with 0.125\" of bleed on each edge.",
    related_path: "/tools/spine-calculator",
    related_label: "Spine and cover size calculator",
    body: `## Spine width

Multiply your final page count by the thickness of one page:

- **White paper:** pages x 0.002252"
- **Cream paper:** pages x 0.0025"

A 300-page novel on cream paper has a spine of 300 x 0.0025 = **0.75"**.

KDP only allows text on the spine for books with more than **79** pages. Keep spine text at least 0.0625" from each fold.

## Full paperback cover size

The cover is one flat image: back cover, spine, and front cover side by side, plus bleed all around.

- **Width** = 0.125" bleed + trim width + spine + trim width + 0.125" bleed
- **Height** = 0.125" bleed + trim height + 0.125" bleed

Example: a 6" x 9" book with a 0.75" spine is 0.125 + 6 + 0.75 + 6 + 0.125 = **13"** wide and 9.25" tall.

Keep important text and art at least 0.125" inside the trim line, and leave a 2" x 1.2" space on the back for the barcode.

## Ebook covers

Ebook covers are separate from the paperback. KDP's ideal is **1600 x 2560** pixels (a 1:1.6 ratio), and the minimum is 625 x 1000. Use JPEG or TIFF, RGB color.

## IngramSpark

IngramSpark uses its own paper thicknesses, so its spine numbers differ slightly. Always build the cover with the printer you're uploading to.

## The easy way

Our free calculator does all of this for KDP or IngramSpark, and downloads a template showing the bleed, spine, and safe areas. In Novelist Writer, the cover builder lays out the whole wrap for your book's actual page count.`,
    faq: [
      { q: "How do I calculate spine width for KDP?", a: "Multiply your page count by 0.002252\" for white paper or 0.0025\" for cream paper. A 300-page book on cream paper has a 0.75\" spine." },
      { q: "What size should my KDP paperback cover be?", a: "Width: 0.125\" bleed + trim width + spine + trim width + 0.125\" bleed. Height: trim height plus 0.125\" bleed at the top and bottom." },
      { q: "What size is a Kindle ebook cover?", a: "KDP recommends 1600 x 2560 pixels, a 1:1.6 ratio. The minimum is 625 x 1000 pixels." },
    ],
  },
  {
    kind: "guide",
    slug: "how-to-run-beta-readers",
    title: "How to find and run beta readers",
    summary:
      "Ask for specific feedback, tell readers up front how rough the draft is and how long it will take, give them an end date, and make it easy to comment on the exact sentence. Then thank them, and show them their notes were read.",
    related_path: "/readers",
    related_label: "How beta reading works here",
    body: `## Before you open a beta read

Decide three things and tell readers before they apply:

1. **What feedback you want.** Big picture, characters, pacing, or typos. "Any feedback" gets you nothing useful.
2. **How rough the draft is.** First draft, revised, or final polish.
3. **How long it will take.** The word count and an end date.

Readers burn out when expectations are unclear, so this alone makes them more likely to finish.

## Where to find readers

- Your own newsletter and social followers.
- Genre communities that allow beta reading calls (check each one's rules first).
- Reader catalogs, like the Novelist Writer reader catalog, where readers browse open beta reads by genre.

Pick readers who read your genre. A thriller reader's notes on your romance won't help much.

## While they read

- Let readers comment on the exact sentence, not in a separate document.
- Ask a question at the end of each chapter: "Where did you lose interest?" or "What made you want to keep reading?"
- Watch who's progressing. A friendly nudge halfway through saves a silent drop-off later.
- Accept a DNF gracefully, and ask why. "I stopped at chapter 6 because..." is valuable.

## After

- Thank every reader, including the ones who didn't finish.
- Tell them what changed because of their notes.
- Read every comment, even the hard ones, before you decide what to change.

## In Novelist Writer

Studio's beta reader desk handles applications, end dates with a 3-day grace period for final reviews, chapter progress, DNF reasons, and comments pinned to the sentence. You see each chapter's comments right beside the text as you revise.`,
    faq: [
      { q: "How many beta readers do I need?", a: "Many authors aim for 5 to 10 who read the genre, so patterns stand out from one person's taste." },
      { q: "How long should a beta read take?", a: "Give readers a clear end date. Two to four weeks for a novel is common, with a few extra days for final thoughts." },
      { q: "Should I pay beta readers?", a: "Most beta reading is unpaid. Thank readers generously, credit them if they want, and respect their time with a clear brief and deadline." },
    ],
  },
  {
    kind: "guide",
    slug: "arc-timeline",
    title: "When to send ARCs: an advance reader copy timeline",
    summary:
      "Open advance copies about 60 days before release, with a read-by date about two weeks before launch, so reviews are ready to post on launch day. Check in at 30 days, remind readers a week out, and ask for reviews on release day.",
    related_path: "/authors",
    related_label: "The launch plan in Novelist Writer",
    body: `## The timeline

- **90 days out: cover reveal.** Make your book page live so readers can follow it.
- **60 days out: open advance copies.** Set a read-by date about two weeks before release.
- **45 days out: preorders and release alerts.** Readers who join your list hear the moment it's out.
- **30 days out: ARC check-in.** See who's reading and who's stalled, and nudge kindly.
- **14 and 7 days out: countdown.** Share a favorite line or the opening, and remind ARC readers their review link opens on launch day.
- **Launch day.** Ask every ARC reader to post their review today.
- **A week after.** Ask finished readers for an honest review.

## Why two weeks before launch

Reviews on day one make a new book look trusted, and some stores only let readers review after release. A read-by date two weeks early gives readers time to finish, and you time to remind the stragglers.

## How many ARC readers

More than you need. Not everyone finishes, and not everyone who finishes posts a review. Plan for that, and keep the reading time realistic.

## Rules to keep

- Ask for an *honest* review, never a positive one.
- Don't pay for reviews or swap reviews with other authors.
- Readers who got a free copy should say so in their review where the store asks for it.

## In Novelist Writer

Studio builds this timeline from your release date, with a one-click step for each part. On launch day, one button emails readers who asked to hear, tells your followers, and asks every ARC reader to post their review. ARC readers can download a copy marked with their name for Kindle or any e-reader.`,
    faq: [
      { q: "When should I send ARCs?", a: "About 60 days before release, with a read-by date about two weeks before launch day, so reviews are ready when the book comes out." },
      { q: "Can I ask ARC readers for good reviews?", a: "No. Ask for honest reviews only. Stores don't allow paid or traded reviews." },
    ],
  },
  {
    kind: "guide",
    slug: "book-launch-checklist",
    title: "Book launch checklist for self-published authors",
    summary:
      "Three months out, reveal the cover and make the book's page live. Two months out, open advance copies. Six weeks out, open preorders. On launch day, switch the page to Out now, email your list, and ask advance readers to post their reviews.",
    related_path: "/authors",
    related_label: "Launch with Novelist Writer",
    body: `## Three months before

- [ ] Final cover, ebook and paperback.
- [ ] A book page with the cover, blurb, and a way to follow along or join your list.
- [ ] Cover reveal post.

## Two months before

- [ ] Open advance reader copies, with a read-by date two weeks before release.
- [ ] Ebook and paperback files ready to upload.

## Six weeks before

- [ ] Preorder links on your book page.
- [ ] Release alerts: readers who join hear the day it's out.

## The last month

- [ ] Check in with ARC readers at 30 days.
- [ ] Countdown posts at 14 and 7 days: a favorite line, a character, the opening.
- [ ] Line up a newsletter swap or a group promo in your genre.

## Launch day

- [ ] Switch your page to Out now and add every buy link.
- [ ] Email your list and post everywhere you're active.
- [ ] Ask every ARC reader to post their review today.

## The weeks after

- [ ] Ask finished readers for an honest review a week in.
- [ ] Add the new book to "Also by" in your other books.
- [ ] Plan a price promotion for a month or two out, and tell readers what's next.

## In Novelist Writer

Studio turns this into a launch plan with dates, one-click steps, countdown images, and a readiness score, then a launch week dashboard showing visitors, buy clicks by store, new signups, and reviews as they arrive.`,
    faq: [
      { q: "How far ahead should I plan a book launch?", a: "About three months: cover reveal at 90 days, advance copies at 60, preorders at 45, and a countdown in the last two weeks." },
      { q: "What should I do on launch day?", a: "Switch your book page to Out now with buy links, email your list, post where you're active, and ask ARC readers to post their reviews." },
    ],
  },
];
