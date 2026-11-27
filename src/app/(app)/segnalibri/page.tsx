import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { eSegnalibro, type Pulsante } from "@/domain/segnalibri/leggi";
import { SegnalibriClient } from "./SegnalibriClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Segnalibri — FleetDSP" };

/** I segnalibri per i portali esterni: pulsanti da trascinare nella barra dei preferiti, con le istruzioni per usarli. */
export default async function SegnalibriPage() {
  const user = await requireUser();
  if (!can(user, "home.view")) redirect("/");
  const tutti = await db.segnalibro.findMany({ orderBy: [{ ordine: "asc" }, { titolo: "asc" }], select: { id: true, titolo: true, descrizione: true, istruzioni: true, pulsanti: true, nomeFile: true, aggiornatoIl: true, aggiornatoDa: true } });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Strumenti" title="Segnalibri" subtitle="Pulsanti da tenere nella barra dei preferiti del browser: si lanciano quando sei su un portale esterno e fanno da soli un lavoro ripetitivo. Qui li trovi tutti, con le istruzioni." />
      <SegnalibriClient admin={can(user, "config.manage")} segnalibri={tutti.map((s) => ({
        id: s.id, titolo: s.titolo, descrizione: s.descrizione, istruzioni: s.istruzioni, nomeFile: s.nomeFile,
        pulsanti: (Array.isArray(s.pulsanti) ? (s.pulsanti as unknown as Pulsante[]) : []).filter((p) => p && typeof p.nome === "string" && typeof p.codice === "string" && eSegnalibro(p.codice)),
        aggiornato: `${s.aggiornatoIl.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}${s.aggiornatoDa ? ` da ${s.aggiornatoDa}` : ""}`,
      }))} />
    </div>
  );
}
