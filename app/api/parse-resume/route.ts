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
      const pdfParse = require("pdf-parse");
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } else {
      // .txt, .docx, or other text-based formats
      text = await file.text();
    }

    const parsed = parseResumeText(text);

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Section heading patterns used to avoid misidentifying headings as names
const SECTION_HEADINGS = /^(experience|education|skills|summary|objective|profile|about|qualifications|certifications?|awards?|publications?|references?|interests?|activities|projects?|work\s*history|professional|bar\s*admissions?|practice\s*areas?|specialties|biography)\b/i;

function parseResumeText(text: string): Record<string, any> {
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
  // Handles: (786) 307-5853, 213 533 5941, 213-533-5941, +1 213.533.5941, etc.
  const phoneMatch = text.match(
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\s*\d{3}[-.\s]?\s*\d{4}/
  );
  if (phoneMatch) result.phone = phoneMatch[0].trim();

  // --- LinkedIn ---
  const linkedInMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i
  );
  if (linkedInMatch) {
    result.linkedIn = linkedInMatch[0].startsWith("http")
      ? linkedInMatch[0]
      : `https://${linkedInMatch[0]}`;
  }

  // --- Name ---
  // Look at the first several lines for something that looks like a person's name
  for (const line of lines.slice(0, 8)) {
    // Skip lines with emails, phone numbers, URLs, or section headings
    if (line.includes("@")) continue;
    if (/\d{3}.*\d{3}.*\d{4}/.test(line)) continue;
    if (/https?:\/\/|www\.|linkedin\.com/i.test(line)) continue;
    if (SECTION_HEADINGS.test(line)) continue;
    // Skip lines that look like addresses (contain zip codes or street indicators)
    if (/\b\d{5}\b/.test(line) && /\b(st|ave|blvd|rd|dr|apt|apartment|suite)\b/i.test(line)) continue;

    // Strip common suffixes like class year markers ('11, '15) or trailing punctuation
    const cleaned = line.replace(/['']\d{2}\b/g, "").replace(/[,|•·\-–—]+$/, "").trim();

    // A name is typically 2-4 capitalized words, possibly with a middle initial (single letter + period)
    const nameParts = cleaned.split(/\s+/);
    if (
      nameParts.length >= 2 &&
      nameParts.length <= 4 &&
      nameParts.every((p) => /^[A-Z][a-zA-Z.''-]*\.?$/.test(p))
    ) {
      result.firstName = nameParts[0];
      result.lastName = nameParts.slice(1).join(" ");
      break;
    }
  }

  // --- Location ---
  // Search line-by-line for location patterns to avoid cross-line matches
  for (const line of lines) {
    // Try full address line first (e.g., "34 Morton St, Apartment 3A, New York, NY 10014")
    const fullAddressMatch = line.match(
      /\d+\s+[\w\s]+(?:St|Ave|Blvd|Rd|Dr|Lane|Way|Ct|Pl|Circle|Drive|Street|Avenue|Boulevard|Road|Apartment|Apt\.?)[^•]*,\s*([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\s*\d{5}/i
    );
    if (fullAddressMatch) {
      result.location = `${fullAddressMatch[1].trim()}, ${fullAddressMatch[2]}`;
      break;
    }
    // Try "City, State" or "City, ST" patterns on the same line
    const locationMatch = line.match(
      /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*),\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)*|[A-Z]{2})\b/
    );
    if (locationMatch) {
      const candidate = locationMatch[0];
      if (!SECTION_HEADINGS.test(candidate) && !/\b(LLP|LLC|LTD|Inc|Corp)\b/i.test(line)) {
        result.location = candidate;
        break;
      }
    }
  }

  // --- Current Title & Company ---
  // Find the Experience section and extract the first job entry
  const expSectionIndex = findSectionIndex(lines, /^experience\b/i);
  if (expSectionIndex >= 0) {
    const afterExp = lines.slice(expSectionIndex + 1);
    extractCurrentRole(afterExp, result);
  }

  // --- Skills ---
  const skillKeywords = [
    // Programming & Tech
    "JavaScript", "TypeScript", "Python", "Java", "C\\+\\+", "C#", "Ruby", "Go", "Rust", "Swift", "Kotlin",
    "React", "Angular", "Vue", "Next\\.js", "Node\\.js", "Express", "Django", "Flask", "Spring",
    "AWS", "Azure", "GCP", "Docker", "Kubernetes", "CI/CD", "Git",
    "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "GraphQL", "REST",
    "Machine Learning", "AI", "Data Science", "Deep Learning",
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
  const eduIndex = findSectionIndex(lines, /^education\b/i);
  if (eduIndex >= 0) {
    const schools: string[] = [];
    for (let i = eduIndex + 1; i < lines.length; i++) {
      if (SECTION_HEADINGS.test(lines[i]) && !/^education/i.test(lines[i])) break;
      // School names often contain "University", "College", "School", "Institute"
      if (/university|college|school|institute/i.test(lines[i])) {
        schools.push(lines[i]);
      }
    }
    result.education = schools;
  }

  // Also check for "Law School" / "Undergraduate" labeled lines (LinkedIn resume format)
  if (result.education.length === 0) {
    const lawSchoolIdx = findSectionIndex(lines, /^law\s*school\b/i);
    const undergradIdx = findSectionIndex(lines, /^undergraduate\b/i);
    const schools: string[] = [];
    if (lawSchoolIdx >= 0 && lines[lawSchoolIdx + 1]) {
      schools.push(lines[lawSchoolIdx + 1]);
    }
    if (undergradIdx >= 0 && lines[undergradIdx + 1]) {
      schools.push(lines[undergradIdx + 1]);
    }
    if (schools.length > 0) result.education = schools;
  }

  return result;
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
