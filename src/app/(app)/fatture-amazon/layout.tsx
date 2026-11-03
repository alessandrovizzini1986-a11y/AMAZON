import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can, type Action } from "@/lib/rbac";
import { Tabs, type Scheda } from "./Tabs";

const SCHEDE: (Scheda & { perm: Action })[] = [
  { href: "/fatture-amazon", label: "Stato", exact: true, perm: "fatture.registro" },
  { href: "/fatture-amazon/importa", label: "Importa PDF", perm: "fatture.import" },
  { href: "/fatture-amazon/registro", label: "Registro", perm: "fatture.registro" },
  { href: "/fatture-amazon/allinea", label: "Allinea e storico", perm: "fatture.allinea" },
  { href: "/fatture-amazon/fatturato", label: "Fatturato", perm: "fatturato.view" },
  { href: "/fatture-amazon/forecast", label: "Forecast", exact: true, perm: "forecast.view" },
  { href: "/fatture-amazon/forecast/storico", label: "Storico forecast e furgoni", perm: "forecast.view" },
];

export default async function FattureLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const schede = SCHEDE.filter((s) => can(user, s.perm));
  if (!schede.length) redirect("/");
  return (
    <div>
      <Tabs schede={schede.map(({ perm: _perm, ...s }) => s)} />
      {children}
    </div>
  );
}
