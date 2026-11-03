import { requireUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { percorsoTelepassOra } from "@/lib/percorsi";
import { Percorso } from "@/components/Percorso";
import { PrimaVolta } from "@/components/PrimaVolta";
import { Tabs } from "./Tabs";

export default async function CarburanteTelepassLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  assertCan(user, "telepass.view");
  const percorso = can(user, "telepass.run") ? await percorsoTelepassOra() : null;
  return (
    <div>
      <Tabs />
      <PrimaVolta id="telepass" titolo="Telepass e carburante" passi={["Aggiorna le anagrafiche quando arriva una mail di cambio dispositivo o carta.", "A inizio mese trascina il CSV Telepass e scarica l'Excel.", "Poi fai lo stesso con l'export Q8."]} />
      {percorso && <Percorso p={percorso} />}
      {children}
    </div>
  );
}
