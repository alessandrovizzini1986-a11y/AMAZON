import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { datiRiconciliazione, meseIniziale } from "@/lib/carburante/riconciliazione";
import { isMeseValido } from "@/lib/carburante/filtro";
import { CarburanteClient, PulsantiIntestazione } from "./CarburanteClient";
import { CHIAVE_GUIDA, perVista } from "./testi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Q = { mese?: string; flotta?: string; targa?: string; regolari?: string; nonverificabili?: string; archiviate?: string };

export default async function CarburantePage({ searchParams }: { searchParams: Promise<Q> }) {
  const user = await requireRole("ADMIN");
  const q = await searchParams;
  const mese = isMeseValido(q.mese) ? q.mese : await meseIniziale();
  const [dati, visto] = await Promise.all([
    datiRiconciliazione(mese),
    db.tourVisto.findUnique({ where: { userId_chiave: { userId: user.id, chiave: CHIAVE_GUIDA } }, select: { esito: true } }),
  ]);
  // gli altri filtri (flotta, targa, interruttori) il client li legge dall'indirizzo: non serve ricaricare il mese
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Telematica"
        title="Carburante: Q8 e telematica"
        subtitle="Ogni pagamento con le carte Q8 di DER2 e GLS confrontato con il gasolio che la telematica Targa ha visto entrare nei furgoni: ora, litri e luogo."
        action={<PulsantiIntestazione />}
      />
      <CarburanteClient key={mese} dati={perVista(dati)} guidaVista={!!visto} utente={user.id} nascosti={user.nascosti ?? []} />
    </div>
  );
}
