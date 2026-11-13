/**
 * Tour di benvenuto: le tappe si costruiscono dal menu del ruolo (src/components/navModel.ts), così chi entra
 * vede spiegate solo le sezioni che può aprire e il tour non resta indietro quando il menu cambia.
 * Modulo condiviso server/client: nessuna dipendenza da server.
 */
import type { Role } from "@prisma/client";
import { menuPer } from "@/components/navModel";
import { can } from "@/lib/rbac";

/** Cambia la versione per riproporre il tour a tutti (es. dopo un cambio grosso del sito). */
export const TOUR_VERSIONE = "v1";
/** La chiave contiene il ruolo: chi cambia ruolo (es. da Stagista ad Admin) rivede il tour del nuovo ruolo. */
export const chiaveTour = (role: Role) => `benvenuto-${TOUR_VERSIONE}:${role}`;
/** Il tour parte dalla Home: lo hanno i ruoli che la vedono. */
export const haTour = (role: Role) => can({ role }, "home.view");

export type PassoTour = {
  id: string;
  /** valore di data-tour dell'elemento da illuminare; null = riquadro al centro */
  bersaglio: string | null;
  titolo: string;
  testo: string[];
  /** riga "Quando si usa" */
  quando?: string;
  /** se l'elemento non c'è in pagina (es. nessun avviso) la tappa si salta */
  facoltativo?: boolean;
  tipo?: "benvenuto" | "dato" | "fine";
};

const RUOLO: Partial<Record<Role, { nome: string; cosa: string }>> = {
  ADMIN: { nome: "Admin", cosa: "vedi tutto il sito e puoi modificarlo, compresi utenti e impostazioni" },
  CONTROLLO: { nome: "Controllo presenze", cosa: "lavori su presenze, costi, fatture e spese dei mezzi" },
};

type Voci = Set<string>;
const GRUPPO: Record<string, (v: Voci) => { titolo: string; testo: string[]; quando: string }> = {
  flotta: (v) => ({
    titolo: "Flotta: i furgoni",
    testo: ["Qui sai dove si trova ogni targa, quanto costa di canone e quali furgoni stanno arrivando.", "Ci sono anche le officine autorizzate" + (v.has("/vehicles/listini") ? " e i listini dei noleggiatori." : ".")],
    quando: v.has("/vehicles/aggiorna") ? "Quando cambia la flotta: carichi la Lista Targhe e il sito si aggiorna." : "Quando ti serve sapere dov'è un furgone.",
  }),
  personale: (v) => ({
    titolo: "Personale: presenze e costi",
    testo: ["Presenze è il controllo delle giornate dei driver. Costi del personale è la stima di fine mese e il confronto con il consuntivo.", ...(v.has("/telefoni") ? ["Qui trovi anche i Costi GLS e le dotazioni: Telefoni e SIM."] : [])],
    quando: "Ogni settimana per le presenze, a chiusura del mese per i costi.",
  }),
  amazon: (v) => ({
    titolo: "Amazon: fatture e rotte",
    testo: ["Le fatture che Amazon ci paga: si importano i PDF e si allineano al file ufficiale.", ...(v.has("/fatture-amazon/fatturato") ? ["Da lì nascono il fatturato per station, i rimborsi e il confronto con il forecast delle rotte."] : [])],
    quando: "Ogni lunedì.",
  }),
  spese: () => ({
    titolo: "Spese mezzi: Telepass e carburante",
    testo: ["Trascini il file Telepass e l'export Q8: il sito divide pedaggi e carburante per station e ti dà l'Excel pronto."],
    quando: "A inizio mese.",
  }),
  aiuto: (v) => ({
    titolo: "Aiuto: quando hai un dubbio",
    testo: ["Il Vademecum spiega ogni procedura passo per passo. Il Glossario traduce le sigle del lavoro: DSP, CDC, SIC, ADIT e le altre.", ...(v.has("/home?tour=1") ? ["Da qui puoi anche rifare questo tour."] : [])],
    quando: "Ogni volta che non sai come si fa una cosa.",
  }),
  gestione: () => ({
    titolo: "Gestione: solo per Admin",
    testo: ["Crei gli utenti e scegli il loro ruolo, cioè cosa vedono. In Audit c'è il registro di chi ha fatto cosa, e quando."],
    quando: "Di rado: quando entra una persona nuova o cambia un'impostazione.",
  }),
};

/**
 * Tappe del tour per un ruolo. `promosso` = il ruolo è stato appena cambiato da un Admin.
 * Ordine: benvenuto → Home (da fare, avvisi) → menu → una tappa per sezione → il "?" → account → fine.
 */
export function passiTour({ role, nome, promosso = false }: { role: Role; nome: string; promosso?: boolean }): PassoTour[] {
  if (!haTour(role)) return [];
  const gruppi = menuPer(role);
  const voci: Voci = new Set(gruppi.flatMap((g) => g.items.map((i) => i.href)));
  const r = RUOLO[role];
  const altreHome = (gruppi.find((g) => g.id === "home")?.items ?? []).filter((i) => i.href !== "/home").map((i) => i.label);

  const sezioni: PassoTour[] = gruppi.filter((g) => g.id !== "home" && GRUPPO[g.id]).map((g) => ({ id: `gruppo-${g.id}`, bersaglio: `gruppo-${g.id}`, ...GRUPPO[g.id](voci) }));

  const centrali: PassoTour[] = [
    { id: "dafare", bersaglio: "dafare", titolo: "Da fare: parti sempre da qui", testo: ["Ogni lavoro ricorrente è una scheda con i suoi passi: le fatture del lunedì, le presenze, Telepass, i costi di fine mese.", "Le schede si aggiornano da sole con quello che carichi. Premi Vai e arrivi dritto al passo da fare."] },
    { id: "avvisi", bersaglio: "avvisi", facoltativo: true, titolo: "Avvisi: cose da non dimenticare", testo: ["Qui compare quello che sta per scadere o che manca: una tariffa che cambia, un file troppo vecchio.", "In rosso le cose urgenti. Apri ti porta dove si sistema."] },
    { id: "menu", bersaglio: "menu", titolo: "Il menu", testo: ["Il sito è diviso in sezioni per tema. Da computer sono in alto; da telefono le prime sono nella barra in basso e il resto è in Menu.", ...(altreHome.length ? [`Sotto Home trovi anche: ${altreHome.join(" e ")}.`] : []), "Ora le guardiamo una per una."] },
    ...sezioni,
    { id: "dato", bersaglio: null, tipo: "dato", titolo: "Il ? e dove finisce il dato", testo: ["Accanto ai pulsanti importanti c'è un ?: dice cosa fa il pulsante, cosa controllare prima e dove finisce il dato.", "Due sicurezze: se esci con un risultato non salvato il sito ti avvisa, e un file già caricato viene riconosciuto senza creare doppioni."] },
    { id: "account", bersaglio: "account", titolo: "Il tuo account", testo: ["Da qui cambi la password che ti è stata data: fallo al primo accesso.", "Il pulsante a fianco serve per uscire."] },
  ];

  return [
    {
      id: "benvenuto", bersaglio: null, tipo: "benvenuto", titolo: `Ciao ${nome}, ti do il benvenuto`,
      testo: [
        "Questo è il sito con cui Professional Solutions segue il lavoro per Amazon e GLS: furgoni, persone, fatture e spese, tutto in un posto.",
        ...(r ? [`${promosso ? "Da oggi hai" : "Hai"} il ruolo ${r.nome}: ${r.cosa}.`] : []),
        "Ti faccio fare un tour di circa 3 minuti. Puoi fermarti quando vuoi e rifarlo dal menu Aiuto.",
      ],
    },
    ...centrali,
    { id: "fine", bersaglio: null, tipo: "fine", titolo: "Fatto: ora tocca a te", testo: ["Tre cose per cominciare bene:"] },
  ];
}
