import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { aggregaAdit, tariffeDaAdit, type VoceAdit } from "@/domain/costi/adit";
import { versioneParametri } from "@/domain/costi/parametri";
import { calcolaForecast } from "../../fatture-amazon/forecast/dati";
import { aditMese, anagraficaRighe, datiFO, datiMog, etaMesi, festivi, mesePrec, oggiIso, parametri, stimaSalvata, tariffe, ultimoAdit, utenteCosti, versioniCDL, zucchettiControllato } from "../dati";
import { FineMeseClient } from "./FineMeseClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Costi a fine mese — FleetDSP" };

export default async function FineMesePage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const user = await utenteCosti("costi.view");
  const q = (await searchParams).mese;
  const mese = q && /^\d{4}-\d{2}$/.test(q) ? q : mesePrec(oggiIso().slice(0, 7));
  const anno = Number(mese.slice(0, 4));
  const [tar, par, fest, versioni, zuc, meseTariffe, meseCtrl, prec, mog] = await Promise.all([
    tariffe(), parametri(), festivi(anno), versioniCDL(), zucchettiControllato(mese), ultimoAdit(mesePrec(mese)), ultimoAdit(mese), stimaSalvata(mesePrec(mese), "STD"), datiMog(),
  ]);
  // foglio F.O.: dati del sito del mese e fatturato stimato (fatture + forecast)
  const [fo, fc] = await Promise.all([datiFO(mese), calcolaForecast(5, oggiIso()).catch(() => null)]);
  const st = fc?.stima.filter((r) => r.mese === mese) ?? [];
  const fatturato = st.length ? { totale: st.reduce((a, r) => a + r.totale, 0), certo: st.reduce((a, r) => a + r.fatturato, 0) } : null;
  const fineMese = `${mese}-${String(new Date(Date.UTC(anno, Number(mese.slice(5)), 0)).getUTCDate()).padStart(2, "0")}`;
  const [aditT, aditC] = await Promise.all([meseTariffe ? aditMese(meseTariffe) : [], meseCtrl ? aditMese(meseCtrl) : []]);
  const tStd = aditT.length ? tariffeDaAdit(aditT.map((r) => ({ ...r, voce: r.voce as VoceAdit }))) : null;
  const ctrl = aggregaAdit(aditC.map((r) => ({ ...r, voce: r.voce as VoceAdit })));
  const anag = versioni[0] ?? null;
  const righeCdl = anag ? await anagraficaRighe(anag.mese) : [];
  const aditDwh = Object.entries(aggregaAdit(aditT.map((r) => ({ ...r, voce: r.voce as VoceAdit })))).flatMap(([station, v]) => Object.entries(v).map(([voce, x]) => ({ station, voce, quantita: x!.quantita, costo: x!.costo, teste: x!.teste })));
  const oreLavoroPrec = prec ? Object.fromEntries([...new Set(prec.righe.map((r) => r.station))].map((s) => [s, prec.righe.filter((r) => r.station === s && r.voce === "ORE_LAVORO").reduce((a, r) => a + (r.quantita ?? 0), 0)])) : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Costi del personale · fine mese" title="Costi a fine mese"
        subtitle="Il giorno di chiusura: controlla il semaforo, premi Calcola costi, leggi i controlli rossi, salva la stima. I tracking si leggono qui nel browser dall'archivio del modulo Presenze." />
      <FineMeseClient
        mese={mese} fineMese={fineMese} canRun={can(user, "costi.run")}
        tariffe={tar} parametri={par.map((p) => ({ voce: p.chiave, validaDal: p.validaDal, valore: p.valore }))} versioneParametri={versioneParametri(par, fineMese)}
        festivi={fest} tariffeStd={tStd} meseTariffe={meseTariffe} aditCtrl={ctrl} meseCtrl={meseCtrl}
        anagrafica={anag ? { mese: anag.mese, eta: etaMesi(anag.mese, fineMese) } : null} zucchetti={zuc} oreLavoroPrec={oreLavoroPrec} righeCdl={righeCdl} aditDwh={aditDwh} utente={user.name} mog={mog} fo={fo} fatturatoStimato={fatturato}
      />
    </div>
  );
}
