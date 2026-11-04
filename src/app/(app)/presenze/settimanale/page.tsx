import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { configPresenze, esecuzioni } from "../dati";
import { datiMog } from "../../costi/dati";
import { SettimanaleClient } from "./SettimanaleClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Controllo settimanale presenze — FleetDSP" };

export default async function SettimanalePage() {
  const user = await requireUser();
  const [cfg, runs, mog] = await Promise.all([configPresenze(), esecuzioni("SETTIMANALE"), datiMog()]);
  return (
    <div>
      <PageHeader
        eyebrow="Presenze · passo 2"
        title="Controllo settimanale: tracking vs Amazon"
        subtitle="Usa i file caricati nell'archivio di questo PC. Scegli periodo e station, esegui il controllo, copia i messaggi per gli Ops e salva l'esecuzione."
      />
      <SettimanaleClient utente={user.name} giustificativi={cfg.giustificativi} dispatcher={cfg.dispatcher} referenti={cfg.referenti} runs={runs} canRun={can(user, "presenze.run")} mog={mog} />
    </div>
  );
}
