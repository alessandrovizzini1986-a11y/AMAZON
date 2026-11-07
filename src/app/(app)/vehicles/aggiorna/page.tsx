import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { AggiornaClient } from "./AggiornaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aggiorna da Lista Targhe — FleetDSP" };

export default async function AggiornaFlottaPage() {
  const user = await requireUser();
  if (!can(user, "import.run")) redirect("/vehicles");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Flotta" title="Aggiorna da Lista Targhe"
        subtitle="Allinea il sito alla Lista Targhe: nuove targhe, riattivate, uscite (solo se sono nei Cessati), station, contratti e canoni. Con le fatture dei noleggiatori il canone diventa quello fatturato e trovi le targhe fatturate ma non più in flotta. Prima vedi l'anteprima, poi applichi." />
      <AggiornaClient />
    </div>
  );
}
