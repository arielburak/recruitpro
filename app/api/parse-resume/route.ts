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

function parseResumeText(text: string, fileName?: string): Record<string, any> {
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
    extractCurrentRole(afterExp, result);
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

/**
 * Multi-strategy name extraction:
 * 1. Try filename (e.g. "CV - Gabriel Fernandez Saiz.pdf")
 * 2. Try LinkedIn slug (e.g. "gabriel-fernandez-saiz")
 * 3. Scan ALL lines for name-like patterns, with strict filtering
 * 4. Use email as validation hint
 */
function extractName(lines: string[], result: Record<string, any>, fileName?: string, linkedInSlug?: string) {
  // Helper: validate a name candidate against email if available
  const email = result.email?.toLowerCase() || "";
  function nameMatchesEmail(first: string, last: string): boolean {
    if (!email) return true; // No email to validate against
    const f = first.toLowerCase();
    const l = last.toLowerCase().replace(/\s+/g, "");
    // Check if email contains parts of the name
    const emailLocal = email.split("@")[0].replace(/[._-]/g, "");
    return emailLocal.includes(f.slice(0, 3)) || emailLocal.includes(l.slice(0, 4));
  }

  // Strategy 1: Extract from filename
  // Patterns: "CV - Name.pdf", "Resume Name.pdf", "CV_Name_Lastname.pdf"
  if (fileName) {
    const baseName = fileName.replace(/\.[^.]+$/, ""); // remove extension
    // Try "CV - Gabriel Fernandez Saiz" or "Resume - John Doe"
    const cvMatch = baseName.match(/(?:cv|resume|curriculum)\s*[-–—_]\s*(.+)/i);
    if (cvMatch) {
      const namePart = cvMatch[1].trim().replace(/[_-]/g, " ");
      const parts = namePart.split(/\s+/).filter((p) => p.length > 1);
      if (parts.length >= 2 && parts.every((p) => /^[A-ZÀ-Ú][a-zA-ZÀ-ÿ.''-]*$/u.test(p))) {
        result.firstName = parts[0];
        result.lastName = parts.slice(1).join(" ");
        if (nameMatchesEmail(result.firstName, result.lastName)) return;
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

    // Skip lines that are clearly not names
    if (line.includes("@")) continue;
    if (/\d{3}.*\d{3}/.test(line)) continue; // phone numbers
    if (/https?:\/\/|www\.|linkedin\.com/i.test(line)) continue;
    if (SECTION_HEADINGS.test(line)) continue;
    if (HAS_DATE.test(line)) continue;
    if (TECH_WORDS.test(line)) continue;
    if (NOT_A_NAME.test(line.replace(/\s+/g, " "))) continue;
    // Skip lines that are all uppercase abbreviations (e.g. "CABA UTN")
    if (/^[A-Z]{2,}\s+[A-Z]{2,}/.test(line) && line.length < 15) continue;
    // Skip lines with numbers (dates, addresses, etc.)
    if (/\d/.test(line)) continue;
    // Skip lines with special characters that aren't in names
    if (/[°#@&%$!?;:(){}[\]\/\\|<>=+*~^]/.test(line)) continue;

    // Clean the line
    const cleaned = line.replace(/['']\d{2}\b/g, "").replace(/[,|•·\-–—]+$/, "").trim();
    if (!cleaned || cleaned.length < 3) continue;

    const nameParts = cleaned.split(/\s+/);
    if (nameParts.length < 1 || nameParts.length > 5) continue;

    // Each part must look like a proper name word (starts uppercase, mixed case, allows accents)
    const allNameLike = nameParts.every((p) =>
      /^[A-ZÀ-Ú][a-zA-ZÀ-ÿ.''-]*\.?$/u.test(p) && p.length >= 2
    );
    if (!allNameLike) continue;

    // Build candidate
    let firstName: string, lastName: string;
    if (nameParts.length === 1) continue; // Single word is not enough

    firstName = nameParts[0];
    lastName = nameParts.slice(1).join(" ");

    // Score the candidate
    let score = 0;
    // Bonus: matches email
    if (nameMatchesEmail(firstName, lastName)) score += 10;
    // Bonus: 2-3 word names are more likely
    if (nameParts.length >= 2 && nameParts.length <= 3) score += 3;
    // Bonus: appears early in the document
    if (i < 15) score += 2;
    // Bonus: not all uppercase (ALL CAPS lines are usually headings)
    if (cleaned !== cleaned.toUpperCase()) score += 2;
    // Bonus: words are 3+ chars each (short abbreviations less likely to be names)
    if (nameParts.every((p) => p.length >= 3)) score += 2;
    // Penalty: line is suspiciously short and ALL CAPS
    if (cleaned === cleaned.toUpperCase() && cleaned.length < 10) score -= 5;

    candidates.push({ firstName, lastName, score, line: cleaned });
  }

  // Also check for two consecutive single-name lines (e.g. "Fernandez Saiz" then "Gabriel Alejandro")
  for (let i = 0; i < lines.length - 1; i++) {
    const line1 = lines[i].trim();
    const line2 = lines[i + 1].trim();

    // Both should be name-like, no numbers, no headings
    if (HAS_DATE.test(line1) || HAS_DATE.test(line2)) continue;
    if (SECTION_HEADINGS.test(line1) || SECTION_HEADINGS.test(line2)) continue;
    if (TECH_WORDS.test(line1) || TECH_WORDS.test(line2)) continue;
    if (/\d/.test(line1) || /\d/.test(line2)) continue;
    if (NOT_A_NAME.test(line1) || NOT_A_NAME.test(line2)) continue;

    const parts1 = line1.split(/\s+/);
    const parts2 = line2.split(/\s+/);
    if (parts1.length < 1 || parts1.length > 3 || parts2.length < 1 || parts2.length > 3) continue;

    const allParts = [...parts1, ...parts2];
    const allNameLike = allParts.every((p) =>
      /^[A-ZÀ-Ú][a-zA-ZÀ-ÿ.''-]*$/u.test(p) && p.length >= 2
    );
    if (!allNameLike) continue;

    // Determine which is first name vs last name
    // Common pattern: "LastName" on line 1, "FirstName" on line 2
    // Or "FirstName" on line 1, "LastName" on line 2
    // Use email to figure out which order
    let firstName = parts2[0]; // Assume line2 = first name (common in LatAm CVs)
    let lastName = parts1.join(" ");

    let score = 5; // Two-line name pattern gets a base bonus
    if (nameMatchesEmail(firstName, lastName)) score += 10;
    // Try the other order
    if (!nameMatchesEmail(firstName, lastName)) {
      firstName = parts1[0];
      lastName = parts2.join(" ");
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
