import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import { parseDocumentBuffer } from "@/lib/parse-document";
import { extractJobFields } from "@/lib/extract-job-fields";

export async function POST(request: Request) {
  try {
    await getOrgContext(); // Auth check

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    try {
      const formatted = await parseDocumentBuffer(buffer, file.name);
      const fields = extractJobFields(formatted);
      return NextResponse.json({ text: formatted, fields });
    } catch (err: any) {
      return NextResponse.json({
        text: "",
        error: err.message || "Failed to extract text",
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
