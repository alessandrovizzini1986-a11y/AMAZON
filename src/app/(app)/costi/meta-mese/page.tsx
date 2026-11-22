import { can } from "@/lib/rbac";
import { meseScelto } from "@/lib/meseServer";
import { PageHeader } from "@/components/ui";
import { festivi, oggiIso, tariffe, utenteCosti } from "../dati";
import { MetaMeseClient } from "./MetaMeseClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stima di metà mese — FleetDSP" };

export default async function MetaMesePage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const user = await utenteCosti("costi.view");
  const oggi = oggiIso();
  const mese = await meseScelto((await searchParams).mese, oggi.slice(0, 7));
  const [tar, fest] = await Promise.all([tariffe(), festivi(Number(mese.slice(0, 4)))]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Personale · terzo lunedì del mese" title="Stima di metà mese"
        subtitle="Dopo la verifica dei tracking: le ore per categoria fino al giorno della stima, per station e per GLS, proiettate sul mese intero. Scarichi il foglio già compilato da copiare nel file Stima Costi che alleghi alla mail." />
      <MetaMeseClient mese={mese} oggi={oggi} canRun={can(user, "costi.run")} tariffe={tar} festivi={fest} />
    </div>
  );
}
