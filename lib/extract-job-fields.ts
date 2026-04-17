// Heuristic extractor for Job-Description parsed text.
// Given the formatted plain text of a JD, infer the most likely:
//   - title (job title)
//   - location (city/region)
//   - workMode ("ON_SITE" | "REMOTE" | "HYBRID")
//
// Returns undefined for any field it can't confidently guess. Callers
// should treat this as best-effort.

export type ExtractedJobFields = {
  title?: string;
  location?: string;
  workMode?: "ON_SITE" | "REMOTE" | "HYBRID";
};

// Words that indicate "this line is NOT a job title" (section headings we
// see at the top of JDs in both English and Spanish).
const NON_TITLE_HEADINGS = /^(about|overview|description|the company|the role|the position|company|sobre|sobre el rol|acerca|descripci[oó]n|resumen|job description|position summary)\b/i;

// Common job-title keywords used to promote a candidate line.
const TITLE_KEYWORDS = /(engineer|developer|designer|manager|lead|director|analyst|scientist|architect|consultant|specialist|associate|intern|officer|strateg|recruit|account|executive|coordinator|representative|ingenier|desarrollador|desarrollador[a]?|analista|gerente|director[a]?|jefe|l[ií]der)/i;

/** Extract the most likely job title. */
export function extractTitle(text: string): string | undefined {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return undefined;

  // Prefer the first line if it looks like a title (not an "About" heading,
  // reasonable length, contains title-like keywords OR is short uppercase).
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const candidate = lines[i];
    if (candidate.length < 3 || candidate.length > 120) continue;
    if (NON_TITLE_HEADINGS.test(candidate)) continue;
    if (/^(job|position|role)\s*:\s*/i.test(candidate)) {
      return candidate.replace(/^(job|position|role)\s*:\s*/i, "").trim();
    }
    if (TITLE_KEYWORDS.test(candidate)) {
      return candidate.replace(/^[#•\-\s]*/, "").trim();
    }
  }

  // Fallback: first non-heading line.
  const firstReasonable = lines.find(
    (l) => l.length >= 3 && l.length <= 120 && !NON_TITLE_HEADINGS.test(l)
  );
  return firstReasonable;
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
export function extractJobFields(text: string): ExtractedJobFields {
  return {
    title: extractTitle(text),
    location: extractLocation(text),
    workMode: extractWorkMode(text),
  };
}
