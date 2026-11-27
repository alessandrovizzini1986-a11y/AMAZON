import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { MappaClient } from "./MappaClient";

export const dynamic = "force-dynamic";

export default async function MappaPage() {
  await requireRole("ADMIN");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Telematica" title="Mappa dei furgoni" subtitle="Dove sono adesso i mezzi di Targa Telematics e FlottaWeb. Si aggiorna da sola ogni minuto." action={<a href="/telematica/mese" className="btn-secondary">Il mese</a>} />
      <MappaClient />
    </div>
  );
}
