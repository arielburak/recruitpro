import { NextResponse } from "next/server";

// Pipeline moves are agency-driven for MVP. The client portal is
// read-only when it comes to where a candidate sits in the search —
// the recruiting firm owns that workflow, the client sees the result.
// Kept as a 403 stub (rather than deleted outright) so any cached UI
// that still calls this endpoint sees a clear, intentional refusal
// instead of a generic 404.
export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "Pipeline stages are managed by your recruiting firm. Ask them to move the candidate forward.",
    },
    { status: 403 }
  );
}
