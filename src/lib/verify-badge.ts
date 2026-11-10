const THEMES = {
  light: { left: "#1a1612", leftText: "#f7f2e9", right: "#2c5f4a", rightText: "#ffffff", off: "#6b6358" },
  dark: { left: "#f7f2e9", leftText: "#1a1612", right: "#3f8a6b", rightText: "#ffffff", off: "#8a8276" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Close enough for 11px system sans-serif; badges are short
const width = (s: string) => Math.ceil(s.length * 6.4) + 16;

/** A two-part pill: "Novelist Writer | ✓ label", or grey when there's nothing to verify. */
export function badgeSvg(opts: { right: string; on: boolean; dark?: boolean; title: string; left?: string }) {
  const t = opts.dark ? THEMES.dark : THEMES.light;
  const left = opts.left || "Novelist Writer";
  const lw = width(left);
  const rw = width(opts.right);
  const fill = opts.on ? t.right : t.off;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="22" role="img" aria-label="${esc(`${left}: ${opts.right}`)}">
<title>${esc(opts.title)}</title>
<rect width="${lw}" height="22" rx="3" fill="${t.left}"/>
<rect x="${lw}" width="${rw}" height="22" rx="3" fill="${fill}"/>
<rect x="${lw}" width="4" height="22" fill="${fill}"/>
<g font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" font-size="11">
<text x="8" y="15" fill="${t.leftText}">${esc(left)}</text>
<text x="${lw + 8}" y="15" fill="${t.rightText}">${esc(opts.right)}</text>
</g>
</svg>`;
}
