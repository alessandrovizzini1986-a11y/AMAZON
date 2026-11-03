import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { mappaTelepass, runTelepass } from "../dati";
import { TelepassClient } from "./TelepassClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Telepass del mese — FleetDSP" };

export default async function TelepassPage() {
  const user = await requireUser();
  const [mappa, runs] = await Promise.all([mappaTelepass(), runTelepass()]);
  return (
    <div>
      <PageHeader
        eyebrow="Telepass e carburante · Telepass"
        title="Transazioni Telepass del mese"
        subtitle="Trascina il CSV scaricato da Telepass Business: il sito attribuisce ogni transazione a una station con la mappa dei dispositivi, mostra l'anteprima e genera l'Excel del mese."
      />
      <TelepassClient mappa={mappa} runs={runs} canRun={can(user, "telepass.run")} />
    </div>
  );
}
