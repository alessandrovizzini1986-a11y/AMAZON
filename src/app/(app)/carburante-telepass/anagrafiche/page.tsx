import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ultimiImport } from "../dati";
import { AnagraficheClient } from "./AnagraficheClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anagrafiche Telepass e fuel card — FleetDSP" };

export default async function AnagrafichePage() {
  const user = await requireUser();
  const [dispositivi, carte, imports] = await Promise.all([
    db.telepassDispositivo.findMany({ orderBy: [{ station: "asc" }, { codice: "asc" }] }).catch(() => []),
    db.cartaCarburante.findMany({ orderBy: { ordine: "asc" } }).catch(() => []),
    ultimiImport(),
  ]);
  return (
    <div>
      <PageHeader
        eyebrow="Spese mezzi · Carte e dispositivi"
        title="Dispositivi Telepass e fuel card"
        subtitle="Da qui dipende la STATION di ogni transazione. Aggiornale ogni volta che arriva una mail di nuovo dispositivo, nuova carta o cambio station: trascina il file aggiornato, controlla il riepilogo e conferma."
      />
      <AnagraficheClient
        canEdit={can(user, "telepass.anagrafiche")}
        dispositivi={dispositivi.map((d) => ({ ...d, aggiornatoIl: d.aggiornatoIl.toISOString() }))}
        carte={carte.map((c) => ({ ...c, dataBlocco: c.dataBlocco ? c.dataBlocco.toISOString().slice(0, 10) : null, aggiornatoIl: c.aggiornatoIl.toISOString() }))}
        imports={imports}
      />
    </div>
  );
}
