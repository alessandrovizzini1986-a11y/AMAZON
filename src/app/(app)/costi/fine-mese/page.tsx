import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { aggregaAdit, tariffeDaAdit, type VoceAdit } from "@/domain/costi/adit";
import { versioneParametri } from "@/domain/costi/parametri";
import { aditMese, etaMesi, festivi, mesePrec, oggiIso, parametri, stimaSalvata, tariffe, ultimoAdit, utenteCosti, versioniCDL, zucchettiControllato } from "../dati";
import { FineMeseClient } from "./FineMeseClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Costi a fine mese — FleetDSP" };

export default async function FineMesePage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const user = await utenteCosti("costi.view");
  const q = (await searchParams).mese;
  const mese = q && /^\d{4}-\d{2}$/.test(q) ? q : mesePrec(oggiIso().slice(0, 7));
  const anno = Number(mese.slice(0, 4));
  const [tar, par, fest, versioni, zuc, meseTariffe, meseCtrl, prec] = await Promise.all([
    tariffe(), parametri(), festivi(anno), versioniCDL(), zucchettiControllato(mese), ultimoAdit(mesePrec(mese)), ultimoAdit(mese), stimaSalvata(mesePrec(mese), "STD"),
  ]);
  const fineMese = `${mese}-${String(new Date(Date.UTC(anno, Number(mese.slice(5)), 0)).getUTCDate()).padStart(2, "0")}`;
  const [aditT, aditC] = await Promise.all([meseTariffe ? aditMese(meseTariffe) : [], meseCtrl ? aditMese(meseCtrl) : []]);
  const tStd = aditT.length ? tariffeDaAdit(aditT.map((r) => ({ ...r, voce: r.voce as VoceAdit }))) : null;
  const ctrl = aggregaAdit(aditC.map((r) => ({ ...r, voce: r.voce as VoceAdit })));
  const anag = versioni[0] ?? null;
  const oreLavoroPrec = prec ? Object.fromEntries([...new Set(prec.righe.map((r) => r.station))].map((s) => [s, prec.righe.filter((r) => r.station === s && r.voce === "ORE_LAVORO").reduce((a, r) => a + (r.quantita ?? 0), 0)])) : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Costi del personale · fine mese" title="Costi a fine mese"
        subtitle="Il giorno di chiusura: controlla il semaforo, premi Calcola costi, leggi i controlli rossi, salva la stima. I tracking si leggono qui nel browser dall'archivio del modulo Presenze." />
      <FineMeseClient
        mese={mese} fineMese={fineMese} canRun={can(user, "costi.run")}
        tariffe={tar} parametri={par.map((p) => ({ voce: p.chiave, validaDal: p.validaDal, valore: p.valore }))} versioneParametri={versioneParametri(par, fineMese)}
        festivi={fest} tariffeStd={tStd} meseTariffe={meseTariffe} aditCtrl={ctrl} meseCtrl={meseCtrl}
        anagrafica={anag ? { mese: anag.mese, eta: etaMesi(anag.mese, fineMese) } : null} zucchetti={zuc} oreLavoroPrec={oreLavoroPrec}
      />
    </div>
  );
}
