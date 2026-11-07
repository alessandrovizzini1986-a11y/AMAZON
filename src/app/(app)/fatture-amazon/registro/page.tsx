import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { utenteCon } from "../dati";
import { annullaEsportazione } from "./actions";
import { Aiuto } from "@/components/Aiuto";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registro fatture Amazon — FleetDSP" };

const STATI = { tutte: "Tutte", esportata: "Esportate", presente: "Presenti in fatt_2026", entrambi: "Esportate e presenti", "da-incollare": "Esportate ma non in fatt_2026" } as const;
const eur = (x: unknown) => Number(x).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gg = (d: Date | null) => (d ? d.toLocaleDateString("it-IT", { timeZone: "UTC" }) : "—");

export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ ds?: string; da?: string; a?: string; stato?: string; q?: string }> }) {
  const user = await utenteCon("fatture.registro");
  const p = await searchParams;
  const stato = (p.stato && p.stato in STATI ? p.stato : "tutte") as keyof typeof STATI;
  const where: Prisma.AmazonInvoiceWhereInput = {
    ...(p.ds ? { ds: p.ds } : {}),
    ...(p.q ? { numero: { contains: p.q.trim().toUpperCase() } } : {}),
    ...(p.da || p.a ? { periodoA: { ...(p.da ? { gte: new Date(p.da + "T00:00:00Z") } : {}), ...(p.a ? { lte: new Date(p.a + "T00:00:00Z") } : {}) } } : {}),
    ...(stato === "esportata" ? { esportataIl: { not: null } } : stato === "presente" ? { presenteInFatt2026Il: { not: null } } : stato === "entrambi" ? { esportataIl: { not: null }, presenteInFatt2026Il: { not: null } } : stato === "da-incollare" ? { esportataIl: { not: null }, presenteInFatt2026Il: null } : {}),
  };
  const [fatture, n, dsList, daIncollare] = await Promise.all([
    db.amazonInvoice.findMany({ where, orderBy: { numero: "desc" }, take: 500 }),
    db.amazonInvoice.count({ where }),
    db.amazonInvoice.findMany({ distinct: ["ds"], select: { ds: true }, orderBy: { ds: "asc" } }),
    db.amazonInvoice.count({ where: { esportataIl: { not: null }, presenteInFatt2026Il: null } }),
  ]);
  const puoAnnullare = can(user, "fatture.annulla");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Amazon · registro" title="Registro delle fatture"
        subtitle="Tutte le fatture conosciute dal sito: quelle esportate da Importa e quelle trovate in fatt_2026 con l'allineamento." />
      {daIncollare > 0 && stato !== "da-incollare" && (
        <Link href="/fatture-amazon/registro?stato=da-incollare" className="rounded-control bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">
          {daIncollare} fatture esportate ma non ancora viste in fatt_2026: scaricate ma non incollate? Mostra l&apos;elenco →
        </Link>
      )}
      <form className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Numero<input name="q" defaultValue={p.q ?? ""} className="input h-10 w-44" placeholder="es. 2543" /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">DS
          <select name="ds" defaultValue={p.ds ?? ""} className="input h-10 w-32"><option value="">Tutte</option>{dsList.map((d) => <option key={d.ds}>{d.ds}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Periodo dal<input type="date" name="da" defaultValue={p.da ?? ""} className="input h-10 w-40" /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">al<input type="date" name="a" defaultValue={p.a ?? ""} className="input h-10 w-40" /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Stato
          <select name="stato" defaultValue={stato} className="input h-10 w-56">{Object.entries(STATI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <button className="btn-primary h-10">Filtra</button> <Aiuto k="fatture.annulla" />
      </form>
      <section className="card overflow-x-auto p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">{n.toLocaleString("it-IT")} fatture{n > 500 ? " (prime 500)" : ""}</h2>
        <table className="table-base text-sm">
          <thead><tr><th>Numero</th><th>DS</th><th>Tipo</th><th>Data fattura</th><th>Periodo</th><th className="text-right">Importo</th><th className="text-right">AVERE</th><th>Righe</th><th>Fonte</th><th>Esportata</th><th>In fatt_2026</th>{puoAnnullare && <th></th>}</tr></thead>
          <tbody>
            {fatture.map((f) => (
              <tr key={f.id}>
                <td className="font-mono text-xs">{f.numero}</td><td className="font-mono">{f.ds}</td><td>{f.tipo}</td><td>{gg(f.dataFattura)}</td>
                <td className="whitespace-nowrap">{gg(f.periodoDa)} – {gg(f.periodoA)}</td><td className="text-right font-mono">{eur(f.importoDovuto)}</td><td className="text-right font-mono">{eur(f.sommaAvere)}</td>
                <td>{f.nRighe}</td><td>{f.fonte}</td>
                <td>{f.esportataIl ? <span className="badge-ok">{gg(f.esportataIl)}</span> : ""}</td>
                <td>{f.presenteInFatt2026Il ? <span className="badge-ok">sì</span> : f.esportataIl ? <span className="badge-warn">non ancora</span> : ""}</td>
                {puoAnnullare && <td>{f.esportataIl && <form action={annullaEsportazione.bind(null, f.numero)}><button className="btn-secondary px-2 py-1 text-xs">Annulla esportazione</button></form>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
