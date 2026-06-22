import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import { getOrgContextWithActiveSub, subscriptionErrorResponse } from "@/lib/require-active-sub";
import { parseDocumentBuffer } from "@/lib/parse-document";
import { extractJobFields } from "@/lib/extract-job-fields";
import { safeErrorMessage } from "@/lib/safe-error";

export async function POST(request: Request) {
  try {
    await getOrgContextWithActiveSub(); // Auth check

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    try {
      const formatted = await parseDocumentBuffer(buffer, file.name);
      // Pass the filename — JDs are typically named like
      // "Customer Support - Morabits.pdf" and the leading segment is
      // the strongest title signal we have when the body starts with
      // "About the company…" filler.
      const fields = extractJobFields(formatted, file.name);
      return NextResponse.json({ text: formatted, fields });
    } catch (err: any) {
      return NextResponse.json({
        text: "",
        error: err.message || "Failed to extract text",
      });
    }
  } catch (error: any) {
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
