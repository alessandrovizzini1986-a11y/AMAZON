import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import type { RigaMese, RigaPersona } from "@/domain/personale/analisi";
import { AssenzeClient } from "./AssenzeClient";

export const dynamic = "force-dynamic";

export default async function PersonaleAssenzePage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await requireSuperAdmin();
  const gls = (await searchParams).cliente === "gls", dove = gls ? "GLS" : { not: "GLS" };
  const righe = await db.personaleMese.findMany({ where: { mese: { gte: "2026-01" }, station: dove }, orderBy: [{ mese: "asc" }, { station: "asc" }] });
  const dati: RigaMese[] = righe.map((r) => ({ mese: r.mese, station: r.station, gruppo: r.gruppo as "SIC" | "STD", teste: r.teste, calendario: r.calendario, rotte: r.rotte, rotteTd: r.rotteTd, ggLavorati: r.ggLavorati, ggAltre: r.ggAltre, ggMalattia: r.ggMalattia, ggInfortunio: r.ggInfortunio, persMalattia: r.persMalattia, persInfortunio: r.persInfortunio, persAssenti: r.persAssenti }));
  const pp = await db.personaleAssenzaPersona.findMany({ where: { mese: { gte: "2026-01" }, station: dove } });
  const persone: RigaPersona[] = pp.map((r) => ({ mese: r.mese, station: r.station, gruppo: r.gruppo as "SIC" | "STD", codice: r.codice, nome: r.nome, ggLavorati: r.ggLavorati, ggMalattia: r.ggMalattia, ggInfortunio: r.ggInfortunio, ggAltre: r.ggAltre, ggNonRetribuite: r.ggNonRetribuite, ggIngiustificate: r.ggIngiustificate, ggMalattiaFiglio: r.ggMalattiaFiglio }));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Personale" title={gls ? "Assenze e infortuni · GLS" : "Assenze e infortuni · Amazon"} subtitle={gls ? "Malattia, infortuni e altre assenze degli autisti GLS, dalle buste paga. Gli addetti alla movimentazione merci non sono contati. La vedi solo tu." : "Malattia e infortuni di SIC e STD per station, dalle buste paga: dove intervenire, chi migliora, chi peggiora e chi pesa di più sul network. La vedi solo tu."} />
      <div className="flex gap-2 text-sm">
        <Link className={gls ? "btn-secondary" : "btn-primary"} href="/personale-assenze">Amazon</Link>
        <Link className={gls ? "btn-primary" : "btn-secondary"} href="/personale-assenze?cliente=gls">GLS</Link>
      </div>
      {dati.length === 0 ? <p className="card p-4 text-sm text-slate-600">Non ci sono ancora dati caricati.</p> : <AssenzeClient key={gls ? "gls" : "amazon"} righe={dati} persone={persone} gls={gls} />}
    </div>
  );
}
