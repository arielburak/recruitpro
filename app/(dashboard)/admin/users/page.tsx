import { redirect } from "next/navigation";
export default function LegacyTeamRedirect() {
  redirect("/settings/team");
}
