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

    // Extract text from file
    const text = await file.text();

    // Use a simple heuristic parser (can be enhanced with AI later)
    const parsed = parseResumeText(text);

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function parseResumeText(text: string): Record<string, any> {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

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
  };

  // Extract email
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) result.email = emailMatch[0];

  // Extract phone
  const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) result.phone = phoneMatch[0];

  // Extract LinkedIn
  const linkedInMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
  if (linkedInMatch) result.linkedIn = linkedInMatch[0].startsWith("http") ? linkedInMatch[0] : `https://${linkedInMatch[0]}`;

  // Extract name (usually first non-empty line that's not an email/phone)
  for (const line of lines.slice(0, 5)) {
    if (!line.includes("@") && !line.match(/\d{3}/) && !line.toLowerCase().includes("resume") && !line.toLowerCase().includes("cv")) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2 && parts.length <= 4) {
        result.firstName = parts[0];
        result.lastName = parts.slice(1).join(" ");
        break;
      }
    }
  }

  // Extract location (look for city, state patterns)
  const locationMatch = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),?\s*([A-Z]{2})\b/);
  if (locationMatch) result.location = locationMatch[0];

  // Common skill keywords
  const skillKeywords = [
    "JavaScript", "TypeScript", "Python", "Java", "C\\+\\+", "C#", "Ruby", "Go", "Rust", "Swift", "Kotlin",
    "React", "Angular", "Vue", "Next\\.js", "Node\\.js", "Express", "Django", "Flask", "Spring",
    "AWS", "Azure", "GCP", "Docker", "Kubernetes", "CI/CD", "Git",
    "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "GraphQL", "REST",
    "Machine Learning", "AI", "Data Science", "Deep Learning",
    "Agile", "Scrum", "Project Management", "Leadership",
    "Sales", "Marketing", "Business Development", "Account Management",
    "Finance", "Accounting", "Excel", "PowerPoint", "Salesforce",
  ];

  const foundSkills: string[] = [];
  for (const skill of skillKeywords) {
    const regex = new RegExp(`\\b${skill}\\b`, "i");
    if (regex.test(text)) {
      foundSkills.push(skill.replace(/\\\+/g, "+").replace(/\\\./g, "."));
    }
  }
  result.skills = [...new Set(foundSkills)];

  // Look for title-like patterns near "experience" section
  const expIndex = text.toLowerCase().indexOf("experience");
  if (expIndex > -1) {
    const afterExp = text.slice(expIndex, expIndex + 500);
    const titleLines = afterExp.split("\n").filter(l => l.trim()).slice(1, 4);
    if (titleLines.length > 0) {
      result.currentTitle = titleLines[0].trim().slice(0, 100);
    }
    if (titleLines.length > 1) {
      result.currentCompany = titleLines[1].trim().slice(0, 100);
    }
  }

  // Summary - look for summary/objective section
  const summaryMatch = text.match(/(?:summary|objective|profile|about)\s*[:\n]?\s*([\s\S]{20,500}?)(?:\n\n|\n[A-Z])/i);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim().slice(0, 500);
  }

  return result;
}
