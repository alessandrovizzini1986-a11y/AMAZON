import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { giornoRoma, piuGiorni } from "@/domain/telematica";
import { datiGiornata, stationConTelematica } from "@/lib/telematica/giornata";
import { GiornataClient } from "./GiornataClient";

export const dynamic = "force-dynamic";

export default async function GiornataPage({ searchParams }: { searchParams: Promise<{ station?: string; giorno?: string }> }) {
  await requireRole("ADMIN");
  const q = await searchParams;
  const stations = await stationConTelematica();
  const station = q.station && stations.includes(q.station) ? q.station : stations.includes("DER2") ? "DER2" : stations[0] ?? "DER2";
  const oggi = giornoRoma(new Date());
  const giorno = q.giorno && /^\d{4}-\d\d-\d\d$/.test(q.giorno) && q.giorno <= oggi ? q.giorno : piuGiorni(oggi, -1);
  const dati = await datiGiornata(station, giorno);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Strumenti" title="Giornata di consegna" subtitle="Cosa ha fatto ogni furgone in un giorno: partenza, rientro, km, soste, e le cose da guardare. Di fianco, le rotte Amazon dello stesso giorno." action={<a href="/telematica/mese" className="btn-secondary">Il mese</a>} />
      <GiornataClient dati={dati} stations={stations} oggi={oggi} />
    </div>
  );
}
