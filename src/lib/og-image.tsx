import "server-only";
import { ImageResponse } from "next/og";

/** Social image renderer only handles PNG and JPEG, so other formats fall back to a text card. */
export async function imageAsDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (type !== "image/png" && type !== "image/jpeg") return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export function renderShareImage(opts: {
  width: number;
  height: number;
  title: string;
  subtitle: string;
  kicker: string;
  badge?: string | null;
  image: string | null;
  round?: boolean;
}) {
  const { width, height } = opts;
  const square = width === height;
  const imgH = square ? Math.round(height * 0.5) : Math.round(height * 0.78);
  const imgW = opts.round ? imgH : Math.round(imgH * (2 / 3));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: square ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: square ? 36 : 56,
          padding: 56,
          background: "#f7f2e9",
          color: "#1a1612",
          fontFamily: "Georgia, serif",
        }}
      >
        {opts.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={opts.image}
            width={imgW}
            height={imgH}
            style={{
              objectFit: "cover",
              border: "1px solid #d4cbb8",
              borderRadius: opts.round ? imgH : 0,
            }}
            alt=""
          />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: square ? "center" : "flex-start",
            textAlign: square ? "center" : "left",
            maxWidth: square ? width - 112 : width - imgW - 168,
          }}
        >
          <div style={{ fontSize: 26, color: "#2c5f4a", letterSpacing: 2, textTransform: "uppercase" }}>
            {opts.kicker}
          </div>
          <div style={{ fontSize: square ? 64 : 68, lineHeight: 1.08, marginTop: 14 }}>{opts.title}</div>
          <div style={{ fontSize: 34, color: "#6b6358", marginTop: 16 }}>{opts.subtitle}</div>
          {opts.badge ? (
            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 24,
                color: "#2c5f4a",
                border: "2px solid #2c5f4a",
                padding: "6px 14px",
              }}
            >
              {opts.badge}
            </div>
          ) : null}
          <div style={{ fontSize: 24, color: "#6b6358", marginTop: 28 }}>novelistwriter.com</div>
        </div>
      </div>
    ),
    { width, height }
  );
}
