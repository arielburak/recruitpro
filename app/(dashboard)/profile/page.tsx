import { redirect } from "next/navigation";

// Legacy URL — keep it alive so old email links and bookmarks still work.
export default function LegacyProfileRedirect() {
  redirect("/settings/profile");
}
