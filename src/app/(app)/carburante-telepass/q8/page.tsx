import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { censimento, runQ8 } from "../dati";
import { Q8Client } from "./Q8Client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Carte carburante Q8 del mese — FleetDSP" };

export default async function Q8Page() {
  const user = await requireUser();
  const [cens, runs] = await Promise.all([censimento(), runQ8()]);
  return (
    <div>
      <PageHeader
        eyebrow="Spese mezzi · Carburante Q8"
        title="Rifornimenti Q8 del mese"
        subtitle="Trascina l'export Excel del portale Q8 Flotte: il sito tiene solo le carte AMZ e GLS, attribuisce ogni rifornimento alla DS con il censimento fuel card e genera l'Excel del mese."
      />
      <Q8Client censimento={cens} runs={runs} canRun={can(user, "telepass.run")} />
    </div>
  );
}
