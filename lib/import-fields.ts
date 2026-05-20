// Shared between the import UI and /api/import/bulk so the field
// schema doesn't drift. If you add a new column to the bulk import,
// add it here AND mirror it in FIELD_SPEC on the API route.

export type ImportType = "candidates" | "clients" | "jobs";

export type FieldDef = {
  key: string;
  label: string;
  required?: boolean;
  // Lowercased / normalized header strings the auto-detect should
  // accept as this field. Compared after stripping non-alphanumeric.
  aliases: string[];
  // Short hint shown to the right of the field name in the mapping UI.
  hint?: string;
};

export const IMPORT_FIELDS: Record<ImportType, FieldDef[]> = {
  candidates: [
    { key: "firstName", label: "First name", required: true, aliases: ["firstname", "first", "givenname", "nombre"] },
    { key: "lastName", label: "Last name", required: true, aliases: ["lastname", "last", "surname", "familyname", "apellido"] },
    { key: "email", label: "Email", aliases: ["email", "emailaddress", "mail", "correo"] },
    { key: "phone", label: "Phone", aliases: ["phone", "phonenumber", "mobile", "cell", "telefono", "celular"] },
    { key: "linkedIn", label: "LinkedIn", aliases: ["linkedin", "linkedinurl", "linkedinprofile"] },
    { key: "location", label: "Location", aliases: ["location", "city", "address", "ciudad"] },
    { key: "currentTitle", label: "Current title", aliases: ["title", "currenttitle", "jobtitle", "position", "puesto", "cargo"] },
    { key: "currentCompany", label: "Current company", aliases: ["company", "currentcompany", "employer", "empresa"] },
    { key: "source", label: "Source", aliases: ["source", "origin", "channel"], hint: "Defaults to 'Import'" },
    { key: "summary", label: "Summary / notes", aliases: ["summary", "notes", "bio", "about", "comments", "resumen"] },
    { key: "skills", label: "Skills", aliases: ["skills", "tags", "tech", "stack", "habilidades"], hint: "Comma, semicolon, or pipe separated" },
  ],
  clients: [
    { key: "name", label: "Company name", required: true, aliases: ["name", "companyname", "client", "clientname", "empresa"] },
    { key: "industry", label: "Industry", aliases: ["industry", "sector", "vertical"] },
    { key: "website", label: "Website", aliases: ["website", "url", "site", "domain"] },
    { key: "contactName", label: "Main contact name", aliases: ["contactname", "contact", "primarycontact"] },
    { key: "contactEmail", label: "Main contact email", aliases: ["contactemail", "email"] },
    { key: "contactPhone", label: "Main contact phone", aliases: ["contactphone", "phone"] },
    { key: "notes", label: "Notes", aliases: ["notes", "comments", "about"] },
  ],
  jobs: [
    { key: "title", label: "Job title", required: true, aliases: ["title", "jobtitle", "position", "role"] },
    { key: "client", label: "Client (company name)", aliases: ["client", "clientname", "company", "companyname"], hint: "Matched by name; created if not found" },
    { key: "description", label: "Description", aliases: ["description", "jd", "summary"] },
    { key: "salary", label: "Salary", aliases: ["salary", "compensation", "pay", "salaryrange"] },
    { key: "location", label: "Location", aliases: ["location", "city", "address"] },
  ],
};

// Normalize a header for fuzzy auto-detect: lowercase + strip
// anything that isn't a-z0-9. So "First Name" / "first_name" /
// "first-name" / "FIRST_NAME" all collapse to "firstname".
export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Best-effort initial mapping: for each ATS field, find a header
// whose normalized form matches one of the field's aliases. Returns
// { atsField: header | null }.
export function autoDetectMapping(
  type: ImportType,
  headers: string[]
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  for (const field of IMPORT_FIELDS[type]) {
    const hit = normalizedHeaders.find((nh) =>
      field.aliases.some((a) => nh.norm === a || nh.norm.includes(a) || a.includes(nh.norm))
    );
    result[field.key] = hit?.raw || null;
  }
  return result;
}
