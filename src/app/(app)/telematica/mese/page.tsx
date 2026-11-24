import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { giornoRoma } from "@/domain/telematica";
import { datiMese } from "@/lib/telematica/mese";
import { MeseClient } from "./MeseClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function MeseTelematicaPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  await requireRole("ADMIN");
  const chiesto = (await searchParams).mese ?? "";
  const mese = /^\d{4}-\d\d$/.test(chiesto) ? chiesto : giornoRoma(new Date()).slice(0, 7);
  const d = await datiMese(mese);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Strumenti" title="Furgoni: il mese" subtitle="Cosa ha fatto ogni targa nel mese: km, ore di guida, soste, rifornimenti e consumi. I dati arrivano da Targa Telematics e FlottaWeb, un giorno per volta." action={<a href="/telematica/mappa" className="btn-secondary">Mappa</a>} />
      <MeseClient mese={mese} riepilogo={d.riepilogo} calendario={d.calendario} />
    </div>
  );
}
