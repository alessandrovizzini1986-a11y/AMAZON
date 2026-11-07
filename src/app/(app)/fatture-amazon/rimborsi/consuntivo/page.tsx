import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ConsuntivoClient } from "./ConsuntivoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consuntivo contabile — FleetDSP" };

export default async function ConsuntivoPage() {
  const user = await requireUser();
  if (!can(user, "import.run")) redirect("/fatture-amazon/rimborsi");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Amazon · Rimborsi" title="Consuntivo contabile"
        subtitle="I costi registrati in contabilità per carburante, pedaggi e parcheggi (CDC 5569). Dove ci sono, nei Rimborsi valgono al posto dei costi stimati da Q8, Telepass e Parametri." />
      <Link href="/fatture-amazon/rimborsi" className="text-sm text-brand underline">← Torna ai Rimborsi</Link>
      <ConsuntivoClient />
    </div>
  );
}
