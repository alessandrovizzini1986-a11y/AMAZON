import { can } from "@/lib/rbac";
import { meseScelto } from "@/lib/meseServer";
import { PageHeader } from "@/components/ui";
import { tariffeDaAdit, type VoceAdit } from "@/domain/costi/adit";
import { quotaCanone } from "@/domain/costi/fo";
import { rigaNoleggioGls, type CellaNoleggioGls } from "@/lib/costi/excelFOGls";
import { aditMese, datiFO, festivi, mesePrec, oggiIso, parametri, tariffe, ultimoAdit, utenteCosti } from "../dati";
import { GlsClient } from "./GlsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Costi GLS — FleetDSP" };

export default async function CostiGlsPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const user = await utenteCosti("costi.view");
  const q = (await searchParams).mese;
  const mese = await meseScelto(q, mesePrec(oggiIso().slice(0, 7)));
  const anno = Number(mese.slice(0, 4));
  const [tar, par, fest, festPrima, fo, meseTariffe] = await Promise.all([tariffe(), parametri(), festivi(anno), festivi(anno - 1), datiFO(mese), ultimoAdit(mesePrec(mese))]);
  const adit = meseTariffe ? await aditMese(meseTariffe) : [];
  const tStd = adit.length ? tariffeDaAdit(adit.map((r) => ({ ...r, voce: r.voce as VoceAdit }))) : null;
  // noleggi della flotta GLS per riga del foglio F.O. GLS (canone pro-rata, sostitutivi esclusi)
  const per = new Map<number, CellaNoleggioGls>();
  for (const m of fo.mezzi.filter((x) => x.station === "GLS")) {
    const qq = quotaCanone(m, mese);
    if (!qq) continue;
    const riga = rigaNoleggioGls(m.leasingCompany);
    const c = per.get(riga) ?? { riga, importo: 0, mezzi: 0, societa: [] };
    c.importo += qq; c.mezzi++;
    if (m.leasingCompany && !c.societa.includes(m.leasingCompany)) c.societa.push(m.leasingCompany);
    per.set(riga, c);
  }
  const chiaveGls = (o: Record<string, number> | undefined) => (o ? Object.entries(o).filter(([k]) => k.toUpperCase().startsWith("GLS")).reduce((a, [, v]) => a + v, 0) : null);
  const fineMese = `${mese}-${String(new Date(Date.UTC(anno, Number(mese.slice(5)), 0)).getUTCDate()).padStart(2, "0")}`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Personale · GLS Castel Maggiore (CDC 5565)" title="Costi GLS"
        subtitle="Trascina i file presenze di Castel Maggiore (mese e mese prima), il DB_CDL_base con il foglio SIC GLS BO e, se ce l'hai, l'export Badgebox e il payroll del mese. I file restano in questo browser: niente viene salvato." />
      <GlsClient
        mese={mese} fineMese={fineMese} canRun={can(user, "costi.run")}
        tariffe={tar} parametri={par.map((p) => ({ voce: p.chiave, validaDal: p.validaDal, valore: p.valore }))} festivi={[...festPrima, ...fest]}
        tariffeStd={tStd} meseTariffe={meseTariffe}
        fo={{ carburante: chiaveGls(fo.q8?.perStation), q8File: fo.q8?.file ?? null, autostrade: chiaveGls(fo.telepass?.perStation), telepassFile: fo.telepass?.file ?? null, noleggi: [...per.values()].map((c) => ({ ...c, importo: Math.round(c.importo * 100) / 100 })) }}
      />
    </div>
  );
}
