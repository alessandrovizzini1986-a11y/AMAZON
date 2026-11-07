import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { StoricoClient } from "./StoricoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "File elaborati Q8 e Telepass — FleetDSP" };

export default async function StoricoPage() {
  const user = await requireUser();
  if (!can(user, "telepass.run")) redirect("/carburante-telepass");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Spese mezzi" title="File elaborati Q8 e Telepass"
        subtitle="Per i mesi elaborati fuori dal sito: trascina i file del mese già lavorati (Q8 con la colonna STATION, Telepass con il foglio PVT). Il sito ne prende i totali per station e settimana, come se li avesse elaborati lui." />
      <StoricoClient />
    </div>
  );
}
