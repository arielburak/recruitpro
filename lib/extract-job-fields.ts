// Heuristic extractor for Job-Description parsed text.
// Given the formatted plain text of a JD (and optionally the original
// filename), infer the most likely:
//   - title (job title)
//   - location (city/region)
//   - workMode ("ON_SITE" | "REMOTE" | "HYBRID")
//
// Returns undefined for any field it can't *confidently* guess. The
// old version had a "first reasonable line" fallback that frequently
// caught body sentences like "experience. This is a unique opportunity
// to work directly with a high-performing U.S. financial…" and surfaced
// them as the title. New rule: only fill the title when one of the
// strong signals matches; leave undefined otherwise.

export type ExtractedJobFields = {
  title?: string;
  location?: string;
  workMode?: "ON_SITE" | "REMOTE" | "HYBRID";
};

// Words that indicate "this line is NOT a job title" (section headings we
// see at the top of JDs in both English and Spanish).
const NON_TITLE_HEADINGS =
  /^(about|overview|description|the company|the role|the position|company|sobre|sobre el rol|acerca|descripci[oó]n|resumen|job description|position summary|responsibilities|requirements|qualifications|what you|who we|nuestro|our client)\b/i;

// Common job-title keywords used to promote a candidate line.
const TITLE_KEYWORDS =
  /\b(engineer|developer|designer|manager|lead|director|analyst|scientist|architect|consultant|specialist|associate|intern|officer|strateg|recruit|executive|coordinator|representative|sales|marketing|support|operations|product|partner|head\s+of|chief|cto|cfo|ceo|coo|ingenier|desarrollador[a]?|analista|gerente|director[a]?|jefe|l[ií]der|asociad[oa]|asistente|operario|coordinador[a]?)\b/i;

// Words that should NEVER be the entire job title even if they slipped
// through other filters. These are sentence fragments / abstract nouns
// the heuristic used to mistake for titles.
const NEVER_TITLE_ALONE = /^(experience|opportunity|description|company|client|role|position|team|industry|details|summary)\b/i;

// Generic filename tokens that should be stripped before treating the
// remainder as the title. Covers boilerplate ("JD", "Job Description"),
// software defaults ("untitled", "document"), and version markers
// ("v2", "final", "draft"). Anything left after stripping these is
// substantive enough to be a real title.
const FILENAME_NOISE = /\b(jd|job\s*description|job\s*posting|posting|search|busqueda|b[uú]squeda|copy|final|v\d+|draft|new|untitled|document|microsoft\s*word|word\s*document|sin\s*titulo)\b/gi;

function isLikelyTitleLine(line: string): boolean {
  if (line.length < 3 || line.length > 80) return false;
  if (NON_TITLE_HEADINGS.test(line)) return false;
  if (NEVER_TITLE_ALONE.test(line)) return false;
  // A title doesn't have sentence punctuation in the middle. If the
  // string ends in a period that's fine (sometimes JDs do that), but
  // mid-sentence periods are a strong sign this is body copy.
  const midPeriod = line.match(/\.\s+\S/);
  if (midPeriod) return false;
  // Reject if it's a comma-separated list of more than 2 items.
  if ((line.match(/,/g) || []).length > 2) return false;
  // Must contain at least one title keyword. The previous "short
  // capitalised line" fallback was too greedy — it accepted things
  // like "Lorem ipsum" or "About Us" if they happened to look
  // formatted. Title keywords (engineer, manager, specialist, etc.)
  // are the only condition that's specific enough to body-text-proof.
  return TITLE_KEYWORDS.test(line);
}

/**
 * Pull a title out of the uploaded filename. Recruiters name their JD
 * files predictably — "Customer Support - Morabits.pdf",
 * "Senior_Backend_Engineer_Lionpoint.docx", "Account Executive (Final).pdf".
 * The leading segment, with the company tail stripped, is almost always
 * the role. This is the strongest signal we have when the body text
 * starts with a paragraph and skips a clean heading.
 */
function titleFromFilename(filename: string): string | undefined {
  if (!filename) return undefined;
  // Drop extension and a trailing "(N)" / "(final)" / "(copy)" wart.
  let base = filename
    .replace(/\.(pdf|docx?|txt|rtf|odt)$/i, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();
  // Normalize separators to spaces, then split on " - " / " — " / " | ".
  // The section *before* that separator is the role; *after* is usually
  // the company. Underscores and dots between words become spaces.
  // When the first segment strips down to nothing (e.g. "JD - Account
  // Executive.pdf" → first segment is just "JD" = noise → try segment
  // #2 next), we walk forward until we find a substantive piece.
  const normalized = base.replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();
  const segments = normalized.split(/\s+[-–—|]\s+/);
  let cleaned = "";
  for (const seg of segments) {
    const candidate = seg.replace(FILENAME_NOISE, "").replace(/\s+/g, " ").trim();
    if (candidate.length >= 3 && candidate.length <= 80) {
      cleaned = candidate;
      break;
    }
  }
  if (!cleaned) return undefined;
  // Capitalize each word lightly so "customer support" → "Customer Support".
  // (Skip if it already has some capitalisation.)
  if (cleaned === cleaned.toLowerCase()) {
    cleaned = cleaned
      .split(" ")
      .map((w) => w ? w[0].toUpperCase() + w.slice(1) : w)
      .join(" ");
  }
  return cleaned;
}

/** Extract the most likely job title. */
export function extractTitle(text: string, filename?: string): string | undefined {
  // 1. Explicit "Job Title: X" / "Position: X" / "Role: X" pattern is the
  //    most authoritative signal when the JD author bothered to label it.
  const explicit = text.match(/(?:^|\n)\s*(?:job\s*title|position|role|puesto|cargo)\s*[:\-]\s*([^\n]+)/i);
  if (explicit && explicit[1]) {
    const v = explicit[1].trim().replace(/\.$/, "");
    if (v.length >= 3 && v.length <= 80) return v;
  }

  // 2. Filename heuristic — second strongest, very reliable in agency
  //    workflows. Try this BEFORE walking body text, because body text
  //    in real JDs often starts with "About the company…" filler.
  const fromFilename = titleFromFilename(filename || "");
  if (fromFilename) return fromFilename;

  // 3. First few lines, only if they look like a title. No "first
  //    reasonable line" fallback — better to leave the field blank
  //    than to paste body copy into the title.
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const candidate = lines[i];
    // "Job: X" / "Position: X" inline (already handled above for
    // anywhere in the doc, but the inline form on the first line is
    // worth recognising explicitly).
    if (/^(job|position|role)\s*:\s*/i.test(candidate)) {
      return candidate.replace(/^(job|position|role)\s*:\s*/i, "").trim();
    }
    if (isLikelyTitleLine(candidate)) {
      return candidate.replace(/^[#•\-\s]*/, "").trim();
    }
  }

  return undefined;
}

/** Extract the most likely location (city / region / country). */
export function extractLocation(text: string): string | undefined {
  // Look for "Location: X" / "Ubicación: X" / "Based in X" patterns first.
  const patterns = [
    /(?:^|\n)\s*(?:location|ubicaci[oó]n|city|ciudad)\s*[:\-]\s*([^\n]+)/i,
    /(?:^|\n)\s*(?:based\s+in|located\s+in)\s+([^\n.,]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const v = m[1].trim().replace(/\.$/, "");
      if (v.length > 1 && v.length < 80) return v;
    }
  }
  return undefined;
}

/** Extract work arrangement. */
export function extractWorkMode(
  text: string
): "ON_SITE" | "REMOTE" | "HYBRID" | undefined {
  const t = text.toLowerCase();

  // Explicit labels win.
  const labelMatch = t.match(
    /(?:work\s+(?:mode|arrangement|type)|modalidad|arreglo)\s*[:\-]\s*([a-z\s\-]+)/i
  );
  if (labelMatch) {
    const v = labelMatch[1];
    if (/hybrid|h[ií]brid/i.test(v)) return "HYBRID";
    if (/remote|remoto/i.test(v)) return "REMOTE";
    if (/on[- ]?site|onsite|presencial|in[- ]?office/i.test(v)) return "ON_SITE";
  }

  // Fall back to keyword presence. Hybrid beats remote beats on-site.
  if (/\bhybrid\b|\bh[ií]brido\b/i.test(t)) return "HYBRID";
  if (/\bremote\b|\bremoto\b|work[- ]from[- ]home|wfh/i.test(t)) return "REMOTE";
  if (/\bon[- ]?site\b|\bonsite\b|\bpresencial\b|\bin[- ]?office\b/i.test(t))
    return "ON_SITE";

  return undefined;
}

/** Run all extractors. */
export function extractJobFields(
  text: string,
  filename?: string
): ExtractedJobFields {
  return {
    title: extractTitle(text, filename),
    location: extractLocation(text),
    workMode: extractWorkMode(text),
  };
}
