import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import type { RigaMese, RigaPersona } from "@/domain/personale/analisi";
import { AssenzeClient } from "./AssenzeClient";

export const dynamic = "force-dynamic";

export default async function PersonaleAssenzePage() {
  await requireSuperAdmin();
  const righe = await db.personaleMese.findMany({ where: { mese: { gte: "2026-01" } }, orderBy: [{ mese: "asc" }, { station: "asc" }] });
  const dati: RigaMese[] = righe.map((r) => ({ mese: r.mese, station: r.station, gruppo: r.gruppo as "SIC" | "STD", teste: r.teste, calendario: r.calendario, rotte: r.rotte, rotteTd: r.rotteTd, ggLavorati: r.ggLavorati, ggAltre: r.ggAltre, ggMalattia: r.ggMalattia, ggInfortunio: r.ggInfortunio, persMalattia: r.persMalattia, persInfortunio: r.persInfortunio, persAssenti: r.persAssenti }));
  const pp = await db.personaleAssenzaPersona.findMany({ where: { mese: { gte: "2026-01" } } });
  const persone: RigaPersona[] = pp.map((r) => ({ mese: r.mese, station: r.station, gruppo: r.gruppo as "SIC" | "STD", codice: r.codice, nome: r.nome, ggLavorati: r.ggLavorati, ggMalattia: r.ggMalattia, ggInfortunio: r.ggInfortunio, ggAltre: r.ggAltre }));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Personale" title="Assenze e infortuni" subtitle="Malattia e infortuni di SIC e STD per station, dalle buste paga: dove intervenire, chi migliora, chi peggiora e chi pesa di più sul network. La vedi solo tu." />
      {dati.length === 0 ? <p className="card p-4 text-sm text-slate-600">Non ci sono ancora dati caricati.</p> : <AssenzeClient righe={dati} persone={persone} />}
    </div>
  );
}
