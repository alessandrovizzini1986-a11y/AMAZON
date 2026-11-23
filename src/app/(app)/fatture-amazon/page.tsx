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
  const [{ ultimo, prossimo }, tot, righe] = await Promise.all([
    statoNumeri(),
    db.amazonInvoice.count().catch(() => 0),
    db.amazonInvoiceLine.count().catch(() => 0),
  ]);
  const annoOra = new Date().getFullYear();
  const card = (l: string, v: string, href: string, warn = false) => (
    <Link href={href} className={`card p-4 hover:border-brand ${warn ? "border-warn bg-warn-soft" : ""}`}>
      <div className="text-sm font-medium text-ink-muted">{l}</div>
      <div className={`text-2xl font-bold ${warn ? "text-warn" : ""}`}>{v}</div>
    </Link>
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Amazon" title="Fatture"
        subtitle="Ogni lunedì: scarica i PDF della settimana e trascinali in Importa. Le righe restano sul sito: non devi più ricaricare il tuo file. Se ti serve il file aggiornato, scaricalo da qui sotto." />
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {card("Ultima fattura registrata", ultimo ?? "nessuna", "/fatture-amazon/registro")}
        {card("Prossimo numero da scaricare", prossimo !== null ? String(prossimo) : "—", "/fatture-amazon/importa")}
        {card("Fatture nel registro / righe", `${tot.toLocaleString("it-IT")} / ${righe.toLocaleString("it-IT")}`, "/fatture-amazon/registro")}
      </section>
      <section className="card flex flex-col gap-3 p-4 md:p-5">
        <h2 className="text-[19px] font-semibold">File completo delle fatture</h2>
        <p className="text-sm text-ink-muted">Un Excel con tutte le fatture dell&apos;anno e tutte le righe, nelle 16 colonne di fatt_AAAA: è lo stesso contenuto del tuo file, sempre aggiornato all&apos;ultima importazione. Dentro ci sono anche l&apos;elenco delle fatture e, a parte, le righe di servizi dell&apos;anno prima fatturati quest&apos;anno.</p>
        <div className="flex flex-wrap gap-3">
          {[annoOra, annoOra - 1].map((a) => <a key={a} className={`btn ${a === annoOra ? "btn-primary" : ""}`} href={`/api/fatture/completo?anno=${a}`}>Scarica il file completo {a}</a>)}
        </div>
      </section>
    </div>
  );
}
