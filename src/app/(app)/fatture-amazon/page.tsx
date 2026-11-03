import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { statoNumeri } from "./dati";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fatture Amazon — FleetDSP" };

export default async function FatturePage() {
  const user = await requireUser();
  if (!can(user, "fatture.registro")) redirect(can(user, "fatturato.view") ? "/fatture-amazon/fatturato" : "/");
  const [{ ultimo, prossimo }, tot, daIncollare, righe] = await Promise.all([
    statoNumeri(),
    db.amazonInvoice.count().catch(() => 0),
    db.amazonInvoice.count({ where: { esportataIl: { not: null }, presenteInFatt2026Il: null } }).catch(() => 0),
    db.amazonInvoiceLine.count().catch(() => 0),
  ]);
  const card = (l: string, v: string, href: string, warn = false) => (
    <Link href={href} className={`card p-4 hover:border-brand ${warn ? "border-warn bg-warn-soft" : ""}`}>
      <div className="text-sm font-medium text-ink-muted">{l}</div>
      <div className={`text-2xl font-bold ${warn ? "text-warn" : ""}`}>{v}</div>
    </Link>
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Fatture Amazon" title="Fatture Amazon"
        subtitle="Ogni lunedì: scarica i PDF della settimana, trascinali in Importa, scarica l'Excel (o copia le righe) e incollale in fondo a fatt_2026. Il registro evita di inserire due volte la stessa fattura." />
      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {card("Ultima fattura registrata", ultimo ?? "nessuna", "/fatture-amazon/registro")}
        {card("Prossimo numero da scaricare", prossimo !== null ? String(prossimo) : "—", "/fatture-amazon/importa")}
        {card("Esportate ma non ancora in fatt_2026", String(daIncollare), "/fatture-amazon/registro?stato=da-incollare", daIncollare > 0)}
        {card("Fatture nel registro / righe", `${tot.toLocaleString("it-IT")} / ${righe.toLocaleString("it-IT")}`, "/fatture-amazon/registro")}
      </section>
    </div>
  );
}
