import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";

/**
 * Clean up raw extracted text from PDFs/DOCX into a well-formatted JD.
 * - Collapses excessive blank lines
 * - Detects section headings and ensures spacing
 * - Normalizes bullet points
 * - Removes trailing whitespace per line
 */
function formatExtractedText(raw: string): string {
  // Normalize line endings
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Remove null/control characters
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  // Split into lines and trim each
  let lines = text.split("\n").map((l) => l.trimEnd());

  // Collapse runs of 3+ blank lines into 2
  const collapsed: string[] = [];
  let blankCount = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      blankCount++;
      if (blankCount <= 2) collapsed.push("");
    } else {
      blankCount = 0;
      collapsed.push(line);
    }
  }
  lines = collapsed;

  // Common section heading patterns (case-insensitive)
  const sectionPatterns = /^(about|overview|description|responsibilities|requirements|qualifications|skills|experience|education|benefits|compensation|salary|what we|who we|the role|the position|your role|key |must have|nice to have|preferred|minimum|duties|summary|location|company|team|why join|perks|how to apply)/i;

  const formatted: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Normalize bullet characters to •
    const bulletNormalized = trimmed
      .replace(/^[-–—]\s+/, "• ")
      .replace(/^[●○■□▪▸►◆]\s*/, "• ")
      .replace(/^\*\s+/, "• ");

    // Detect section headings: all caps, or matches known patterns, or ends with ":"
    const isHeading =
      (trimmed.length > 3 && trimmed.length < 80 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) ||
      sectionPatterns.test(trimmed) ||
      (trimmed.endsWith(":") && trimmed.length < 60 && !trimmed.startsWith("•"));

    if (isHeading && i > 0 && formatted.length > 0 && formatted[formatted.length - 1].trim() !== "") {
      // Add blank line before headings for spacing
      formatted.push("");
    }

    formatted.push(bulletNormalized !== trimmed ? bulletNormalized : line);
  }

  // Remove leading/trailing blank lines
  let result = formatted.join("\n").trim();

  // Final cleanup: collapse any remaining 3+ newlines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}

export async function POST(request: Request) {
  try {
    await getOrgContext(); // Auth check

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    try {
      if (fileName.endsWith(".pdf")) {
        const pdfParse = require("pdf-parse/lib/pdf-parse.js");
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;
      } else if (fileName.endsWith(".docx")) {
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else {
        text = buffer.toString("utf-8");
      }
    } catch (err: any) {
      return NextResponse.json({
        text: "",
        error: err.message || "Failed to extract text",
      });
    }

    // Clean up and format the extracted text
    const formatted = formatExtractedText(text);
    return NextResponse.json({ text: formatted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
