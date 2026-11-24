import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { TelematicaClient } from "./TelematicaClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function TelematicaPage() {
  await requireRole("ADMIN");
  const [prove, portali] = await Promise.all([db.telematicaProva.findMany({ orderBy: [{ fonte: "asc" }, { eseguitaIl: "asc" }] }), db.portaleCredenziale.findMany({ select: { portale: true, username: true, passwordCifrata: true } })]);
  const pronto = (chiave: string) => portali.some((p) => p.portale.toLowerCase().replace(/\s+/g, "").includes(chiave) && !!p.username && !!p.passwordCifrata);
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader eyebrow="Strumenti" title="Telematica furgoni" subtitle="Collegamento a Targa Telematics e FlottaWeb con il tuo utente. Il sito legge soltanto: nessun comando ai mezzi (blocco motore, porte) può partire da qui." />
      <TelematicaClient
        pronti={{ TARGA: pronto("targa"), FLOTTAWEB: pronto("flottaweb") }}
        prove={prove.map((p) => ({ fonte: p.fonte as "TARGA" | "FLOTTAWEB", chiamata: p.chiamata, cosa: p.cosa, ok: p.ok, stato: p.stato, elementi: p.elementi, errore: p.errore, eseguitaIl: p.eseguitaIl.toISOString() }))}
      />
    </div>
  );
}
