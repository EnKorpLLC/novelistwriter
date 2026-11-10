import type { HeadingFormat } from "@/lib/book/format";

/** Open-licensed (SIL OFL) fonts bundled in public/fonts, with their license files. */
export const FONTS = {
  ebgaramond: { family: "EB Garamond", regular: "/fonts/ebgaramond/EBGaramond.ttf", italic: "/fonts/ebgaramond/EBGaramond-Italic.ttf" },
  crimsonpro: { family: "Crimson Pro", regular: "/fonts/crimsonpro/CrimsonPro.ttf", italic: "/fonts/crimsonpro/CrimsonPro-Italic.ttf" },
  librebaskerville: {
    family: "Libre Baskerville",
    regular: "/fonts/librebaskerville/LibreBaskerville.ttf",
    italic: "/fonts/librebaskerville/LibreBaskerville-Italic.ttf",
  },
  lora: { family: "Lora", regular: "/fonts/lora/Lora.ttf", italic: "/fonts/lora/Lora-Italic.ttf" },
  cormorantgaramond: { family: "Cormorant Garamond", regular: "/fonts/cormorantgaramond/CormorantGaramond.ttf", italic: null },
  cinzel: { family: "Cinzel", regular: "/fonts/cinzel/Cinzel.ttf", italic: null },
  playfairdisplay: {
    family: "Playfair Display",
    regular: "/fonts/playfairdisplay/PlayfairDisplay.ttf",
    italic: "/fonts/playfairdisplay/PlayfairDisplay-Italic.ttf",
  },
  josefinsans: { family: "Josefin Sans", regular: "/fonts/josefinsans/JosefinSans.ttf", italic: null },
} as const;

export type FontId = keyof typeof FONTS;

export type BookStyle = {
  id: string;
  name: string;
  feel: string;
  body: FontId;
  heading: FontId;
  headingFormat: HeadingFormat;
  firstLine: "dropcap" | "smallcaps" | "none";
  ornament: string;
  headingUpper: boolean;
  headingAlign: "center" | "left";
  titleItalic: boolean;
  labelSpacing: number;
  rule: boolean;
};

export const BOOK_STYLES: BookStyle[] = [
  {
    id: "classic",
    name: "Classic",
    feel: "Timeless and elegant. Suits historical, literary, and general fiction.",
    body: "ebgaramond",
    heading: "cormorantgaramond",
    headingFormat: "chapter_word",
    firstLine: "dropcap",
    ornament: "⁂",
    headingUpper: false,
    headingAlign: "center",
    titleItalic: true,
    labelSpacing: 0.12,
    rule: false,
  },
  {
    id: "literary",
    name: "Literary",
    feel: "Quiet and spacious, with a large chapter number. Suits literary and upmarket fiction.",
    body: "crimsonpro",
    heading: "crimsonpro",
    headingFormat: "number",
    firstLine: "smallcaps",
    ornament: "§",
    headingUpper: false,
    headingAlign: "center",
    titleItalic: true,
    labelSpacing: 0,
    rule: false,
  },
  {
    id: "romance",
    name: "Romance",
    feel: "Warm and graceful, with flowing italic titles.",
    body: "lora",
    heading: "playfairdisplay",
    headingFormat: "chapter_word",
    firstLine: "dropcap",
    ornament: "• • •",
    headingUpper: false,
    headingAlign: "center",
    titleItalic: true,
    labelSpacing: 0.08,
    rule: false,
  },
  {
    id: "thriller",
    name: "Thriller",
    feel: "Lean and tense, with bold spaced capitals. Suits thrillers, crime, and suspense.",
    body: "librebaskerville",
    heading: "josefinsans",
    headingFormat: "chapter_number",
    firstLine: "none",
    ornament: "◆",
    headingUpper: true,
    headingAlign: "left",
    titleItalic: false,
    labelSpacing: 0.3,
    rule: true,
  },
  {
    id: "fantasy",
    name: "Fantasy",
    feel: "Carved-stone capitals and a decorated opening. Suits fantasy and epic adventure.",
    body: "ebgaramond",
    heading: "cinzel",
    headingFormat: "chapter_word",
    firstLine: "dropcap",
    ornament: "• ◆ •",
    headingUpper: true,
    headingAlign: "center",
    titleItalic: false,
    labelSpacing: 0.18,
    rule: false,
  },
  {
    id: "cozy",
    name: "Cozy",
    feel: "Friendly and soft. Suits cozy mysteries, women's fiction, and feel-good stories.",
    body: "lora",
    heading: "lora",
    headingFormat: "chapter_word",
    firstLine: "smallcaps",
    ornament: "~ ~ ~",
    headingUpper: false,
    headingAlign: "center",
    titleItalic: true,
    labelSpacing: 0.04,
    rule: false,
  },
  {
    id: "modern",
    name: "Modern",
    feel: "Clean, minimal, and contemporary. Suits contemporary fiction and sci-fi.",
    body: "crimsonpro",
    heading: "josefinsans",
    headingFormat: "number",
    firstLine: "none",
    ornament: "• • •",
    headingUpper: true,
    headingAlign: "left",
    titleItalic: false,
    labelSpacing: 0.2,
    rule: false,
  },
  {
    id: "ya",
    name: "Young Adult",
    feel: "Bold and inviting, with big headings. Suits YA and middle grade.",
    body: "librebaskerville",
    heading: "playfairdisplay",
    headingFormat: "chapter_number",
    firstLine: "dropcap",
    ornament: "* * *",
    headingUpper: false,
    headingAlign: "center",
    titleItalic: false,
    labelSpacing: 0.1,
    rule: true,
  },
];

export function getStyle(id: string | null | undefined): BookStyle {
  return BOOK_STYLES.find((s) => s.id === id) || BOOK_STYLES[0];
}

function fontFace(name: string, url: string, italic: boolean) {
  return `@font-face { font-family: "${name}"; src: url("${url}"); font-weight: 300 800; font-style: ${italic ? "italic" : "normal"}; }`;
}

/**
 * The book's stylesheet. "epub" embeds only the heading font (readers use their own body font, and
 * embedded body fonts add delivery fees on Kindle); "preview" loads both so authors see the full design.
 */
export function bookCss(style: BookStyle, target: "epub" | "preview", fontUrl: (path: string) => string = (p) => p): string {
  const body = FONTS[style.body];
  const heading = FONTS[style.heading];
  const faces: string[] = [fontFace("NW Heading", fontUrl(heading.regular), false)];
  if (heading.italic) faces.push(fontFace("NW Heading", fontUrl(heading.italic), true));
  if (target === "preview") {
    faces.push(fontFace("NW Body", fontUrl(body.regular), false));
    if (body.italic) faces.push(fontFace("NW Body", fontUrl(body.italic), true));
  }
  const bodyStack = target === "preview" ? `"NW Body", Georgia, serif` : `serif`;
  const headingStack = `"NW Heading", Georgia, serif`;
  const upper = style.headingUpper ? "text-transform: uppercase;" : "";

  return `${faces.join("\n")}
body { font-family: ${bodyStack}; line-height: 1.5; margin: 0; padding: 0 0.4em; }
p { margin: 0; text-indent: 1.3em; text-align: justify; }
p.first, p.noindent, p.center, p.right, p.scene-break { text-indent: 0; }
p.center { text-align: center; }
p.right { text-align: right; }
p.scene-break { text-align: center; margin: 1.1em 0; letter-spacing: 0.2em; }
figure.illustration { margin: 1.2em 0; padding: 0; text-align: center; page-break-inside: avoid; break-inside: avoid; }
figure.illustration img { max-width: 100%; max-height: 95vh; height: auto; }
div.scene-break-image { text-align: center; margin: 1.1em 0; page-break-inside: avoid; break-inside: avoid; }
div.scene-break-image img { max-width: 30%; max-height: 3em; height: auto; }
.dropcap { float: left; font-family: ${headingStack}; font-size: 3.4em; line-height: 0.85; margin: 0.06em 0.08em 0 0; }
.lead { font-variant: small-caps; letter-spacing: 0.04em; }
blockquote { margin: 0.8em 1.6em; }
blockquote p { text-indent: 0; margin-bottom: 0.5em; }
ul, ol { margin: 0.6em 0 0.6em 1.6em; padding: 0; }
li { margin: 0.2em 0; }
h2, h3, h4 { font-family: ${headingStack}; font-weight: 600; margin: 1.2em 0 0.5em; text-align: ${style.headingAlign}; }
pre { white-space: pre-wrap; font-family: monospace; font-size: 0.85em; }
.chapter-head { text-align: ${style.headingAlign}; margin: 2.5em 0 2.2em; page-break-inside: avoid; }
.chapter-label { font-family: ${headingStack}; text-indent: 0; text-align: ${style.headingAlign}; letter-spacing: ${style.labelSpacing}em; ${upper} font-size: ${style.headingFormat === "number" ? "2.6em" : "0.95em"}; margin: 0 0 0.5em; }
.chapter-title { font-family: ${headingStack}; font-weight: ${style.headingUpper ? 600 : 500}; font-size: 1.6em; line-height: 1.25; margin: 0; ${style.titleItalic ? "font-style: italic;" : ""} ${upper} letter-spacing: ${style.headingUpper ? style.labelSpacing / 2 : 0}em; }
${style.rule ? `.chapter-head::after { content: ""; display: block; width: 3em; border-bottom: 1px solid currentColor; margin: 1em ${style.headingAlign === "center" ? "auto" : "0"} 0; opacity: 0.6; }` : ""}
.part-page { text-align: center; margin-top: 30%; }
.part-page .chapter-title { font-size: 2em; }
.matter-title { font-family: ${headingStack}; text-align: center; font-weight: 500; font-size: 1.4em; margin: 2em 0 1.4em; ${upper} }
.matter p { text-indent: 0; margin-bottom: 0.7em; text-align: left; }
.title-page { text-align: center; margin-top: 25%; }
.title-page .book-title { font-family: ${headingStack}; font-size: 2.2em; line-height: 1.2; margin: 0 0 0.4em; ${upper} text-indent: 0; text-align: center; }
.title-page .book-subtitle { font-style: italic; font-size: 1.1em; margin: 0 0 2.5em; text-indent: 0; text-align: center; }
.title-page .book-author { font-family: ${headingStack}; font-size: 1.2em; letter-spacing: 0.08em; text-indent: 0; text-align: center; }
.title-page .book-imprint { margin-top: 4em; font-size: 0.8em; text-indent: 0; text-align: center; }
.copyright p { font-size: 0.8em; text-indent: 0; text-align: left; margin-bottom: 0.8em; }
.toc ol { list-style: none; margin: 0; padding: 0; }
.toc li { margin: 0.45em 0; }
.toc a { text-decoration: none; color: inherit; }
.dedication, .epigraph { text-align: center; font-style: italic; margin-top: 30%; }
.dedication p, .epigraph p { text-indent: 0; text-align: center; }
`;
}
