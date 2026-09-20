import { ImageResponse } from "next/og";

// Imagen que se muestra cuando alguien comparte el link en Slack,
// WhatsApp, LinkedIn o X.
//
// Antes apuntábamos a /icon.svg (512x512). Dos problemas: casi ningún
// scraper social renderiza SVG, y el ratio correcto es 1200x630. El
// resultado era un preview sin imagen.
//
// La generamos por código en vez de versionar un PNG para que el día
// que cambie el copy o el color de marca no haya que reexportar nada
// a mano desde Figma.

export const alt = "Recruiting ATS — the applicant tracking system for recruiting agencies";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Los colores son los de la marca en la landing: indigo-600 → violet-600
// → purple-600. Hardcodeados como hex porque satori no resuelve las
// clases de Tailwind.
const INDIGO = "#4f46e5";
const VIOLET = "#7c3aed";
const PURPLE = "#9333ea";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#ffffff",
          padding: "80px",
        }}
      >
        {/* Barra de marca arriba */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              backgroundImage: `linear-gradient(135deg, ${INDIGO}, ${PURPLE})`,
            }}
          />
          <div
            style={{
              marginLeft: "20px",
              fontSize: "30px",
              fontWeight: 700,
              color: "#111827",
            }}
          >
            Recruiting ATS
          </div>
        </div>

        {/* Titular */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: "76px",
              fontWeight: 800,
              color: "#111827",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            Your candidates deserve
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "76px",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: VIOLET,
            }}
          >
            a better pipeline
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "28px",
              fontSize: "34px",
              color: "#4b5563",
            }}
          >
            The applicant tracking system built for recruiting agencies.
          </div>
        </div>

        {/* Franja de marca abajo */}
        <div
          style={{
            display: "flex",
            height: "12px",
            width: "100%",
            borderRadius: "6px",
            backgroundImage: `linear-gradient(90deg, ${INDIGO}, ${VIOLET}, ${PURPLE})`,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
