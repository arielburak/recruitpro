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
    { key: "firstName", label: "First name", required: true, aliases: ["firstname", "first", "givenname", "nombre", "prenom", "vorname"] },
    { key: "lastName", label: "Last name", required: true, aliases: ["lastname", "last", "surname", "familyname", "apellido", "nomdefamille"] },
    { key: "email", label: "Email", aliases: ["email", "emailaddress", "mail", "correo", "email1", "primaryemail", "correoelectronico"] },
    { key: "phone", label: "Phone", aliases: ["phone", "phonenumber", "mobile", "cell", "telefono", "celular", "phonecell", "phonehome", "phone1"] },
    { key: "linkedIn", label: "LinkedIn", aliases: ["linkedin", "linkedinurl", "linkedinprofile", "website", "websiteurl"] },
    { key: "location", label: "Location", aliases: ["location", "city", "address", "ciudad", "ubicacion", "where"] },
    { key: "currentTitle", label: "Current title", aliases: ["title", "currenttitle", "jobtitle", "position", "puesto", "cargo", "role"] },
    { key: "currentCompany", label: "Current company", aliases: ["company", "currentcompany", "employer", "empresa", "currentemployer", "organisation", "organization"] },
    { key: "source", label: "Source", aliases: ["source", "origin", "channel", "fuente", "origen"], hint: "Defaults to 'Import'" },
    { key: "summary", label: "Summary / notes", aliases: ["summary", "notes", "bio", "about", "comments", "resumen", "observaciones", "remarks"] },
    { key: "skills", label: "Skills", aliases: ["skills", "tags", "tech", "stack", "habilidades", "keyskills", "technologies", "techstack"], hint: "Comma, semicolon, or pipe separated" },
  ],
  clients: [
    { key: "name", label: "Company name", required: true, aliases: ["name", "companyname", "client", "clientname", "empresa", "company", "razonsocial"] },
    { key: "industry", label: "Industry", aliases: ["industry", "sector", "vertical", "industria", "rubro", "keytechnologies"] },
    { key: "website", label: "Website", aliases: ["website", "url", "site", "domain", "web", "weburl"] },
    { key: "contactName", label: "Main contact name", aliases: ["contactname", "contact", "primarycontact", "contacto", "billingcontact"] },
    { key: "contactEmail", label: "Main contact email", aliases: ["contactemail", "email", "correo"] },
    { key: "contactPhone", label: "Main contact phone", aliases: ["contactphone", "phone", "telefono", "phone1", "phone2"] },
    { key: "notes", label: "Notes", aliases: ["notes", "comments", "about", "observaciones", "remarks"] },
  ],
  jobs: [
    { key: "title", label: "Job title", required: true, aliases: ["title", "jobtitle", "position", "role", "puesto"] },
    { key: "client", label: "Client (company name)", aliases: ["client", "clientname", "company", "companyname", "empresa"], hint: "Matched by name; created if not found" },
    { key: "description", label: "Description", aliases: ["description", "jd", "summary", "descripcion", "details"] },
    { key: "salary", label: "Salary", aliases: ["salary", "compensation", "pay", "salaryrange", "rate", "ratemax", "sueldo"] },
    { key: "location", label: "Location", aliases: ["location", "city", "address", "ubicacion"] },
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

// Score how confidently a sheet matches a given entity type by
// counting how many required + optional fields auto-detect can fill.
// Used to label each tab of a multi-sheet workbook so the user
// doesn't have to manually pick "this sheet is Candidates" 3 times.
export function detectSheetType(
  sheetName: string,
  headers: string[]
): { type: ImportType; confidence: number } {
  // 1. Sheet name hints — high signal when present.
  const norm = normalizeHeader(sheetName);
  const nameHints: Record<ImportType, string[]> = {
    candidates: ["candidates", "candidate", "people", "talent", "personas", "candidatos"],
    clients: ["clients", "client", "companies", "company", "accounts", "empresas", "clientes"],
    jobs: ["jobs", "job", "joborders", "joborder", "positions", "searches", "vacantes", "busquedas"],
  };

  // 2. Header coverage — how many fields auto-detect would fill.
  const scores: { type: ImportType; score: number }[] = (["candidates", "clients", "jobs"] as ImportType[]).map(
    (t) => {
      const mapping = autoDetectMapping(t, headers);
      const filled = Object.values(mapping).filter(Boolean).length;
      const requiredHit = IMPORT_FIELDS[t]
        .filter((f) => f.required)
        .every((f) => mapping[f.key]);
      const nameHint = nameHints[t].some((h) => norm.includes(h));
      // Weight required-fields-present heavily so a sheet missing
      // 'firstName + lastName' can't accidentally win the candidates
      // label even if it has 'email' and 'phone'.
      return {
        type: t,
        score: filled + (requiredHit ? 5 : 0) + (nameHint ? 10 : 0),
      };
    }
  );

  scores.sort((a, b) => b.score - a.score);
  return { type: scores[0].type, confidence: scores[0].score };
}
