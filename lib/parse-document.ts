// Shared document parsing logic used by both staffing-firm and client-portal routes

// Section heading patterns for JD formatting
const JD_SECTION_PATTERNS = /^(about|overview|description|responsibilit|requirements|qualifications|skills|experience|education|benefits|compensation|salary|what we|who we|the role|the position|your role|key |must have|nice to have|preferred|minimum|duties|summary|company|team|why join|perks|how to apply|sobre el rol|sobre la|tu impacto|principales|requisitos|valoramos|perfil buscado|autonomía|notas|modalidad|horario|área|reporte|contratación|beneficios)/i;

// Lines that look like metadata key-value pairs (e.g. "Ubicación: Palermo")
const METADATA_LINE = /^(ubicaci[oó]n|location|modalidad|horario|área|area|reporte|reports? to|salary|salario|contrataci[oó]n|tipo de contrato|seniority|experiencia requerida|industry|industria)\s*:/i;

// Bullet line detection
const BULLET_CHARS = /^[-–—●○■□▪▸►◆*•]\s*/;

/**
 * Clean up raw extracted text from PDFs/DOCX into a well-formatted JD.
 *
 * Goals:
 * - Join broken paragraph lines (PDF line wrapping) into flowing paragraphs
 * - Keep bullet points as individual lines
 * - Ensure exactly one blank line between paragraphs and sections
 * - Normalize bullet characters to •
 * - Detect section headings and space them consistently
 */
export function formatExtractedText(raw: string): string {
  // Normalize line endings and remove control characters
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  const rawLines = text.split("\n").map((l) => l.trimEnd());

  // Phase 1: Classify each line
  type LineType = "blank" | "heading" | "bullet" | "metadata" | "text";
  const classified: { text: string; type: LineType }[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      classified.push({ text: "", type: "blank" });
    } else if (METADATA_LINE.test(trimmed)) {
      classified.push({ text: trimmed, type: "metadata" });
    } else if (BULLET_CHARS.test(trimmed)) {
      const normalized = trimmed.replace(BULLET_CHARS, "• ");
      classified.push({ text: normalized, type: "bullet" });
    } else if (isHeading(trimmed)) {
      classified.push({ text: trimmed, type: "heading" });
    } else {
      classified.push({ text: trimmed, type: "text" });
    }
  }

  // Phase 2: Join broken paragraph lines.
  const merged: { text: string; type: LineType }[] = [];

  for (let i = 0; i < classified.length; i++) {
    const cur = classified[i];

    if (
      cur.type === "text" &&
      merged.length > 0 &&
      merged[merged.length - 1].type === "text" &&
      isContinuation(cur.text, merged[merged.length - 1].text)
    ) {
      merged[merged.length - 1].text += " " + cur.text;
    } else {
      merged.push({ ...cur });
    }
  }

  // Also join broken bullet lines (continuation of a bullet)
  const merged2: { text: string; type: LineType }[] = [];
  for (let i = 0; i < merged.length; i++) {
    const cur = merged[i];
    if (
      cur.type === "text" &&
      merged2.length > 0 &&
      merged2[merged2.length - 1].type === "bullet" &&
      isContinuation(cur.text, merged2[merged2.length - 1].text)
    ) {
      merged2[merged2.length - 1].text += " " + cur.text;
    } else {
      merged2.push({ ...cur });
    }
  }

  // Phase 3: Build output with consistent spacing
  const output: string[] = [];
  let prevType: LineType | null = null;

  for (const item of merged2) {
    if (item.type === "blank") {
      if (output.length > 0 && output[output.length - 1] !== "") {
        output.push("");
      }
      prevType = "blank";
      continue;
    }

    if (item.type === "heading") {
      if (output.length > 0 && output[output.length - 1] !== "") {
        output.push("");
      }
      output.push(item.text);
      prevType = "heading";
      continue;
    }

    if (item.type === "bullet") {
      if (prevType && prevType !== "bullet" && prevType !== "blank" && prevType !== "heading") {
        if (output.length > 0 && output[output.length - 1] !== "") {
          output.push("");
        }
      }
      output.push(item.text);
      prevType = "bullet";
      continue;
    }

    if (item.type === "metadata") {
      output.push(item.text);
      prevType = "metadata";
      continue;
    }

    // Regular text
    if (prevType === "bullet") {
      if (output.length > 0 && output[output.length - 1] !== "") {
        output.push("");
      }
    }
    output.push(item.text);
    prevType = "text";
  }

  let result = output.join("\n").trim();
  result = result.replace(/\n{3,}/g, "\n\n");
  return result;
}

/** Detect if a line is a section heading */
function isHeading(line: string): boolean {
  if (JD_SECTION_PATTERNS.test(line)) return true;
  if (line.length > 3 && line.length < 80 && line === line.toUpperCase() && /[A-Z]/.test(line)) return true;
  if (line.endsWith(":") && line.length < 60 && !line.startsWith("•") && !METADATA_LINE.test(line)) return true;
  return false;
}

/** Check if a line is a continuation of the previous (broken by PDF line wrap) */
function isContinuation(current: string, previous: string): boolean {
  if (/^[a-záéíóúñü]/.test(current)) return true;
  if (previous && !/[.!?:;]$/.test(previous) && /^[a-záéíóúñüA-ZÁÉÍÓÚÑ]/.test(current)) {
    if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(current) && current.length > 20) return true;
    if (/^[a-záéíóúñü]/.test(current)) return true;
  }
  return false;
}

/**
 * Parse a document buffer (PDF, DOCX, or TXT) and return formatted text.
 */
export async function parseDocumentBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const name = fileName.toLowerCase();
  let text = "";

  if (name.endsWith(".pdf")) {
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const pdfData = await pdfParse(buffer);
    text = pdfData.text;
  } else if (name.endsWith(".docx")) {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    text = buffer.toString("utf-8");
  }

  return formatExtractedText(text);
}
