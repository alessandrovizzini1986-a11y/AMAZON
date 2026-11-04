import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { configPresenze, esecuzioni } from "../dati";
import { datiMog } from "../../costi/dati";
import { FineMeseClient } from "./FineMeseClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Controllo fine mese presenze — FleetDSP" };

export default async function FineMesePage() {
  const user = await requireUser();
  const [cfg, runs, mog] = await Promise.all([configPresenze(), esecuzioni("FINE_MESE"), datiMog()]);
  return (
    <div>
      <PageHeader
        eyebrow="Presenze · passo 3"
        title="Controllo di fine mese: tracking vs Zucchetti"
        subtitle="Confronta le ore del tracking SIC con il cartellino Zucchetti, giorno per giorno, e controlla domeniche e giorni consecutivi. Usa i file caricati nell'archivio di questo PC."
      />
      <FineMeseClient referenti={cfg.referenti} runs={runs} canRun={can(user, "presenze.run")} mog={mog} />
    </div>
  );
}
