import { requireUser } from "@/lib/auth";
import { menuPer } from "@/components/navModel";
import { Tabs } from "../fatture-amazon/Tabs";

/**
 * Telematica come sezione a sé: una sola voce di menu e, in cima a ogni pagina, le schede.
 * Le schede sono le voci del gruppo "telematica" che l'utente vede (permessi e voci nascoste compresi).
 */
export default async function TelematicaLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const schede = menuPer(user.role, user.nascosti).find((g) => g.id === "telematica")?.items ?? [];
  return (
    <div>
      {schede.length > 1 && <Tabs etichetta="Sezioni Telematica" schede={schede.map((v) => ({ href: v.href, label: v.short ?? v.label, exact: v.href === "/telematica" }))} />}
      {children}
    </div>
  );
}
