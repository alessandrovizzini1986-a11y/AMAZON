import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { feriePerStation, orePerStation, ultimiRatei, type Gruppo, type TipoAddebito, type OrePersona, type RateiPersona } from "@/domain/personale/buste";
import { BusteClient, type DatiBuste } from "./BusteClient";
import { Incroci } from "./Incroci";
import { Confronto } from "./Confronto";
import { datiConfronto, stimeSaldi } from "@/lib/personale/confronto";
import { incrociOrganico } from "@/lib/personale/organico";

export const dynamic = "force-dynamic";

export default async function PersonaleBustePage({ searchParams }: { searchParams: Promise<{ cliente?: string; confronto?: string }> }) {
  await requireSuperAdmin();
  const q = await searchParams;
  const gls = q.cliente === "gls", dove = gls ? "GLS" : { not: "GLS" };
  const confronto = gls ? null : await datiConfronto(q.confronto);
  const [incroci, tot, voci, ore, ratei, rotte, addebiti] = await Promise.all([
    gls ? Promise.resolve(null) : incrociOrganico(),
    db.personaleBustaMese.findMany({ where: { station: dove }, orderBy: [{ mese: "asc" }, { station: "asc" }] }),
    db.personaleBustaVoce.findMany({ where: { station: dove } }),
    db.personaleOrePersona.findMany({ where: { station: dove }, select: { mese: true, station: true, gruppo: true, codice: true, nome: true, qualifica: true, oreLav: true, ggLav: true, oreStr: true, oreMagg: true } }),
    db.personaleRateiPersona.findMany({ where: { station: dove } }),
    db.personaleMese.findMany({ where: { station: dove }, select: { mese: true, station: true, gruppo: true, rotte: true } }),
    db.personaleAddebito.findMany({ where: { station: dove }, orderBy: { mese: "asc" } }),
  ]);
  const o = ore as OrePersona[];
  const r = ratei.map((x) => ({ ...x, gruppo: x.gruppo as Gruppo, ferieUnita: x.ferieUnita as "GG" | "ORE" })) as RateiPersona[];
  const ultime = ultimiRatei(r);
  const stime = await stimeSaldi(ultime);
  const dati: DatiBuste = {
    totali: tot.map((t) => ({ ...t, gruppo: t.gruppo as Gruppo })),
    voci: voci.map((v) => ({ ...v, gruppo: v.gruppo as Gruppo })),
    oreStation: orePerStation(o),
    oreStr: o.filter((x) => x.oreStr > 0).map((x) => ({ mese: x.mese, station: x.station, gruppo: x.gruppo, codice: x.codice, nome: x.nome, oreLav: x.oreLav, oreStr: x.oreStr })),
    ferieStation: feriePerStation(r),
    stime,
    ferieUltime: ultime.map((x) => ({ mese: x.mese, station: x.station, gruppo: x.gruppo, codice: x.codice, nome: x.nome, qualifica: x.qualifica, ferieUnita: x.ferieUnita, ferieSaldo: x.ferieSaldo, ferieMatur: x.ferieMatur, ferieGoduto: x.ferieGoduto, rolSaldo: x.rolSaldo, exfestSaldo: x.exfestSaldo })),
    addebiti: addebiti.map((a) => ({ mese: a.mese, station: a.station, gruppo: a.gruppo as Gruppo, codice: a.codice, nome: a.nome, tipo: a.tipo as TipoAddebito, voce: a.voce, importo: a.importo })),
    rotte: rotte.filter((x) => x.rotte !== null).map((x) => ({ mese: x.mese, station: x.station, gruppo: x.gruppo as Gruppo, rotte: x.rotte! })),
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Personale" title={gls ? "Buste paga · GLS" : "Buste paga · Amazon"} subtitle={(gls ? "Autisti GLS. " : "SIC e STD per station. ") + "Costo, voci variabili, ore e straordinari, ferie residue: tutto letto dalle buste paga, mese per mese. La vedi solo tu."} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link className={gls ? "btn-secondary" : "btn-primary"} href="/personale-buste">Amazon</Link>
        <Link className={gls ? "btn-primary" : "btn-secondary"} href="/personale-buste?cliente=gls">GLS</Link>
        <a className="btn-secondary ml-auto" href={`/api/personale/buste${gls ? "?cliente=gls" : ""}`}>Scarica Excel</a>
      </div>
      {incroci && <Incroci d={incroci} />}
      {confronto && <Confronto d={confronto} />}
      {tot.length === 0 ? <p className="card p-4 text-sm text-slate-600">Non ci sono ancora buste caricate.</p> : <BusteClient key={gls ? "gls" : "amazon"} dati={dati} gls={gls} />}
    </div>
  );
}
