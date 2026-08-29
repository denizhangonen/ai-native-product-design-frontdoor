import { ImageResponse } from "next/og";

export const alt = "Frontdoor, a front door for spending in Slack and email";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#0B1220",
          color: "#F8FAFC",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <svg width="96" height="96" viewBox="0 0 32 32">
          <g fill="none" stroke="#34D399" strokeWidth="2.6" strokeLinecap="round">
            <circle cx="11.5" cy="11.5" r="3.4" />
            <circle cx="20.5" cy="20.5" r="3.4" />
            <path d="M22.5 9.5 L9.5 22.5" />
          </g>
        </svg>

        <div style={{ fontSize: 88, fontWeight: 700, marginTop: 32 }}>Frontdoor</div>

        <div style={{ fontSize: 36, color: "#94A3B8", marginTop: 16, lineHeight: 1.35 }}>
          A front door for spending. Small asks answered on the spot, big ones briefed to procurement.
        </div>

        <div style={{ fontSize: 30, color: "#34D399", marginTop: 40 }}>
          The model extracts. Code decides.
        </div>
      </div>
    ),
    size,
  );
}
