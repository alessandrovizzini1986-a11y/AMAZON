/**
 * Incroci tra l'organico del file HR e il resto del sito: nessun dato si inventa, si confronta quello che c'è.
 * - chi è uscito ma ha ancora un telefono o una SIM a suo nome → da ritirare;
 * - contratti a termine che scadono a breve → da decidere;
 * - organico contro anagrafica costi (CDL): chi manca e chi non c'è più → la stima SIC è sbagliata finché non si aggiorna.
 */
export type Persona = { cf: string; matricola: string; cognome: string; nome: string; station: string; mansione: string; dataCessazione: Date | null; causaCessazione: string; scadenzaTd: Date | null; dataAssunzione: Date | null };
export type Dispositivo = { tipo: "Telefono" | "SIM"; assegnatario: string | null; station: string | null; stato: string | null; cosa: string };
export type RigaCdl = { cf: string; cognome: string; nome: string; station: string };

/** Nome senza accenti, apostrofi e ordine: "Rossi Mario" e "MARIO ROSSI" sono la stessa persona. */
export const chiaveNome = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

const GIORNO = 864e5;
/** Un dispositivo reso o rotto non è più in mano alla persona. */
const inMano = (stato: string | null) => !/RESTITUIT|ROTTO|ROTAZIONE|BACKUP|SMARRIT|FURTO/i.test(stato ?? "");

export function controlliOrganico(organico: Persona[], dispositivi: Dispositivo[], cdl: RigaCdl[], oggi: Date, giorniTd = 60) {
  const perNome = new Map<string, Dispositivo[]>();
  for (const d of dispositivi) {
    if (!d.assegnatario?.trim() || !inMano(d.stato)) continue;
    const k = chiaveNome(d.assegnatario);
    perNome.set(k, [...(perNome.get(k) ?? []), d]);
  }
  const usciti = organico.filter((p) => p.dataCessazione && p.dataCessazione.getTime() <= oggi.getTime() + 30 * GIORNO).sort((a, b) => b.dataCessazione!.getTime() - a.dataCessazione!.getTime());
  const daRitirare = usciti.map((p) => ({ persona: p, dispositivi: perNome.get(chiaveNome(`${p.cognome} ${p.nome}`)) ?? [] })).filter((x) => x.dispositivi.length > 0);
  const inScadenza = organico
    .filter((p) => !p.dataCessazione && p.scadenzaTd && p.scadenzaTd.getTime() >= oggi.getTime() - GIORNO && p.scadenzaTd.getTime() <= oggi.getTime() + giorniTd * GIORNO)
    .map((p) => ({ persona: p, giorni: Math.round((p.scadenzaTd!.getTime() - oggi.getTime()) / GIORNO) }))
    .sort((a, b) => a.giorni - b.giorni);
  const attivi = organico.filter((p) => !p.dataCessazione || p.dataCessazione.getTime() > oggi.getTime());
  const cfCdl = new Set(cdl.map((c) => c.cf)), cfOrg = new Map(organico.map((p) => [p.cf, p]));
  // la stessa persona può avere il codice fiscale scritto diverso nei due file: vale anche il nome
  const nomiCdl = new Set(cdl.map((c) => chiaveNome(`${c.cognome} ${c.nome}`)).filter(Boolean)), nomiOrg = new Map(organico.map((p) => [chiaveNome(`${p.cognome} ${p.nome}`), p]));
  const mancanoInCdl = cdl.length ? attivi.filter((p) => !cfCdl.has(p.cf) && !nomiCdl.has(chiaveNome(`${p.cognome} ${p.nome}`))) : [];
  // in CDL ma non più in organico, oppure usciti: per la stima sono costo che non c'è più
  const delOrganico = new Set(organico.map((p) => p.station)); // l'anagrafica costi ha anche altri appalti (GLS): quelli non si toccano
  const cdlDaTogliere = cdl.filter((c) => delOrganico.has(c.station)).filter((c) => { const p = cfOrg.get(c.cf) ?? nomiOrg.get(chiaveNome(`${c.cognome} ${c.nome}`) || "-"); return !p || (!!p.dataCessazione && p.dataCessazione.getTime() <= oggi.getTime()); });
  const stationDiversa = cdl.flatMap((c) => { const p = cfOrg.get(c.cf); return p && p.station !== c.station ? [{ persona: p, cdl: c.station }] : []; });
  const stations = [...new Set(organico.map((p) => p.station))].sort();
  const perStation = stations.map((s) => {
    const q = attivi.filter((p) => p.station === s);
    return { station: s, attivi: q.length, autisti: q.filter((p) => /AUTISTA/i.test(p.mansione)).length, usciti: usciti.filter((p) => p.station === s).length, aTermine: q.filter((p) => p.scadenzaTd).length };
  });
  return { usciti, daRitirare, inScadenza, mancanoInCdl, cdlDaTogliere, stationDiversa, perStation, attivi: attivi.length };
}
export type Controlli = ReturnType<typeof controlliOrganico>;
