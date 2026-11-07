import Link from "next/link";
import { SchedePagina } from "@/components/SchedePagina";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { LISTINI, migliorPerClasse, type Classe } from "@/content/listiniNoleggio";

export const dynamic = "force-dynamic";

const eur = (x: number) => x.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const it = (s: string) => s.split("-").reverse().join("/");
const CLASSI: Classe[] = ["SMALL", "MEDIUM", "LARGE", "XL", "MOTRICE"];

export default async function ListiniPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireUser();
  if (!can(user, "vehicle.manage")) redirect("/vehicles");
  const { f } = await searchParams;
  const oggi = new Date().toISOString().slice(0, 10);
  const best = migliorPerClasse(oggi);
  const listini = f ? LISTINI.filter((l) => l.id === f) : LISTINI;
  // canone medio attuale per società (mezzi non dismessi con canone)
  const medie = await db.vehicle.groupBy({ by: ["leasingCompany", "tipoContratto"], where: { stato: { in: ["ATTIVO", "IN_OFFICINA", "UFFICIO"] }, canoneMese: { gt: 0 } }, _avg: { canoneMese: true }, _count: { _all: true } });
  const chip = (on: boolean) => `inline-flex h-10 items-center rounded-full border px-3.5 text-sm font-semibold ${on ? "border-brand bg-brand text-white" : "border-[#d5dbe3] bg-surface-raised text-ink hover:border-brand"}`;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Flotta" title="Listini noleggiatori" subtitle="€/mese per 30 giorni, IVA esclusa. Per confrontare un preventivo o un canone fatturato." action={<Link href="/vehicles" className="btn-secondary">← Flotta</Link>} />
      <SchedePagina schede={[{ id: "confronto", label: "Miglior prezzo e canone medio" }, { id: "listini", label: "Listini per fornitore" }]} />
      <section data-scheda="confronto" className="card p-4 md:p-5">
        <h2 className="mb-2 text-[19px] font-semibold">Miglior prezzo per classe</h2>
        <p className="mb-3 text-sm text-ink-muted">Solo listini validi oggi, esclusi quelli da usare solo nei picchi (Nolo Experience).</p>
        <div className="overflow-x-auto"><table className="table-base text-sm">
          <thead><tr><th>Classe</th><th>Fornitore</th><th>Gruppo</th><th>Modello</th><th className="text-right">€/mese</th></tr></thead>
          <tbody>{CLASSI.filter((c) => best[c]).map((c) => <tr key={c}><td className="font-semibold">{c}</td><td>{best[c]!.fornitore}</td><td className="font-mono">{best[c]!.gruppo}</td><td>{best[c]!.modello}</td><td className="text-right font-mono">{eur(best[c]!.eurMese)}</td></tr>)}</tbody>
        </table></div>
      </section>
      <div data-scheda="listini" className="flex flex-wrap gap-2">
        <Link href="/vehicles/listini?sezione=listini" className={chip(!f)}>Tutti</Link>
        {LISTINI.map((l) => <Link key={l.id} href={`/vehicles/listini?f=${l.id}&sezione=listini`} className={chip(f === l.id)}>{l.fornitore}{l.id === "amicoblu-elettrico" ? " elettrico" : ""}</Link>)}
      </div>
      {listini.map((l) => {
        const scaduto = !!l.validoAl && l.validoAl < oggi;
        return (
          <details key={l.id} data-scheda="listini" open={!!f} className="card p-4 md:p-5">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[19px] font-semibold"><span aria-hidden className="mr-1 text-brand">▸</span>{l.fornitore}: {l.titolo}</h2>
              <span className={scaduto ? "badge-danger" : "badge-ok"}>{scaduto ? `scaduto il ${it(l.validoAl!)}` : l.validoAl ? `valido fino al ${it(l.validoAl)}` : `del ${it(l.data)}`}</span>
            </summary>
            <p className="mt-1 text-sm">{l.uso}</p>
            {l.condizioni.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-ink-muted">{l.condizioni.map((c) => <li key={c}>{c}</li>)}</ul>}
            <div className="mt-3 overflow-x-auto"><table className="table-base text-sm">
              <thead><tr><th>Gruppo</th><th>Modello</th><th>Classe</th><th className="text-right">€/mese</th><th className="text-right">€/km extra</th><th className="text-right">Franchigia danni</th><th className="text-right">Franchigia furto</th><th>Note</th></tr></thead>
              <tbody>{l.voci.map((v) => { const top = best[v.classe]?.eurMese === v.eurMese && best[v.classe]?.fornitore === l.fornitore; return (
                <tr key={v.gruppo + v.modello} className={top ? "bg-ok-soft" : ""}><td className="font-mono">{v.gruppo}</td><td>{v.modello}</td><td>{v.classe}</td><td className="text-right font-mono">{eur(v.eurMese)}</td><td className="text-right font-mono">{v.kmExtra?.toLocaleString("it-IT") ?? ""}</td><td className="text-right font-mono">{v.franchigiaDanni ? eur(v.franchigiaDanni) : ""}</td><td className="text-right font-mono">{v.franchigiaFurto ? eur(v.franchigiaFurto) : ""}</td><td className="text-xs">{[v.kmInclusi, v.note].filter(Boolean).join(" · ")}</td></tr>); })}</tbody>
            </table></div>
            <p className="mt-2 text-xs text-ink-muted">Fonte: {l.fonte}</p>
          </details>
        );
      })}
      <section data-scheda="confronto" className="card p-4 md:p-5">
        <h2 className="mb-2 text-[19px] font-semibold">Canone medio della flotta oggi</h2>
        <p className="mb-3 text-sm text-ink-muted">Mezzi attivi con canone, per società e tipo di contratto: il canone viene dalle fatture o dalla Lista Targhe.</p>
        <div className="overflow-x-auto"><table className="table-base text-sm">
          <thead><tr><th>Società</th><th>Contratto</th><th className="text-right">Mezzi</th><th className="text-right">Canone medio €/mese</th></tr></thead>
          <tbody>{medie.sort((a, b) => b._count._all - a._count._all).map((m) => <tr key={`${m.leasingCompany}|${m.tipoContratto}`}><td>{m.leasingCompany ?? "—"}</td><td>{m.tipoContratto ?? "—"}</td><td className="text-right font-mono">{m._count._all}</td><td className="text-right font-mono">{eur(Math.round(Number(m._avg.canoneMese ?? 0)))}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}
