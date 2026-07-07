import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { VehicleForm } from "../VehicleForm";
import { createVehicleAction } from "../actions";

export default async function NewVehiclePage() {
  const user = await requireUser();
  assertCan(user, "vehicle.manage");
  const scope = stationScope(user);
  const stations = await db.station.findMany({ where: { active: true }, orderBy: { code: "asc" } });

  return (
    <div>
      <PageHeader title="Nuovo veicolo" subtitle="Inserimento manuale singolo — per il caricamento massivo usare Import dati" />
      <VehicleForm action={createVehicleAction} stations={stations} lockStation={scope.stationId} />
    </div>
  );
}
