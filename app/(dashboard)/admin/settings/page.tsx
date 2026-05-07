import { redirect } from "next/navigation";
export default function LegacyOrgSettingsRedirect() {
  redirect("/settings/organization");
}
