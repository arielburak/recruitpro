import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";

export async function POST(request: Request) {
  try {
    await getOrgContext(); // Auth check

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    let text: string;

    if (fileName.endsWith(".pdf")) {
      // Use lib/pdf-parse directly to avoid test-file loading bug in serverless
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } else if (fileName.endsWith(".docx")) {
      const mammoth = require("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const docResult = await mammoth.extractRawText({ buffer });
      text = docResult.value;
    } else {
      // .txt or other text-based formats
      text = await file.text();
    }

    const parsed = parseResumeText(text, file.name);

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Section heading patterns — used to skip these lines when looking for names
const SECTION_HEADINGS = /^(experience|education|skills|summary|objective|profile|about|qualifications|certifications?|certificationes|awards?|publications?|references?|interests?|activities|projects?|work\s*history|professional|bar\s*admissions?|practice\s*areas?|specialties|biography|knowledge|languages?|idiomas|educaci[oó]n|experiencia|conocimientos|habilidades|contacto|contact)\b/i;

// Known abbreviations / tech terms / locations that are NOT names
const NOT_A_NAME = /^(CABA|UTN|UBA|UNLP|UADE|ITBA|MIT|UCLA|IBM|AWS|GCP|CRM|SQL|DNS|VPN|DHCP|USA|NYC|LLC|LLP|LTD|INC|CEO|CTO|CFO|COO|CIO|VP|SVP|EVP|HR|IT|QA|PM|BA|SA|SR|JR|NA|TBD|ETC|PDF|CV|MBA|PHD|MD|JD|ESQ|RN|PE|PMP|LEED|CISSP|CCNA|CCNP)\b/i;

// Date/year patterns
const HAS_DATE = /\b\d{4}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|present|presente|actual|pausa)\b/i;

// Tech/tool words that should never be in a name
const TECH_WORDS = /\b(vmware|nutanix|windows|server|linux|docker|kubernetes|azure|cisco|fortinet|active\s*directory|office|admin|firewall|switch|router|backup|terraform|python|java|react|angular|node|sql|html|css|excel|powerpoint|scrum|agile|servicenow|jira|git|github|senior|junior|semi-senior|medium|basic|advanced|intermediate|avanzado|intermedio|b[12]|c[12]|a[12]|native|nativo)\b/i;

// Job-title words that the candidate is more likely to put on the
// SECOND line of their header ("John Smith\nSoftware Engineer") than
// as their actual name. We don't strip them as TECH_WORDS does — a
// line like "John Engineer" might still be a person's last name — but
// we use the match below as a tiebreaker so the name candidate from
// line 1 wins over the headline on line 2.
const JOB_TITLE_WORDS = /\b(engineer|developer|architect|manager|director|analyst|consultant|designer|scientist|lead|attorney|partner|associate|specialist|coordinator|officer|president|founder|recruiter|salesperson|representative|writer|editor|producer|artist|teacher|professor|nurse|doctor|physician|surgeon|paralegal)\b/i;

// Exported only so the helpers can be smoke-tested from a script
// without spinning up the HTTP layer. Not part of the public API.
export function parseResumeText(text: string, fileName?: string): Record<string, any> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const result: Record<string, any> = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    location: "",
    currentTitle: "",
    currentCompany: "",
    linkedIn: "",
    skills: [],
    summary: "",
    education: [],
  };

  // --- Email ---
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) result.email = emailMatch[0];

  // --- Phone ---
  // CVs in LATAM often write the country code wrapped in parens — "(+54)
  // 11 3143-2490". The regex below skips paren-wrapped prefixes (the
  // outer `\(?` only allows them around the area code, not the country
  // code), so we strip those parens before matching.
  const phoneText = text.replace(/\((\+\d{1,4})\)/g, "$1");
  const phoneMatch = phoneText.match(
    /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\s*\d{3,4}[-.\s]?\s*\d{4}/
  );
  if (phoneMatch) result.phone = phoneMatch[0].trim();

  // --- LinkedIn ---
  let linkedInSlug = "";
  const linkedInMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([\w-]+)/i
  );
  if (linkedInMatch) {
    result.linkedIn = linkedInMatch[0].startsWith("http")
      ? linkedInMatch[0]
      : `https://${linkedInMatch[0]}`;
    linkedInSlug = linkedInMatch[1]; // e.g. "gabriel-fernandez-saiz"
  }

  // --- Name Detection (multi-strategy) ---
  extractName(lines, result, fileName, linkedInSlug);

  // --- Location ---
  extractLocation(lines, result);

  // --- Phone country inference ---
  // If we got a phone but no country code came along, derive it from
  // signals in the CV. Order: explicit country name (location text or
  // anywhere in the doc) → AR-specific city/province hint → US state
  // abbreviation. Skips the browser-locale fallback that PhoneInput
  // does, so a US recruiter parsing an AR candidate's CV gets +54, not
  // +1.
  if (result.phone && !/^\+/.test(result.phone)) {
    const signalText = `${result.location || ""}\n${text.slice(0, 1500)}`;
    const dialFromCountry = inferDialCodeFromText(signalText);
    let inferred: string | null = dialFromCountry;
    if (!inferred && AR_HINTS.test(signalText)) inferred = "+54";
    // Spelled-out US state names anywhere in the signal text are
    // unambiguous (vs the 2-letter codes which collide with random
    // tokens). Covers "California SBN", "Texas Bar #...", "Admitted
    // in New York" etc., common in US legal/medical resumes.
    if (!inferred && US_STATE_NAMES.test(signalText)) inferred = "+1";
    // Major US cities are also a confident signal — used to recover
    // +1 from CVs whose contact line says "Los Angeles" without ever
    // spelling out the state.
    if (!inferred && US_CITY_HINTS.test(signalText)) inferred = "+1";
    if (!inferred && US_HINTS.test(result.location || "")) inferred = "+1";
    if (inferred) {
      result.phone = `${inferred} ${result.phone}`;
    }
  }

  // --- Current Title & Company ---
  // Broadened heading patterns — covers the typical variants in EN + ES.
  const expSectionIndex = findSectionIndex(
    lines,
    /^(experience|professional\s*experience|work\s*experience|employment\s*history|employment|career\s*experience|professional\s*background|work\s*history|experiencia|experiencia\s*profesional|experiencia\s*laboral|trayectoria\s*profesional|historia\s*laboral)\b/i
  );
  if (expSectionIndex >= 0) {
    const afterExp = lines.slice(expSectionIndex + 1);
    // US-traditional format wins when present — "Company, LLP – City
    // Mon YYYY – Present" on one line, "Title, Full-Time" on the next.
    // This is the dominant US resume shape (legal, consulting, banking,
    // most "old-school" templates). When it doesn't match we fall back
    // to the LinkedIn-style extractor that handles company/title/date
    // each on their own line.
    if (!extractTraditionalUSRole(afterExp, result)) {
      extractCurrentRole(afterExp, result);
    }
  }

  // Headline fallback — many CVs put "<Title> at <Company>" in the header
  // (LinkedIn-style), which we miss if there's no formal Experience heading.
  if (!result.currentTitle || !result.currentCompany) {
    extractHeadlineRole(lines, result);
  }

  // --- Skills ---
  const skillKeywords = [
    // Programming & Tech
    "JavaScript", "TypeScript", "Python", "Java", "C\\+\\+", "C#", "Ruby", "Go", "Rust", "Swift", "Kotlin",
    "React", "Angular", "Vue", "Next\\.js", "Node\\.js", "Express", "Django", "Flask", "Spring",
    "AWS", "Azure", "GCP", "Docker", "Kubernetes", "CI/CD", "Git",
    "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "GraphQL", "REST",
    "Machine Learning", "AI", "Data Science", "Deep Learning",
    // Infrastructure
    "VMware", "Nutanix", "Active Directory", "Terraform", "Linux",
    "Veeam", "Fortinet", "Cisco",
    // Legal
    "Real Estate", "M&A", "Mergers and Acquisitions", "Corporate Law", "Corporate Governance",
    "Due Diligence", "Litigation", "Leasing", "Commercial Leasing", "Securities",
    "Private Equity", "Venture Capital", "Capital Markets", "Restructuring",
    "Regulatory Compliance", "Compliance", "Contract Negotiation", "Contract Drafting",
    "Legal Research", "Legal Writing", "Intellectual Property", "Patent",
    "Employment Law", "Labor Law", "Tax Law", "Bankruptcy", "Insurance",
    "Environmental Law", "Antitrust", "Trade", "International Law",
    "Dispute Resolution", "Arbitration", "Mediation",
    // Finance
    "Finance", "Financial Analysis", "Financial Modeling", "Accounting",
    "Investment Banking", "Asset Management", "Portfolio Management",
    "Risk Management", "Valuation", "Underwriting", "Credit Analysis",
    "Budgeting", "Forecasting", "Auditing",
    // Business & General
    "Agile", "Scrum", "Project Management", "Program Management", "Leadership",
    "Sales", "Marketing", "Business Development", "Account Management",
    "Excel", "PowerPoint", "Salesforce", "CRM",
    "Strategic Planning", "Operations", "Supply Chain",
    "Negotiation", "Client Relations", "Stakeholder Management",
    "Communication", "Presentation", "Public Speaking",
    "Team Management", "Cross-functional", "Change Management",
  ];

  const foundSkills: string[] = [];
  for (const skill of skillKeywords) {
    const regex = new RegExp(`\\b${skill}\\b`, "i");
    if (regex.test(text)) {
      foundSkills.push(skill.replace(/\\\+/g, "+").replace(/\\\./g, "."));
    }
  }
  result.skills = [...new Set(foundSkills)];

  // --- Summary / Bio ---
  const summaryIndex = findSectionIndex(
    lines,
    /^(biography|summary|profile|about|objective)\b/i
  );
  if (summaryIndex >= 0) {
    const summaryLines: string[] = [];
    for (let i = summaryIndex + 1; i < lines.length; i++) {
      if (SECTION_HEADINGS.test(lines[i])) break;
      summaryLines.push(lines[i]);
      if (summaryLines.join(" ").length > 500) break;
    }
    result.summary = summaryLines.join(" ").slice(0, 500).trim();
  }

  // --- Education ---
  const eduIndex = findSectionIndex(lines, /^(education|educaci[oó]n)\b/i);
  if (eduIndex >= 0) {
    const schools: string[] = [];
    for (let i = eduIndex + 1; i < lines.length; i++) {
      if (SECTION_HEADINGS.test(lines[i]) && !/^(education|educaci[oó]n)/i.test(lines[i])) break;
      if (/university|college|school|institute|universidad|facultad|utn|uba|uade|itba/i.test(lines[i])) {
        schools.push(lines[i]);
      }
    }
    result.education = schools;
  }

  // Also check for "Law School" / "Undergraduate" labeled lines
  if (result.education.length === 0) {
    const lawSchoolIdx = findSectionIndex(lines, /^law\s*school\b/i);
    const undergradIdx = findSectionIndex(lines, /^undergraduate\b/i);
    const schools: string[] = [];
    if (lawSchoolIdx >= 0 && lines[lawSchoolIdx + 1]) schools.push(lines[lawSchoolIdx + 1]);
    if (undergradIdx >= 0 && lines[undergradIdx + 1]) schools.push(lines[undergradIdx + 1]);
    if (schools.length > 0) result.education = schools;
  }

  return result;
}

// Decorators that show up next to the candidate's name on modern US
// resumes — strip them out before pattern-matching so the name parts
// aren't broken by stray punctuation or extra tokens. Examples:
//
//   "John Smith (he/him)"            → "John Smith"
//   "John Smith, PhD"                → "John Smith"
//   "Mary O'Brien, MBA, CFA"         → "Mary O'Brien"
//   "Sr. Engineer | John Smith"      → "John Smith"
//   "Dr. John Smith"                 → "John Smith"
//   "Smith, John"                    → "John Smith"  (academic order)
function stripNameLineNoise(line: string): string {
  let s = line;
  // Pronouns in parentheses (he/him, she/her, they/them + ES variants)
  s = s.replace(
    /\s*\((?:he|she|they|him|her|them|[ée]l|ella|ellos|ellas)\s*\/\s*(?:he|she|they|him|her|them|[ée]l|ella|ellos|ellas)\)\s*/gi,
    " ",
  );
  // Trailing credentials after a comma: "John Smith, PhD, MBA, CFA".
  // Multiple credentials chain together so the regex eats everything
  // from the first credential to the end of line.
  s = s.replace(
    /,\s*(?:Ph\.?\s*D\.?|MBA|J\.?\s*D\.?|M\.?\s*D\.?|CFA|CPA|Esq\.?|RN|P\.?\s*E\.?|PMP|CISSP|CCNA|CCNP|CISA|CRISC|CIA|FRM|CMA|CFP|CISM|AICP|RA|LEED(?:\s*AP)?|MSc?|BSc?|MA|BA|BS|MS|MEng|BEng|FACS|FAAP|FACEP)\b.*$/i,
    "",
  );
  // Leading honorifics: "Dr. John Smith" / "Prof. John Smith" /
  // "Mr. John Smith" / "Sr. Juan Pérez". Conservative list — only
  // strip ones that are unambiguous prefixes (not "Sir" which is rare
  // and ambiguous).
  s = s.replace(
    /^(?:Dr|Mr|Mrs|Ms|Mx|Prof|Rev|Hon|Ing|Lic|Arq|Sr|Sra|Srta)\.?\s+/i,
    "",
  );
  // Title-on-the-left split by pipe: "Sr. Engineer | John Smith".
  // Only when there's exactly one pipe — multi-pipe headers are
  // typically location/contact strips and not names.
  if (s.split("|").length === 2) {
    const right = s.split("|")[1].trim();
    if (right) s = right;
  }
  // Academic / "phonebook" order: "Smith, John" → "John Smith".
  // Only flip when both halves look like name parts (1–2 words each,
  // every word title-cased) so we don't accidentally swallow "Smith,
  // Counsel at Lewis & Co" or "Software Engineer, Senior".
  const commaFlip = s.match(/^([A-ZÀ-Ú][\p{L}.'\-]+(?:\s+[A-ZÀ-Ú][\p{L}.'\-]+)?)\s*,\s*([A-ZÀ-Ú][\p{L}.'\-]+(?:\s+[A-ZÀ-Ú][\p{L}.'\-]+)?)$/u);
  if (commaFlip) {
    s = `${commaFlip[2]} ${commaFlip[1]}`;
  }
  return s.trim();
}

// Detect if a line of words looks like a name. Two valid shapes:
//   · Title Case: "John Smith", "Mary O'Brien"
//   · ALL CAPS:   "JOHN SMITH", "MARY O'BRIEN"
// Returns the parts already normalized to Title Case if matched, else
// null. Middle initials ("A.") count as a single part.
function asNameParts(line: string): string[] | null {
  const parts = line.split(/\s+/).filter((p) => p.length >= 1);
  if (parts.length < 2 || parts.length > 5) return null;

  // Allow Unicode letters, ASCII + curly apostrophes, periods, hyphens.
  // \p{Lu} covers uppercase incl. accented (Á, Ñ, É…), \p{L} covers any
  // letter — using both is robust across LATAM / EU / Asian-Latin names.
  const titleCase = /^\p{Lu}[\p{L}.''‘’\-]*\.?$/u;
  const allCaps = /^\p{Lu}[\p{Lu}.''‘’\-]*\.?$/u;
  const initial = /^\p{Lu}\.?$/u;

  const matches = (p: string) =>
    titleCase.test(p) || allCaps.test(p) || initial.test(p);

  if (!parts.every(matches)) return null;

  // If any part is ALL CAPS (not an initial), normalize the whole
  // thing to Title Case. We don't keep "JOHN" — recruiters expect
  // "John" in the field.
  const anyCaps = parts.some((p) => p.length >= 3 && p === p.toUpperCase());
  if (anyCaps) {
    return parts.map((p) => {
      if (p.length <= 1) return p.toUpperCase();
      if (initial.test(p)) return p.toUpperCase();
      return p[0].toUpperCase() + p.slice(1).toLowerCase();
    });
  }
  return parts;
}

/**
 * Multi-strategy name extraction:
 * 1. Try filename (e.g. "CV - Gabriel Fernandez Saiz.pdf", "John_Smith_Resume.pdf")
 * 2. Try LinkedIn slug (e.g. "gabriel-fernandez-saiz")
 * 3. Scan ALL lines for name-like patterns, with strict filtering
 * 4. Use email as validation hint
 */
function extractName(lines: string[], result: Record<string, any>, fileName?: string, linkedInSlug?: string) {
  // Helper: validate a name candidate against email if available.
  // Three positive signals:
  //   · first name slice (≥3 chars) appears in the email local part
  //   · last name slice (≥4 chars) appears
  //   · email starts with the first initial AND contains any
  //     individual last-name token (covers LATAM "gfsaiz" =
  //     g + f + saiz → Gabriel Fernandez Saiz)
  // First two are case-insensitive substring checks; punctuation
  // in the email is stripped so "first.last@..." also matches.
  const email = result.email?.toLowerCase() || "";
  function nameMatchesEmail(first: string, last: string): boolean {
    if (!email) return true;
    const f = first.toLowerCase();
    const lastTokens = last.toLowerCase().split(/\s+/).filter(Boolean);
    const l = lastTokens.join("");
    const emailLocal = email.split("@")[0].replace(/[._-]/g, "");
    if (emailLocal.includes(f.slice(0, 3))) return true;
    if (l && emailLocal.includes(l.slice(0, 4))) return true;
    if (
      f.length > 0 &&
      emailLocal.startsWith(f[0]) &&
      lastTokens.some((t) => t.length >= 3 && emailLocal.includes(t.slice(0, 4)))
    ) {
      return true;
    }
    return false;
  }

  // Strategy 1: Extract from filename. Tries several patterns common
  // across US/LATAM recruiters:
  //
  //   · "CV - John Smith.pdf"  / "Resume_John_Smith.pdf"  / "Curriculum John Smith.pdf"
  //   · "John Smith Resume.pdf"
  //   · "John_Smith_2024.pdf"  / "John-Smith-Engineer.pdf"
  //   · "JohnSmith.pdf"        (single-token camelCase — handled separately)
  //
  // Each pattern produces a list of candidate name parts that goes
  // through asNameParts(); the first one that yields a valid name and
  // matches the email wins.
  if (fileName) {
    const baseName = fileName
      .replace(/\.[^.]+$/, "") // drop extension
      .replace(/[_]+/g, " ") // underscores → spaces
      .trim();

    const filenameCandidates: string[] = [];

    // Pattern A: "CV - <name>" / "Resume - <name>" / leading marker
    const leadMarker = baseName.match(
      /^(?:cv|resume|curriculum|c\.?v\.?)\s*[-–—:]?\s*(.+)$/i,
    );
    if (leadMarker) filenameCandidates.push(leadMarker[1]);

    // Pattern B: "<name> - Resume" / "<name> Resume"
    const trailMarker = baseName.match(
      /^(.+?)\s*[-–—]?\s*(?:cv|resume|curriculum|c\.?v\.?)\s*.*$/i,
    );
    if (trailMarker) filenameCandidates.push(trailMarker[1]);

    // Pattern C: drop a trailing year ("John Smith 2024")
    const yearStripped = baseName.replace(/\s+\d{4}\s*$/, "").trim();
    if (yearStripped && yearStripped !== baseName) filenameCandidates.push(yearStripped);

    // Pattern D: the raw filename itself
    filenameCandidates.push(baseName);

    for (const cand of filenameCandidates) {
      const cleaned = stripNameLineNoise(cand.replace(/[-]+/g, " "));
      const parts = asNameParts(cleaned);
      if (!parts) continue;
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ");
      if (nameMatchesEmail(firstName, lastName)) {
        result.firstName = firstName;
        result.lastName = lastName;
        return;
      }
    }
  }

  // Strategy 2: LinkedIn slug → name
  // "gabriel-fernandez-saiz" → Gabriel Fernandez Saiz
  if (linkedInSlug) {
    const parts = linkedInSlug.split("-").filter((p) => p.length > 1);
    if (parts.length >= 2) {
      const capitalized = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
      const candidateFirst = capitalized[0];
      const candidateLast = capitalized.slice(1).join(" ");
      if (nameMatchesEmail(candidateFirst, candidateLast)) {
        result.firstName = candidateFirst;
        result.lastName = candidateLast;
        return;
      }
    }
  }

  // Strategy 3: Scan text lines for name patterns
  // Collect all candidates, then pick the best one
  const candidates: { firstName: string; lastName: string; score: number; line: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Hard skips — these lines can't be names regardless of cleanup.
    if (line.includes("@")) continue;
    if (/\d{3}.*\d{3}/.test(line)) continue; // phone numbers
    if (/https?:\/\/|www\.|linkedin\.com/i.test(line)) continue;
    if (SECTION_HEADINGS.test(line)) continue;
    if (HAS_DATE.test(line)) continue;
    if (TECH_WORDS.test(line)) continue;
    if (NOT_A_NAME.test(line.replace(/\s+/g, " "))) continue;
    // Skip ALL CAPS lines that are too short to be a name (e.g.
    // "CABA UTN" → 8 chars). The threshold used to be 15 which
    // also killed "JOHN SMITH" (10 chars). 8 keeps the abbreviation
    // guardrail without rejecting short legitimate US names.
    if (/^[A-Z]{2,}\s+[A-Z]{2,}\s*$/.test(line) && line.length < 8) continue;
    // Skip lines with numbers (dates, addresses, etc.)
    if (/\d/.test(line)) continue;

    // Soft-clean the line BEFORE rejecting on special characters —
    // pronouns "(he/him)", credentials ", PhD", and a single
    // title|name pipe split would otherwise kill an otherwise valid
    // first-line name.
    const denoised = stripNameLineNoise(line);

    // Now drop the line if special characters still remain.
    if (/[°#@&%$!?;:(){}[\]\/\\|<>=+*~^]/.test(denoised)) continue;

    // Trim trailing punctuation that isn't part of a name.
    const cleaned = denoised
      .replace(/['']\d{2}\b/g, "")
      .replace(/[,|•·\-–—]+$/, "")
      .trim();
    if (!cleaned || cleaned.length < 3) continue;

    const parts = asNameParts(cleaned);
    if (!parts) continue;

    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ");

    // Score the candidate
    let score = 0;
    if (nameMatchesEmail(firstName, lastName)) score += 10;
    if (parts.length >= 2 && parts.length <= 3) score += 3;
    if (i === 0) score += 3; // very first line is the strongest signal
    else if (i < 15) score += 2;
    // The mixed-case bonus stays — Title Case is the most natural
    // shape for a name, even if ALL CAPS is now accepted. ALL CAPS
    // pays the opportunity cost of being more often a heading, so
    // it should win only when nothing else does.
    if (cleaned !== cleaned.toUpperCase()) score += 2;
    if (parts.every((p) => p.length >= 3)) score += 2;
    // Penalty for very short ALL CAPS lines (likely abbreviations
    // or section labels).
    if (cleaned === cleaned.toUpperCase() && cleaned.length < 10) score -= 5;
    // Heavy penalty for job-title-looking lines that don't match
    // the email at all. "Software Engineer" would otherwise win
    // over a real ALL CAPS name above it just on length / mixed-
    // case alone.
    if (JOB_TITLE_WORDS.test(cleaned) && !nameMatchesEmail(firstName, lastName)) {
      score -= 8;
    }

    candidates.push({ firstName, lastName, score, line: cleaned });
  }

  // Also check for two consecutive single-name lines (e.g. "Fernandez Saiz" then "Gabriel Alejandro")
  for (let i = 0; i < lines.length - 1; i++) {
    const line1 = stripNameLineNoise(lines[i].trim());
    const line2 = stripNameLineNoise(lines[i + 1].trim());

    // Both should be name-like, no numbers, no headings
    if (HAS_DATE.test(line1) || HAS_DATE.test(line2)) continue;
    if (SECTION_HEADINGS.test(line1) || SECTION_HEADINGS.test(line2)) continue;
    if (TECH_WORDS.test(line1) || TECH_WORDS.test(line2)) continue;
    if (/\d/.test(line1) || /\d/.test(line2)) continue;
    if (NOT_A_NAME.test(line1) || NOT_A_NAME.test(line2)) continue;

    const parts1 = line1.split(/\s+/);
    const parts2 = line2.split(/\s+/);
    if (parts1.length < 1 || parts1.length > 3 || parts2.length < 1 || parts2.length > 3) continue;

    // Validate each line as a half-name independently (accepts ALL
    // CAPS too via asNameParts when there's >=2 parts; for single-
    // part lines we fall back to the original strict pattern).
    const halfNameRe = /^[A-ZÀ-Ú][a-zA-ZÀ-ÿ.''-]*$/u;
    const halfCapsRe = /^[A-ZÀ-Ú][A-ZÀ-Ú.''-]*$/u;
    const partOK = (p: string) =>
      p.length >= 2 && (halfNameRe.test(p) || halfCapsRe.test(p));
    if (!parts1.every(partOK) || !parts2.every(partOK)) continue;

    // Normalize ALL CAPS halves to Title Case so the candidate is
    // clean before we score it.
    const toTitle = (p: string) =>
      p === p.toUpperCase() && p.length >= 3
        ? p[0] + p.slice(1).toLowerCase()
        : p;
    const norm1 = parts1.map(toTitle);
    const norm2 = parts2.map(toTitle);
    const allParts = [...norm1, ...norm2];

    // Determine which is first name vs last name. Common LatAm
    // pattern: line2 carries the first name, line1 the last name.
    // We probe both orders against the email and keep the one that
    // matches.
    let firstName = norm2[0];
    let lastName = norm1.join(" ");

    let score = 5; // Two-line name pattern gets a base bonus
    if (nameMatchesEmail(firstName, lastName)) score += 10;
    // Try the other order
    if (!nameMatchesEmail(firstName, lastName)) {
      firstName = norm1[0];
      lastName = norm2.join(" ");
      if (nameMatchesEmail(firstName, lastName)) score += 10;
    }
    if (allParts.every((p) => p.length >= 3)) score += 2;

    candidates.push({ firstName, lastName, score, line: `${line1} | ${line2}` });
  }

  // Pick the best candidate
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    result.firstName = candidates[0].firstName;
    result.lastName = candidates[0].lastName;
  }
}

/**
 * Known cities / regions / countries for location detection
 */
const KNOWN_LOCATIONS = /\b(Buenos Aires|CABA|Capital Federal|C\.A\.B\.A|Córdoba|Rosario|Mendoza|Mar del Plata|La Plata|Tucumán|Santa Fe|Salta|San Juan|Neuquén|Bahía Blanca|Resistencia|Corrientes|Posadas|San Luis|Santiago del Estero|Formosa|Catamarca|La Rioja|Jujuy|Río Gallegos|Ushuaia|Rawson|Viedma|New York|Los Angeles|Chicago|Houston|Phoenix|Philadelphia|San Antonio|San Diego|Dallas|San Jose|Austin|Jacksonville|San Francisco|Columbus|Indianapolis|Fort Worth|Charlotte|Seattle|Denver|Washington|Nashville|Oklahoma City|El Paso|Boston|Portland|Las Vegas|Memphis|Louisville|Baltimore|Milwaukee|Albuquerque|Tucson|Fresno|Sacramento|Mesa|Kansas City|Atlanta|Omaha|Colorado Springs|Raleigh|Long Beach|Virginia Beach|Miami|Oakland|Minneapolis|Tampa|Tulsa|Arlington|New Orleans|London|Paris|Madrid|Barcelona|Berlin|Munich|Amsterdam|Dublin|São Paulo|Rio de Janeiro|Santiago|Lima|Bogotá|México|Guadalajara|Monterrey|Toronto|Vancouver|Montreal|Sydney|Melbourne|Singapore|Hong Kong|Tokyo|Shanghai|Beijing|Dubai|Mumbai|Bangalore|Argentina|United States|USA|UK|United Kingdom|Spain|Germany|France|Brazil|Chile|Colombia|Peru|Mexico|Canada|Australia|Remote|Remoto)\b/i;

const US_STATES = /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;

const AR_PROVINCES = /\b(Buenos Aires|CABA|Capital Federal|Córdoba|Santa Fe|Mendoza|Tucumán|Entre Ríos|Salta|Misiones|Chaco|Corrientes|Santiago del Estero|San Juan|Jujuy|Río Negro|Neuquén|Formosa|Chubut|San Luis|Catamarca|La Rioja|La Pampa|Santa Cruz|Tierra del Fuego)\b/i;

// Country-name patterns → E.164 dial code. Used to recover the phone
// prefix when the regex didn't capture one (e.g. CVs that write the
// prefix in parens "(+54)" or omit it entirely). Ordered with multi-word
// matches first so "United States" wins over "States" elsewhere. Spanish
// and English variants both covered.
const COUNTRY_DIAL_CODES: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\b(?:argentin[ao]?)\b/i, code: "+54" },
  { pattern: /\b(?:united\s*states|estados\s*unidos|\bU\.?S\.?A\.?\b|\bUSA?\b)\b/i, code: "+1" },
  { pattern: /\b(?:brasil|brazil)\b/i, code: "+55" },
  { pattern: /\b(?:chile)\b/i, code: "+56" },
  { pattern: /\b(?:colombia)\b/i, code: "+57" },
  { pattern: /\b(?:m[eé]xico|mexico)\b/i, code: "+52" },
  { pattern: /\b(?:per[uú]|peru)\b/i, code: "+51" },
  { pattern: /\b(?:uruguay)\b/i, code: "+598" },
  { pattern: /\b(?:paraguay)\b/i, code: "+595" },
  { pattern: /\b(?:bolivia)\b/i, code: "+591" },
  { pattern: /\b(?:ecuador)\b/i, code: "+593" },
  { pattern: /\b(?:venezuela)\b/i, code: "+58" },
  { pattern: /\b(?:united\s*kingdom|england|inglaterra|\bUK\b|gran\s*breta[ñn]a)\b/i, code: "+44" },
  { pattern: /\b(?:espa[ñn]a|spain)\b/i, code: "+34" },
  { pattern: /\b(?:france|francia)\b/i, code: "+33" },
  { pattern: /\b(?:germany|deutschland|alemania)\b/i, code: "+49" },
  { pattern: /\b(?:italy|italia)\b/i, code: "+39" },
  { pattern: /\b(?:portugal)\b/i, code: "+351" },
  { pattern: /\b(?:netherlands|holanda|pa[ií]ses\s*bajos)\b/i, code: "+31" },
  { pattern: /\b(?:switzerland|suiza)\b/i, code: "+41" },
  { pattern: /\b(?:australia)\b/i, code: "+61" },
  { pattern: /\b(?:japan|jap[oó]n)\b/i, code: "+81" },
  { pattern: /\b(?:china)\b/i, code: "+86" },
  { pattern: /\b(?:india)\b/i, code: "+91" },
  { pattern: /\b(?:israel)\b/i, code: "+972" },
  { pattern: /\b(?:united\s*arab\s*emirates|emiratos\s*[aá]rabes\s*unidos|\bUAE\b)\b/i, code: "+971" },
];

function inferDialCodeFromText(text: string): string | null {
  for (const { pattern, code } of COUNTRY_DIAL_CODES) {
    if (pattern.test(text)) return code;
  }
  return null;
}

// AR provinces / "CABA" / "Buenos Aires" in the location alone are a
// strong-enough signal even when "Argentina" isn't spelled out.
const AR_HINTS = /\b(CABA|Capital Federal|Buenos Aires|C\.A\.B\.A|Córdoba|Rosario|Mendoza|Tucumán|Santa Fe|Salta|Mar del Plata|La Plata)\b/i;
const US_HINTS = US_STATES;
// Spelled-out US state names only — safe to use against the full
// document text because they don't collide with random tokens (unlike
// 2-letter codes "AR", "CA", "MA").
const US_STATE_NAMES = /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/;
// Major US cities — sufficient confidence to imply +1 even without
// a state mention.
const US_CITY_HINTS = /\b(New York|Los Angeles|Chicago|Houston|Phoenix|Philadelphia|San Antonio|San Diego|Dallas|San Jose|Austin|Jacksonville|San Francisco|Columbus|Indianapolis|Fort Worth|Charlotte|Seattle|Denver|Nashville|Oklahoma City|El Paso|Boston|Portland|Las Vegas|Memphis|Louisville|Baltimore|Milwaukee|Albuquerque|Tucson|Fresno|Sacramento|Mesa|Kansas City|Atlanta|Omaha|Colorado Springs|Raleigh|Long Beach|Virginia Beach|Miami|Oakland|Minneapolis|Tampa|Tulsa|Arlington|New Orleans|Brooklyn|Manhattan|Queens|Bronx)\b/;

/**
 * Extract location with multiple strategies, prioritizing the header area.
 * Skips lines that belong to experience/education sections.
 */
function extractLocation(lines: string[], result: Record<string, any>) {
  // Strategy 1: Look for explicit location labels in the header (first ~20 lines)
  const headerLines = lines.slice(0, 20);

  for (const line of headerLines) {
    // Explicit labels: "Location: Buenos Aires", "📍 New York, NY", "Ubicación: CABA"
    const labelMatch = line.match(/(?:location|ubicaci[oó]n|📍|domicilio|direcci[oó]n|residencia)\s*[:]\s*(.+)/i);
    if (labelMatch) {
      result.location = labelMatch[1].trim().replace(/[|•·,]+$/, "").trim();
      return;
    }
  }

  // Strategy 1.5: US-style contact lines pack city/state on the same
  // line as phone + email ("Los Angeles, CA | (555) 123-4567 |
  // jane@x.com"). The line-level loops below skip it wholesale because
  // of "@" — split by pipe / bullet / middot first and scan each
  // segment for a location signal.
  for (const line of headerLines) {
    if (SECTION_HEADINGS.test(line)) break;
    const segments = line.split(/\s*[|•·]\s*/);
    if (segments.length < 2) continue;
    for (const raw of segments) {
      const seg = raw.trim();
      if (!seg || seg.length > 60) continue;
      if (seg.includes("@")) continue;
      if (/https?:\/\/|www\.|linkedin\.com/i.test(seg)) continue;
      if (/\d{3}.*\d{3}/.test(seg)) continue; // phone
      if (TECH_WORDS.test(seg)) continue;

      // "Los Angeles, CA" / "Buenos Aires, Argentina"
      const cityState = seg.match(/^([A-ZÀ-Ú][a-zA-ZÀ-ÿ.\s]+?),\s*([A-Z]{2}|[A-ZÀ-Ú][a-zA-ZÀ-ÿ]+)$/);
      if (cityState) {
        const right = cityState[2];
        const left = cityState[1];
        if (
          US_STATES.test(right) ||
          AR_PROVINCES.test(right) ||
          KNOWN_LOCATIONS.test(right) ||
          KNOWN_LOCATIONS.test(left)
        ) {
          result.location = seg;
          return;
        }
      }

      // Standalone known city / state.
      const known = seg.match(KNOWN_LOCATIONS);
      if (known && seg.length < 40) {
        result.location = known[0];
        return;
      }
      const stateName = seg.match(US_STATE_NAMES);
      if (stateName && seg.length < 40) {
        result.location = stateName[0];
        return;
      }
    }
  }

  // Strategy 2: Look for known city/country names in the header area
  // Only consider lines before any section heading (experience, education, etc.)
  let headerEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (SECTION_HEADINGS.test(lines[i])) {
      headerEnd = i;
      break;
    }
  }

  const resumeHeader = lines.slice(0, Math.min(headerEnd, 20));

  for (const line of resumeHeader) {
    // Skip lines that look like email, phone, URLs, or names
    if (line.includes("@")) continue;
    if (/https?:\/\/|www\.|linkedin\.com/i.test(line)) continue;
    if (TECH_WORDS.test(line)) continue;
    if (/\b(LLP|LLC|LTD|Inc|Corp|University|Instituto|Facultad|Estudio)\b/i.test(line)) continue;

    // Check if line contains a known location
    const knownMatch = line.match(KNOWN_LOCATIONS);
    if (knownMatch) {
      // Try to get a more complete location string like "Buenos Aires, Argentina" or "New York, NY"
      // Look for "KnownCity, State/Country" pattern
      const fullPattern = new RegExp(
        `(${knownMatch[0]}(?:\\s*,\\s*(?:${US_STATES.source}|${AR_PROVINCES.source}|[A-ZÀ-Ú][a-zA-ZÀ-ÿ]+(?:\\s[A-ZÀ-Ú][a-zA-ZÀ-ÿ]+)*))?)`
      );
      const fullMatch = line.match(fullPattern);
      result.location = fullMatch ? fullMatch[1].trim() : knownMatch[0];
      return;
    }

    // Try "City, State/Province" pattern but ONLY in the header
    const cityStateMatch = line.match(
      /([A-ZÀ-Ú][a-zA-ZÀ-ÿ]+(?:\s[A-ZÀ-Ú][a-zA-ZÀ-ÿ]+)*)\s*,\s*([A-ZÀ-Ú][a-zA-ZÀ-ÿ]+(?:\s[A-ZÀ-Ú][a-zA-ZÀ-ÿ]+)*|[A-Z]{2})\b/
    );
    if (cityStateMatch) {
      const word1 = cityStateMatch[1];
      const word2 = cityStateMatch[2];
      // Must not be tech terms, company names, or person names
      if (
        !TECH_WORDS.test(word1) && !TECH_WORDS.test(word2) &&
        !NOT_A_NAME.test(word1) && !NOT_A_NAME.test(word2) &&
        !/\b(LLP|LLC|LTD|Inc|Corp|Esq)\b/i.test(line) &&
        // At least one part should look like a location (state abbreviation or known name)
        (US_STATES.test(word2) || AR_PROVINCES.test(word1) || AR_PROVINCES.test(word2) || KNOWN_LOCATIONS.test(word1) || KNOWN_LOCATIONS.test(word2))
      ) {
        result.location = cityStateMatch[0];
        return;
      }
    }
  }

  // Strategy 3: Check if there's a standalone known location anywhere in header
  for (const line of resumeHeader) {
    const trimmed = line.trim();
    // Very short lines that are just a location name
    if (trimmed.length < 40 && KNOWN_LOCATIONS.test(trimmed) && !TECH_WORDS.test(trimmed)) {
      // Make sure it's not a person's name or company
      if (!/\b(LLP|LLC|LTD|Inc|Corp)\b/i.test(trimmed)) {
        result.location = trimmed;
        return;
      }
    }
  }
}

/**
 * Find the index of a section heading in lines array.
 */
function findSectionIndex(lines: string[], pattern: RegExp): number {
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i;
  }
  return -1;
}

/**
 * Extract current title and company from lines following the Experience heading.
 *
 * Supports two common formats:
 *
 * Format A (LinkedIn-style):
 *   Company Name
 *   Title
 *   Date range
 *
 * Format B (traditional resume):
 *   COMPANY NAME, City, ST
 *   Title    Date range
 *
 * We detect the format by looking at date patterns and line structure.
 */
function extractCurrentRole(lines: string[], result: Record<string, any>) {
  // Date pattern: matches things like "Jan 2023", "September 2023", "2023", or date ranges
  const datePattern = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b|\b\d{4}\b/i;
  const dateRangePattern = /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\s*[~–—-]\s*(?:Present|\w+\s+\d{4})/i;

  // Common job title keywords to help identify title lines
  const titleKeywords = /\b(partner|associate|counsel|attorney|manager|director|engineer|analyst|consultant|specialist|coordinator|officer|president|vice\s*president|vp|svp|evp|head|lead|senior|junior|principal|intern|fellow|clerk|paralegal)\b/i;

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];

    // Format B: Line contains title keyword AND date on the same line or the line after has a date
    // e.g. "Corporate Associate                 September 2023–Present"
    if (titleKeywords.test(line) && (datePattern.test(line) || dateRangePattern.test(line))) {
      // Title is the part before the date
      const titlePart = line.replace(dateRangePattern, "").replace(datePattern, "").replace(/[–—\-~•,\s]+$/, "").trim();
      if (titlePart) {
        result.currentTitle = titlePart;
        // Company is likely one of the lines above this one (between Experience heading and here)
        for (let j = i - 1; j >= 0; j--) {
          const compLine = lines[j].replace(/,\s*$/, "").trim();
          if (compLine && !SECTION_HEADINGS.test(compLine) && !datePattern.test(compLine)) {
            result.currentCompany = cleanCompanyName(compLine);
            break;
          }
        }
        return;
      }
    }

    // Format A: Title line followed by a date line
    if (titleKeywords.test(line) && !datePattern.test(line)) {
      // Check if next line has a date range
      const nextLine = lines[i + 1] || "";
      if (datePattern.test(nextLine) || dateRangePattern.test(nextLine)) {
        result.currentTitle = line.trim();
        // Company is above
        for (let j = i - 1; j >= 0; j--) {
          const compLine = lines[j].replace(/,\s*$/, "").trim();
          if (compLine && !SECTION_HEADINGS.test(compLine) && !datePattern.test(compLine)) {
            result.currentCompany = cleanCompanyName(compLine);
            break;
          }
        }
        return;
      }
    }
  }

  // Fallback: if we haven't found a title with keywords, take the first non-date,
  // non-section line as company and the next as title (LinkedIn format)
  let companyLine = "";
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    if (SECTION_HEADINGS.test(line)) continue;
    if (!companyLine) {
      if (!datePattern.test(line)) {
        companyLine = line;
      }
      continue;
    }
    // Second non-date line is the title
    if (!datePattern.test(line)) {
      result.currentCompany = cleanCompanyName(companyLine);
      result.currentTitle = line.trim();
      return;
    }
  }
}

// Traditional US resume "role header" — the canonical legal/banking/
// consulting layout where each job stacks like:
//
//   Lewis Brisbois Bisgaard & Smith, LLP – Los Angeles      Mar 2025 – Present
//   Associate Attorney, Full-Time
//   • bullet
//
// Date range on the right anchors the parse. Left of it is "<Company>
// – <Location>" (the dash is a real en-dash in most templates, plain
// hyphen in others). The line immediately below carries the title,
// often suffixed with employment type (", Full-Time" / ", Part-Time").
// We only consume the FIRST matching block so currentTitle / currentCompany
// reflect the most recent role.
function extractTraditionalUSRole(
  expLines: string[],
  result: Record<string, any>,
): boolean {
  const dateRangeRe =
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\s*[–—\-]\s*(Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b/i;

  for (let i = 0; i < Math.min(expLines.length, 30); i++) {
    const line = expLines[i];
    const m = dateRangeRe.exec(line);
    if (!m) continue;
    // Skip bullets — a date range inside a bullet point isn't a job
    // header (e.g. "• Promoted to Senior in Jan 2024").
    if (/^[•·\-*]/.test(line.trim())) continue;

    // Slice off the date range; what's left is "<Company>" or
    // "<Company> – <Location>".
    const leftSide = line
      .slice(0, m.index)
      .replace(/[\s|•·,;:\-–—]+$/, "")
      .trim();
    if (!leftSide || leftSide.length < 3) continue;

    // Try splitting "<Company> – <Location>" on the LAST dash separator.
    // Only treat the right side as a location if it looks like one;
    // otherwise the dash is part of the company name (rare but real).
    let company = leftSide;
    let locationFromHeader = "";
    const sepMatch = leftSide.match(/^(.+?)\s+[–—\-]\s+([^–—\-]+)$/);
    if (sepMatch) {
      const before = sepMatch[1].trim();
      const after = sepMatch[2].trim();
      const looksLikeLocation =
        US_STATES.test(after) ||
        KNOWN_LOCATIONS.test(after) ||
        /^Remote$/i.test(after) ||
        /^[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*(?:\s*&\s*Remote)?$/.test(after);
      if (before && after && looksLikeLocation) {
        company = before;
        locationFromHeader = after.replace(/\s*&\s*Remote$/i, "").trim();
      }
    }

    company = cleanCompanyName(company);
    if (!company || company.length < 3) continue;
    // Long sentences aren't company names — guard against the regex
    // accidentally swallowing a multi-line bullet.
    if (company.split(/\s+/).length > 15) continue;

    // Title sits on the next non-empty, non-bullet line.
    let title = "";
    for (let j = i + 1; j < Math.min(expLines.length, i + 5); j++) {
      const next = expLines[j].trim();
      if (!next) continue;
      if (/^[•·\-*]/.test(next)) break;
      if (SECTION_HEADINGS.test(next)) break;
      // Strip employment-type suffix ("Associate Attorney, Full-Time")
      // and any parenthetical qualifiers ("Law Clerk, Part-Time (2L,
      // 3L)…"). Keep the role itself.
      const stripped = next
        .replace(
          /,\s*(?:Full[-\s]?Time|Part[-\s]?Time|Contract|Contractor|Internship|Intern|Temp(?:orary)?|Permanent|Remote|Freelance|Consultant|Summer)\b.*$/i,
          "",
        )
        .trim();
      if (HAS_DATE.test(stripped)) continue;
      if (stripped.length === 0 || stripped.length > 100) continue;
      title = stripped;
      break;
    }

    if (!title) continue;

    result.currentTitle = title;
    result.currentCompany = company;
    if (locationFromHeader && !result.location) {
      result.location = locationFromHeader;
    }
    return true;
  }
  return false;
}

/**
 * Headline-style role extractor — scans the first ~12 lines of the CV for
 * LinkedIn-style headlines like "System Administrator at Qservices" or
 * "Senior Backend Engineer en Mercado Libre" and fills in currentTitle /
 * currentCompany when we couldn't find them in a proper Experience section.
 */
function extractHeadlineRole(lines: string[], result: Record<string, any>) {
  const headlineRegex = /^(.+?)\s+(?:at|en|@|\-)\s+(.+?)\s*$/i;

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.includes("@")) continue; // likely email
    if (/https?:\/\/|www\.|linkedin\.com/i.test(line)) continue;
    if (SECTION_HEADINGS.test(line)) continue;
    if (HAS_DATE.test(line)) continue;
    if (line.length < 8 || line.length > 110) continue;
    // Skip if the whole line is the candidate name we already captured.
    const fullName = `${result.firstName} ${result.lastName}`.trim().toLowerCase();
    if (fullName && line.toLowerCase() === fullName) continue;

    const m = line.match(headlineRegex);
    if (!m) continue;
    const titlePart = m[1].trim().replace(/[,•|·]+$/, "").trim();
    const companyPart = m[2].trim().replace(/[,•|·].*$/, "").trim();

    // Sanity: both sides non-trivial, title looks like a role (not a sentence),
    // company has letters.
    if (titlePart.length < 3 || titlePart.length > 70) continue;
    if (companyPart.length < 2 || companyPart.length > 70) continue;
    if (!/[a-zA-ZÀ-ÿ]/.test(companyPart)) continue;

    if (!result.currentTitle) result.currentTitle = titlePart;
    if (!result.currentCompany) result.currentCompany = cleanCompanyName(companyPart);
    return;
  }
}

/**
 * Clean up company name: remove trailing location info, fix spacing around suffixes.
 */
function cleanCompanyName(name: string): string {
  // Remove trailing city/state like ", New York, NY"
  let cleaned = name.replace(/,\s*[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}\s*$/, "").trim();
  // Fix names like "DENTONS USLLP" -> "Dentons US LLP" or just clean up
  // Insert space before LLP/LLC/LTD/PC/PLLC if missing
  cleaned = cleaned.replace(/(\w)(LLP|LLC|LTD|PC|PLLC)\b/i, "$1 $2");
  // Remove trailing commas, bullets, pipes
  cleaned = cleaned.replace(/[,|•·]+$/, "").trim();
  return cleaned;
}
