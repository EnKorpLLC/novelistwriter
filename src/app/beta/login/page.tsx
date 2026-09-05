import { redirect } from "next/navigation";

export default function BetaLoginRedirect() {
  redirect("/login?next=/beta/dashboard");
}
