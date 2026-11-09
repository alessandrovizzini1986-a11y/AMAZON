/**
 * Listini dei noleggiatori (furgoni), €/mese IVA esclusa per 30 giorni. Fonti:
 * - passaggio di consegne mezzi (15/05/2026), foglio Tariffe;
 * - Europcar "Tariffe Speciali Furgoni SUPERFLEX TOP" (picco 2025, validità 31/03/2026);
 * - Amicoblu (Avis Budget) "Rinnovo 2026" del 12/02/2026 e "Speciale furgoni elettrici" del 04/02/2026.
 * Aggiornare qui quando arriva un listino nuovo (e la data `validoAl`).
 */
export type Classe = "SMALL" | "MEDIUM" | "LARGE" | "XL" | "MOTRICE";

export type VoceListino = {
  gruppo: string; modello: string; classe: Classe; eurMese: number;
  kmInclusi?: string; kmExtra?: number; franchigiaDanni?: number; franchigiaFurto?: number; note?: string;
};
export type Listino = {
  id: string; fornitore: string; titolo: string; fonte: string; data: string; validoAl: string | null;
  uso: string; condizioni: string[]; voci: VoceListino[];
};

const europcarCond = ["150 km/giorno, 4.500 km/mese inclusi", "riduzione danni (SCDW) e furto/incendio (TW) incluse", "supplemento aeroporto 18 %, stazione ferroviaria 11 %", "no show 95 €, cancellazione entro 48 h altrimenti 50 €", "gestione multe 20 €, pedaggi non pagati 56 €"];

export const LISTINI: Listino[] = [
  {
    id: "ayvens", fornitore: "Ayvens (ALD)", titolo: "Medio termine furgoni", fonte: "Passaggio di consegne mezzi, foglio Tariffe", data: "2026-05-15", validoAl: null,
    uso: "1ª scelta per tutti i noleggi: miglior prezzo su MEDIUM e LARGE. Richieste BT con il Forms Ayvens.",
    condizioni: ["canone mensile medio termine", "contratti attivi, libretti e assicurazioni sul portale My Ayvens"],
    voci: [
      { gruppo: "VAN SMALL", modello: "Doblò / Combo", classe: "SMALL", eurMese: 650 },
      { gruppo: "VAN MEDIUM", modello: "Transit Custom / Vivaro", classe: "MEDIUM", eurMese: 720 },
      { gruppo: "VAN LARGE", modello: "Ducato / Movano", classe: "LARGE", eurMese: 900 },
    ],
  },
  {
    id: "europcar-superflex", fornitore: "Europcar", titolo: "Tariffe speciali furgoni SUPERFLEX TOP (picco 2025)", fonte: "Speciale_tariffa_vans_Adecco_picco_2025.pdf", data: "2025-10-01", validoAl: "2026-03-31",
    uso: "Standard. Tariffa non scontabile; per i gruppi non elencati vale il tariffario ufficiale.", condizioni: europcarCond,
    voci: [
      { gruppo: "KGIA", modello: "Fiat Fiorino", classe: "SMALL", eurMese: 638, kmExtra: 0.10, franchigiaDanni: 450, franchigiaFurto: 1700 },
      { gruppo: "KPIA", modello: "Fiat Doblò", classe: "SMALL", eurMese: 784.74, kmExtra: 0.10, franchigiaDanni: 450, franchigiaFurto: 1700 },
      { gruppo: "KPIZ", modello: "Fiat Doblò, serrature di sicurezza", classe: "SMALL", eurMese: 823.02, kmExtra: 0.10, franchigiaDanni: 450, franchigiaFurto: 1700 },
      { gruppo: "KMIA", modello: "Fiat Talento", classe: "MEDIUM", eurMese: 848.54, kmExtra: 0.10, franchigiaDanni: 450, franchigiaFurto: 1700 },
      { gruppo: "KMIZ", modello: "Nissan Primastar, serratura di sicurezza", classe: "MEDIUM", eurMese: 912.34, kmExtra: 0.10, franchigiaDanni: 450, franchigiaFurto: 1700 },
      { gruppo: "KPPW", modello: "Piaggio Porter", classe: "SMALL", eurMese: 957, kmExtra: 0.10, franchigiaDanni: 450, franchigiaFurto: 1700 },
      { gruppo: "VMIA", modello: "Fiat Ducato 33", classe: "LARGE", eurMese: 1046.32, kmExtra: 0.12, franchigiaDanni: 500, franchigiaFurto: 1800 },
      { gruppo: "VMIZ", modello: "Renault Master, serrature di sicurezza", classe: "LARGE", eurMese: 1097.36, kmExtra: 0.12, franchigiaDanni: 500, franchigiaFurto: 2200 },
      { gruppo: "VGIA", modello: "Fiat Ducato 35", classe: "LARGE", eurMese: 1154.78, kmExtra: 0.12, franchigiaDanni: 500, franchigiaFurto: 2200 },
      { gruppo: "VGIZ", modello: "Fiat Ducato 35, serrature di sicurezza", classe: "LARGE", eurMese: 1371.7, kmExtra: 0.12, franchigiaDanni: 500, franchigiaFurto: 2200 },
      { gruppo: "TMBA", modello: "Mercedes Sprinter 514 CDI", classe: "XL", eurMese: 1531.2, kmExtra: 0.14, franchigiaDanni: 500, franchigiaFurto: 2500 },
      { gruppo: "TMBW", modello: "Iveco Daily 35C14, sponda idraulica", classe: "XL", eurMese: 1658.8, kmExtra: 0.14, franchigiaDanni: 500, franchigiaFurto: 2500 },
      { gruppo: "TMBZ", modello: "Mercedes Sprinter 514 CDI, serrature di sicurezza", classe: "XL", eurMese: 1658.8, kmExtra: 0.14, franchigiaDanni: 500, franchigiaFurto: 2500 },
      { gruppo: "KGIX", modello: "Fiat Doblò Winter", classe: "SMALL", eurMese: 933.02, kmExtra: 0.10, franchigiaDanni: 450, franchigiaFurto: 1700, note: "gomme invernali" },
      { gruppo: "KMIX", modello: "Fiat Talento Winter", classe: "MEDIUM", eurMese: 1022.34, kmExtra: 0.10, franchigiaDanni: 450, franchigiaFurto: 1700, note: "gomme invernali" },
      { gruppo: "KMIM", modello: "Fiat Ducato Winter, serrature di sicurezza", classe: "LARGE", eurMese: 1207.36, kmExtra: 0.10, franchigiaDanni: 450, franchigiaFurto: 1700, note: "gomme invernali" },
      { gruppo: "VGIX", modello: "Mercedes Sprinter Winter", classe: "XL", eurMese: 1481.7, kmExtra: 0.12, franchigiaDanni: 500, franchigiaFurto: 2200, note: "gomme invernali" },
      { gruppo: "VGIM", modello: "Mercedes Sprinter 514 Winter, serrature di sicurezza", classe: "XL", eurMese: 1768.8, kmExtra: 0.14, franchigiaDanni: 500, franchigiaFurto: 2500, note: "gomme invernali" },
    ],
  },
  {
    id: "amicoblu-2026", fornitore: "Avis (Amicoblu)", titolo: "Tariffe speciali furgoni, rinnovo 2026", fonte: "Rinnovo_2026_PROFESSIONAL_SOLUTIONS_SRL (12/02/2026)", data: "2026-02-12", validoAl: null,
    uso: "Flessibile in rampa peak: permette il no-show. Prenotazioni con il codice cliente MCD.",
    condizioni: ["150 km/giorno inclusi", "riduzione danni (CDW), furto/incendio (TP) e SKO inclusi", "nolo mensile da 28 a 150 giorni, rinnovabile di 30 (max 180)", "variazioni con 30 giorni di preavviso, adeguamento ISTAT", "in fattura (consolidato YTD ott 2026) ogni canone è il listino + 2,14 €: I 859,50 · A 948,82 · B 1.093,88 · C 1.118,75; i Ducato DLO4 a 1.140,25 non tornano con nessun gruppo"],
    voci: [
      { gruppo: "J", modello: "furgone piccolo", classe: "SMALL", eurMese: 807.62, kmExtra: 0.10 },
      { gruppo: "Q2", modello: "van piccolo (classe Doblò)", classe: "SMALL", eurMese: 832.49, kmExtra: 0.10 },
      { gruppo: "QM", modello: "van piccolo maxi", classe: "SMALL", eurMese: 814.49, kmExtra: 0.10 },
      { gruppo: "I", modello: "van medio (Talento / Trafic)", classe: "MEDIUM", eurMese: 857.36, kmExtra: 0.11 },
      { gruppo: "IL", modello: "van medio passo lungo", classe: "MEDIUM", eurMese: 943.10, kmExtra: 0.11 },
      { gruppo: "A", modello: "van grande (classe Ducato)", classe: "LARGE", eurMese: 946.68, kmExtra: 0.13 },
      { gruppo: "AL", modello: "van grande passo lungo", classe: "LARGE", eurMese: 1041.35, kmExtra: 0.13 },
      { gruppo: "EP", modello: "van grande", classe: "LARGE", eurMese: 1041.35, kmExtra: 0.14 },
      { gruppo: "B", modello: "van grande", classe: "LARGE", eurMese: 1091.74, kmExtra: 0.14 },
      { gruppo: "BL", modello: "van grande passo lungo", classe: "LARGE", eurMese: 1200.91, kmExtra: 0.14 },
      { gruppo: "C", modello: "van XL", classe: "XL", eurMese: 1116.61, kmExtra: 0.16 },
      { gruppo: "CM", modello: "van XL grande", classe: "XL", eurMese: 1372.69, kmExtra: 0.19 },
      { gruppo: "G", modello: "van XL grande", classe: "XL", eurMese: 1435.43, kmExtra: 0.21 },
      { gruppo: "E", modello: "furgone XL", classe: "XL", eurMese: 1207.81, kmExtra: 0.17 },
      { gruppo: "K", modello: "furgone XL", classe: "XL", eurMese: 1365.34, kmExtra: 0.19 },
      { gruppo: "K2", modello: "furgone XL", classe: "XL", eurMese: 1595.24, kmExtra: 0.22 },
      { gruppo: "X", modello: "furgone XL", classe: "XL", eurMese: 1595.24, kmExtra: 0.22 },
      { gruppo: "CX", modello: "furgone XL", classe: "XL", eurMese: 1323.88, kmExtra: 0.19 },
    ],
  },
  {
    id: "amicoblu-elettrico", fornitore: "Avis (Amicoblu)", titolo: "Speciale furgoni elettrici", fonte: "AVIS_ELETTRICO nuova offerta (04/02/2026)", data: "2026-02-04", validoAl: null,
    uso: "Offerta da firmare entro 60 giorni dalla data: verificare se è stata accettata.",
    condizioni: ["km illimitati fino a 27 giorni; nel mese 6.000 km inclusi", "CDW, TP, guide aggiuntive e young driver inclusi", "SKO 182 €/mese, STP 168 €/mese, SSP 217 €/mese (facoltative)"],
    voci: [{ gruppo: "EAE", modello: "furgone elettrico", classe: "MEDIUM", eurMese: 926.64, kmInclusi: "6.000 km/mese", note: "giorno extra 30,89 €" }],
  },
  {
    id: "hertz", fornitore: "Hertz", titolo: "Furgoni", fonte: "Passaggio di consegne mezzi, foglio Tariffe", data: "2026-05-15", validoAl: null, uso: "Standard.", condizioni: [],
    voci: [
      { gruppo: "A4", modello: "Fiat Doblò Cargo", classe: "SMALL", eurMese: 700 },
      { gruppo: "B4", modello: "Ford Transit Custom", classe: "MEDIUM", eurMese: 750 },
      { gruppo: "C4", modello: "Ford Transit Custom L2H2", classe: "MEDIUM", eurMese: 850 },
      { gruppo: "D4", modello: "Ford Transit 350L", classe: "LARGE", eurMese: 940 },
      { gruppo: "E4", modello: "Iveco Daily 20 m³", classe: "XL", eurMese: 1175 },
      { gruppo: "N4", modello: "Ford Transit 350 L4H3", classe: "XL", eurMese: 1200 },
    ],
  },
  {
    id: "noleggiare", fornitore: "Noleggiare", titolo: "Furgoni", fonte: "Passaggio di consegne mezzi, foglio Tariffe", data: "2026-05-15", validoAl: null, uso: "Standard. Due referenti.", condizioni: [],
    voci: [
      { gruppo: "Z0", modello: "Ford Courier", classe: "SMALL", eurMese: 660 },
      { gruppo: "Z1", modello: "Ford Connect L1H1", classe: "SMALL", eurMese: 735 },
      { gruppo: "Z1A", modello: "Doblò XL / Connect L2H1", classe: "SMALL", eurMese: 772 },
      { gruppo: "Z2", modello: "Scudo / Trafic", classe: "MEDIUM", eurMese: 930 },
      { gruppo: "Z2A", modello: "Ducato L1H1", classe: "LARGE", eurMese: 960 },
      { gruppo: "Z3", modello: "Ducato L2H2 / Master L2H2", classe: "LARGE", eurMese: 1005 },
      { gruppo: "Z3A", modello: "Ducato L3H2 / Master L3H2", classe: "LARGE", eurMese: 1116 },
      { gruppo: "Z4GV", modello: "Ducato Box 20 m³", classe: "XL", eurMese: 1363 },
    ],
  },
  {
    id: "locauto", fornitore: "Locauto", titolo: "Furgoni VAN200", fonte: "Passaggio di consegne mezzi, foglio Tariffe", data: "2026-05-15", validoAl: null,
    uso: "Attenzione: VAN200 = massimo 200 km al giorno, non adatto alle tratte lunghe.", condizioni: ["limite 200 km/giorno"],
    voci: [
      { gruppo: "EKMD", modello: "Fiat Doblò Cargo Maxi", classe: "SMALL", eurMese: 824 },
      { gruppo: "CKMD", modello: "Fiat Talento passo corto", classe: "MEDIUM", eurMese: 904 },
      { gruppo: "IKMD", modello: "VW Transporter L", classe: "MEDIUM", eurMese: 962 },
      { gruppo: "SKMD", modello: "Fiat Ducato L2H2", classe: "LARGE", eurMese: 1058 },
      { gruppo: "FKMD", modello: "Fiat Ducato L3H2", classe: "LARGE", eurMese: 1165 },
      { gruppo: "ZL", modello: "L4H3 super lungo", classe: "XL", eurMese: 1290 },
    ],
  },
  {
    id: "autovia", fornitore: "Autovia", titolo: "Furgoni", fonte: "Passaggio di consegne mezzi, foglio Tariffe", data: "2026-05-15", validoAl: null, uso: "Standard.",
    condizioni: ["da fine settembre 2026 Autovia fattura 1.020 €/mese per ogni furgone, qualunque modello (consolidato YTD ott 2026): più del listino; a dicembre 2025 erano 900 €", "franchigia danni fatturata: 422 €"],
    voci: [
      { gruppo: "KPIA", modello: "Fiat Doblò", classe: "SMALL", eurMese: 860 },
      { gruppo: "KMIA", modello: "Fiat Talento", classe: "MEDIUM", eurMese: 900 },
      { gruppo: "VMIA", modello: "Fiat Ducato", classe: "LARGE", eurMese: 980 },
      { gruppo: "VGIA", modello: "Fiat Ducato Maxi", classe: "LARGE", eurMese: 1235 },
    ],
  },
  {
    id: "nolo-experience", fornitore: "Nolo Experience (NoloWay)", titolo: "Furgoni rampa natale", fonte: "Passaggio di consegne mezzi, foglio Tariffe", data: "2026-05-15", validoAl: null,
    uso: "Solo rampa natalizia: tariffe più alte, fornitore nuovo.", condizioni: [],
    voci: [
      { gruppo: "Z1", modello: "Fiorino / Panda Van", classe: "SMALL", eurMese: 662 },
      { gruppo: "Z2", modello: "Doblò / Berlingo", classe: "SMALL", eurMese: 719 },
      { gruppo: "Z3", modello: "Talento / Jumpy", classe: "MEDIUM", eurMese: 931 },
      { gruppo: "ZA", modello: "Ducato CH1 / Jumper", classe: "LARGE", eurMese: 951 },
      { gruppo: "ZB", modello: "Ducato MH2 / Jumper MH2", classe: "LARGE", eurMese: 993 },
      { gruppo: "ZC", modello: "Ducato LH2 / Jumper LH2", classe: "LARGE", eurMese: 1127 },
      { gruppo: "ZG", modello: "Ducato centina 20 m³", classe: "XL", eurMese: 1241 },
    ],
  },
  {
    id: "torental", fornitore: "Torental", titolo: "Motrici GLS", fonte: "Passaggio di consegne mezzi, foglio Tariffe", data: "2026-05-15", validoAl: null,
    uso: "Solo motrici di GLS Castel Maggiore.", condizioni: [],
    voci: [{ gruppo: "Motrice", modello: "Motrice GLS", classe: "MOTRICE", eurMese: 2500 }],
  },
];

/** Miglior prezzo per classe tra i listini validi alla data (scaduti esclusi). */
export function migliorPerClasse(oggi: string, listini = LISTINI) {
  const out: Partial<Record<Classe, { fornitore: string; gruppo: string; modello: string; eurMese: number }>> = {};
  for (const l of listini) {
    if (l.validoAl && l.validoAl < oggi) continue;
    if (/rampa natal/i.test(l.uso)) continue; // solo per i picchi
    for (const v of l.voci) {
      const b = out[v.classe];
      if (!b || v.eurMese < b.eurMese) out[v.classe] = { fornitore: l.fornitore, gruppo: v.gruppo, modello: v.modello, eurMese: v.eurMese };
    }
  }
  return out;
}
