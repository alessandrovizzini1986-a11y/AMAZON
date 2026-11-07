import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { paginaIniziale } from "@/components/navModel";

export default async function Home() {
  const user = await requireUser();
  redirect(paginaIniziale(user.role));
}
