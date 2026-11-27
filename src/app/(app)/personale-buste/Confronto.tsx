import Link from "next/link";
import { NOME_VOCE, VOCI, type Esito, type RigaConfronto } from "@/domain/personale/confronto";

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const nome = (m: string) => `${MESI[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const ore = (x: number) => (Math.abs(x) < 0.005 ? "" : x.toLocaleString("it-IT", { maximumFractionDigits: 2 }));
const ETICHETTA: Record<Exclude<Esito, "UGUALE">, string> = { VOCE_DIVERSA: "Stesse ore, voce diversa", ORE_DIVERSE: "Ore diverse", SOLO_TRACKING: "Solo nel tracking", SOLO_BUSTA: "Solo in busta" };
const COLORE: Record<Exclude<Esito, "UGUALE">, string> = { VOCE_DIVERSA: "bg-amber-50", ORE_DIVERSE: "bg-red-50", SOLO_TRACKING: "", SOLO_BUSTA: "" };

/** Tracking della station contro busta dell'ufficio paghe, sullo stesso mese di lavoro: solo chi non combacia. */
export function Confronto({ d }: { d: { mesi: string[]; mese: string | null; righe: RigaConfronto[]; soloTracking: string[] } }) {
  if (!d.mese) {
    return (
      <section id="confronto" className="card flex flex-col gap-1 p-4 md:p-5">
        <h2 className="text-[17px] font-semibold">Tracking contro buste</h2>
        <p className="text-sm text-ink-muted">
          {d.soloTracking.length
            ? `Ho il tracking di ${d.soloTracking.map(nome).join(", ")}, ma la busta con quel mese di lavoro non è ancora arrivata (per i SIC è la busta del mese dopo).`
            : <>Non c&apos;è ancora un mese con tutti e due. Le ore del tracking si salvano da sole quando esegui <Link className="underline" href="/presenze/fine-mese">Presenze → Fine mese</Link>.</>}
        </p>
      </section>
    );
  }
  const stations = [...new Set(d.righe.map((r) => r.station))].sort();
  const conta = (s: string, e: Esito) => d.righe.filter((r) => r.station === s && r.esito === e).length;
  const diverse = d.righe.filter((r) => r.esito !== "UGUALE").sort((a, b) => a.station.localeCompare(b.station) || a.esito.localeCompare(b.esito) || a.nome.localeCompare(b.nome));
  return (
    <section id="confronto" className="card flex flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold">Tracking contro buste · lavoro di {nome(d.mese)}</h2>
          <p className="max-w-3xl text-sm text-ink-muted">Le ore che la station ha scritto nel tracking contro quelle che l&apos;ufficio paghe ha messo in busta, persona per persona (SIC). Differenze sotto un quarto d&apos;ora non contano. Se le ore tornano ma sotto un&apos;altra voce (ROL al posto di ferie, supplementare al posto di straordinario) lo dice.</p>
        </div>
        {d.mesi.length > 1 && <div className="flex flex-wrap gap-1.5 text-sm">{d.mesi.map((m) => <Link key={m} href={`/personale-buste?confronto=${m}#confronto`} className={m === d.mese ? "btn-primary" : "btn-secondary"}>{MESI[Number(m.slice(5)) - 1].slice(0, 3)}</Link>)}</div>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-ink-muted"><th className="py-1 pr-3 font-normal">Station</th><th className="py-1 pr-3 text-right font-normal">Uguali</th><th className="py-1 pr-3 text-right font-normal">Voce diversa</th><th className="py-1 pr-3 text-right font-normal">Ore diverse</th><th className="py-1 pr-3 text-right font-normal">Solo nel tracking</th><th className="py-1 pr-3 text-right font-normal">Solo in busta</th></tr></thead>
          <tbody>{stations.map((s) => <tr key={s} className="border-t border-line"><td className="py-1 pr-3 font-medium">{s}</td>{(["UGUALE", "VOCE_DIVERSA", "ORE_DIVERSE", "SOLO_TRACKING", "SOLO_BUSTA"] as Esito[]).map((e) => <td key={e} className="py-1 pr-3 text-right tabular-nums">{conta(s, e) || ""}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {diverse.length === 0 ? <p className="rounded-control bg-ok-soft px-3 py-2 text-sm text-ok">✓ Tracking e buste combaciano per tutti.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted"><th className="py-1 pr-3 font-normal">Persona</th><th className="py-1 pr-3 font-normal">Station</th><th className="py-1 pr-3 font-normal">Cosa non torna</th>{VOCI.map((v) => <th key={v} className="py-1 pr-2 text-right font-normal">{NOME_VOCE[v]}<br /><span className="text-[10px]">tracking / busta</span></th>)}</tr>
            </thead>
            <tbody>
              {diverse.map((r, i) => {
                const e = r.esito as Exclude<Esito, "UGUALE">;
                return (
                  <tr key={i} className={`border-t border-line align-top ${COLORE[e]}`}>
                    <td className="py-1.5 pr-3 font-medium">{r.nome}<div className="text-xs font-normal text-ink-muted">{r.contratto}</div></td>
                    <td className="py-1.5 pr-3">{r.station}</td>
                    <td className="py-1.5 pr-3"><span className="font-medium">{ETICHETTA[e]}</span><div className="text-xs text-ink-muted">{r.cosa}</div></td>
                    {VOCI.map((v) => <td key={v} className={`whitespace-nowrap py-1.5 pr-2 text-right tabular-nums ${Math.abs(r.delta[v]) > 0.26 ? "font-semibold" : "text-ink-faint"}`}>{ore(r.tracking[v]) || "0"} / {ore(r.busta[v]) || "0"}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-muted">Ore diverse: chiedi alla station se il tracking era giusto e a HR cosa è stato pagato. Voce diversa: i soldi tornano, ma il saldo di ferie, ROL o ex festività della persona scende dalla parte sbagliata.</p>
    </section>
  );
}
