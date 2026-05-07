import { redirect } from "next/navigation";

// /settings with no tab lands on Profile — everyone has access.
export default function SettingsIndex() {
  redirect("/settings/profile");
}
