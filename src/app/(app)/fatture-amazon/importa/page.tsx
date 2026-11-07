import { PageHeader } from "@/components/ui";
import { descrizioniNote, mappaMacroarea, statoNumeri, utenteCon } from "../dati";
import { ImportaClient } from "./ImportaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importa fatture Amazon — FleetDSP" };

export default async function ImportaPage() {
  const user = await utenteCon("fatture.import");
  const [{ ultimo, prossimo }, note, macro] = await Promise.all([statoNumeri(), descrizioniNote(), mappaMacroarea()]);
  return (
    <div>
      <PageHeader eyebrow="Amazon · importa" title="Dalle fatture PDF alle righe di fatt_2026"
        subtitle="Trascina i PDF della settimana: il sito legge le righe dei Dettagli fattura, segnala quelle già inserite e prepara l'Excel o le righe da incollare in fondo a fatt_2026." />
      <ImportaClient ultimo={ultimo} prossimo={prossimo} note={note} macro={macro} />
    </div>
  );
}
