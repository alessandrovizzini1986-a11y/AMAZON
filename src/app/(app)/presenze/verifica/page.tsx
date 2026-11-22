import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { configPresenze } from "../dati";
import { VerificaClient } from "./VerificaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verifica tracking — FleetDSP" };

export default async function VerificaPage() {
  const user = await requireUser();
  const cfg = await configPresenze();
  return (
    <div>
      <PageHeader
        eyebrow="Personale · Presenze · passo 2"
        title="Verifica tracking: Amazon, CCNL e Accordo"
        subtitle="Un solo controllo: chi ha lavorato davvero, i 6 giorni, le ore nella riga giusta. Ne esce l'elenco delle richieste per gli Operation Supervisor: quelle già chiuse non tornano."
      />
      <VerificaClient utente={user.name} giustificativi={cfg.giustificativi} dispatcher={cfg.dispatcher} referenti={cfg.referenti} canRun={can(user, "presenze.run")} />
    </div>
  );
}
