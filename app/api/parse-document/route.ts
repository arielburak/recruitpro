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
    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    try {
      if (fileName.endsWith(".pdf")) {
        const pdfParse = require("pdf-parse/lib/pdf-parse.js");
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;
      } else if (fileName.endsWith(".docx")) {
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else {
        text = buffer.toString("utf-8");
      }
    } catch (err: any) {
      return NextResponse.json({
        text: "",
        error: err.message || "Failed to extract text",
      });
    }

    return NextResponse.json({ text: text.trim() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
