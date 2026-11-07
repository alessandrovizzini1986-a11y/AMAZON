import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { utenteCon } from "../../dati";
import { calcolaStorico } from "./dati";
import { StoricoClient } from "./StoricoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Storico forecast — FleetDSP" };

export default async function StoricoForecastPage({ searchParams }: { searchParams: Promise<{ n?: string; oggi?: string }> }) {
  await utenteCon("forecast.view");
  const q = await searchParams;
  const n = Math.min(12, Math.max(1, Number(q.n) || 5));
  const oggi = q.oggi && /^\d{4}-\d{2}-\d{2}$/.test(q.oggi) ? q.oggi : new Date().toISOString().slice(0, 10);
  const d = await calcolaStorico(n, oggi);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Amazon · forecast" title="Storico forecast e furgoni"
        subtitle="Ogni forecast caricato resta come versione; per il ricavo previsto vale la versione più recente (settimana di emissione del file). Qui vedi come si è mosso il forecast, quanto ci ha preso e quanti furgoni servono per station nelle prossime settimane." />
      {d.punti.length === 0 ? <p className="card p-5 text-sm text-ink-muted">Nessun forecast caricato: caricali in <Link className="underline" href="/fatture-amazon/forecast">Forecast</Link>.</p> : <StoricoClient {...d} />}
    </div>
  );
}
