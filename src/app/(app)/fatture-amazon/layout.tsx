import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can, type Action } from "@/lib/rbac";
import { Tabs, type Scheda } from "./Tabs";
import { percorsoFattureSettimana } from "@/lib/percorsi";
import { Percorso } from "@/components/Percorso";
import { PrimaVolta } from "@/components/PrimaVolta";

const SCHEDE: (Scheda & { perm: Action })[] = [
  { href: "/fatture-amazon", label: "Stato", exact: true, perm: "fatture.registro" },
  { href: "/fatture-amazon/importa", label: "Importa PDF", perm: "fatture.import" },
  { href: "/fatture-amazon/registro", label: "Registro", perm: "fatture.registro" },
  { href: "/fatture-amazon/allinea", label: "Allinea con fatt_2026", perm: "fatture.allinea" },
  { href: "/fatture-amazon/fatturato", label: "Fatturato", perm: "fatturato.view" },
  { href: "/fatture-amazon/rimborsi", label: "Rimborsi", perm: "fatturato.view" },
  { href: "/fatture-amazon/forecast", label: "Forecast", exact: true, perm: "forecast.view" },
  { href: "/fatture-amazon/forecast/storico", label: "Storico forecast e furgoni", perm: "forecast.view" },
];

export default async function FattureLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const schede = SCHEDE.filter((s) => can(user, s.perm));
  if (!schede.length) redirect("/");
  const percorso = can(user, "fatture.import") ? await percorsoFattureSettimana() : null;
  return (
    <div>
      <Tabs schede={schede.map(({ perm: _perm, ...s }) => s)} />
      <PrimaVolta id="fatture" titolo="Fatture Amazon" passi={["Ogni lunedì scarica da Amazon i PDF dal prossimo numero e trascinali in Importa PDF.", "Scarica l'Excel o copia le righe e incollale in fondo a fatt_2026.", "Poi fai Allinea: il registro sa che sono in fatt_2026 e non le reimporti."]} />
      {percorso && <Percorso p={percorso} />}
      {children}
    </div>
  );
}
