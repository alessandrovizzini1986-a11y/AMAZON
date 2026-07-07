/**
 * Seed demo — dati FITTIZI realistici (nessun dato aziendale reale).
 * 7 stazioni cluster, ~36 veicoli, utenti nei 3 ruoli, storici completi.
 * Password iniziali: admin da SEED_ADMIN_PASSWORD (.env), altri utenti "demo1234".
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// PRNG deterministico per dati riproducibili
let seedState = 42;
function rnd() {
  seedState = (seedState * 1103515245 + 12345) % 2 ** 31;
  return seedState / 2 ** 31;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function int(min: number, max: number) {
  return Math.floor(rnd() * (max - min + 1)) + min;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

const STATIONS = [
  { code: "DML1", name: "Milano Est", address: "Via Emilia 12, Segrate (MI)" },
  { code: "DML2", name: "Milano Sud", address: "Strada Provinciale 40, Opera (MI)" },
  { code: "DBG1", name: "Bergamo", address: "Via delle Industrie 8, Grassobbio (BG)" },
  { code: "DBS1", name: "Brescia", address: "Via Fascia d'Oro 15, Castenedolo (BS)" },
  { code: "DPV1", name: "Pavia", address: "Via dei Longobardi 3, San Martino (PV)" },
  { code: "DVA1", name: "Varese", address: "Via Piemonte 21, Gallarate (VA)" },
  { code: "DCO1", name: "Como", address: "Via Scalabrini 44, Grandate (CO)" },
];

const MODELS = [
  { modello: "Fiat Ducato L2H2", canone: [36, 42] },
  { modello: "Mercedes Sprinter 314", canone: [44, 52] },
  { modello: "Ford Transit L3H2", canone: [40, 47] },
  { modello: "Iveco Daily 35S14", canone: [42, 50] },
  { modello: "Renault Master L2H2", canone: [38, 45] },
  { modello: "VW Crafter 35", canone: [43, 49] },
];

const LEASING = ["Ayvens", "Leasys", "ALD Automotive", "Arval"];
const OFFICINE = ["Autofficina Bianchi Srl", "CarService Lombardia", "Officina F.lli Colombo", "TruckPoint Milano", "MB Service Bergamo"];
const NOMI = ["Marco", "Luca", "Andrea", "Alessandro", "Davide", "Simone", "Matteo", "Francesco", "Stefano", "Giorgio", "Fabio", "Paolo", "Ahmed", "Youssef", "Ionut", "Adrian", "Omar", "Karim", "Daniele", "Roberto", "Gianluca", "Nicola", "Emanuele", "Salvatore"];
const COGNOMI = ["Rossi", "Ferrari", "Russo", "Bianchi", "Romano", "Gallo", "Costa", "Fontana", "Conti", "Esposito", "Ricci", "Bruno", "De Luca", "Moretti", "Marino", "Greco", "Barbieri", "Lombardi", "Giordano", "Colombo", "Mancini", "Longo", "Leone", "Martinelli"];
const VIOLAZIONI = [
  { tipo: "Eccesso velocità oltre 10 km/h", importo: [42, 173], punti: 3 },
  { tipo: "Sosta vietata", importo: [42, 87], punti: 0 },
  { tipo: "Accesso ZTL non autorizzato", importo: [83, 83], punti: 0 },
  { tipo: "Semaforo rosso", importo: [167, 167], punti: 6 },
  { tipo: "Uso cellulare alla guida", importo: [165, 165], punti: 5 },
  { tipo: "Corsia riservata", importo: [83, 83], punti: 0 },
];

function targa(i: number): string {
  const L = "ABCDEFGHJKLMNPRSTVWXYZ";
  return `G${L[i % 22]}${String(100 + i).slice(-3)}${L[(i * 7) % 22]}${L[(i * 13) % 22]}`;
}

async function main() {
  console.log("Seed: pulizia database…");
  // ordine rispettoso delle FK
  await db.auditLog.deleteMany();
  await db.importJob.deleteMany().catch(() => {});
  await db.fuelTransaction.deleteMany();
  await db.tollTransaction.deleteMany();
  await db.fuelCard.deleteMany();
  await db.damage.deleteMany();
  await db.replacementCase.deleteMany();
  await db.stationTransfer.deleteMany();
  await db.assignment.deleteMany();
  await db.fine.deleteMany();
  await db.serviceRecord.deleteMany();
  await db.vehicleStationHistory.deleteMany();
  await db.vehicle.deleteMany();
  await db.user.deleteMany();
  await db.station.deleteMany();
  await db.appConfig.deleteMany();

  console.log("Seed: configurazione…");
  const configs = [
    { key: "maint.alert.giorni", value: "[30,15,7]", type: "number[]", description: "Soglie alert tagliando/revisione in giorni prima della scadenza" },
    { key: "maint.alert.km", value: "[1000,500,100]", type: "number[]", description: "Soglie alert tagliando in km prima della soglia" },
    { key: "fine.ricorso.prefetto.giorni", value: "60", type: "number", description: "Giorni dalla notifica per ricorso al Prefetto" },
    { key: "fine.ricorso.gdp.giorni", value: "30", type: "number", description: "Giorni dalla notifica per ricorso al Giudice di Pace" },
    { key: "replacement.alert.giorniSenzaRisposta", value: "15", type: "number", description: "Giorni oltre i quali una pratica sostitutivo inviata senza risposta va in alert" },
    { key: "fuel.consumo.atteso.l100km", value: "11", type: "number", description: "Consumo atteso di riferimento (litri/100km) per la riconciliazione carburante" },
    { key: "fuel.consumo.tolleranza", value: "0.25", type: "number", description: "Tolleranza (frazione) oltre il consumo atteso prima di segnalare anomalia" },
  ];
  for (const c of configs) await db.appConfig.create({ data: c });

  console.log("Seed: stazioni…");
  const stations = [];
  for (const s of STATIONS) stations.push(await db.station.create({ data: s }));

  console.log("Seed: utenti…");
  const adminPwd = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "admin1234", 10);
  const demoPwd = await bcrypt.hash("demo1234", 10);

  const admin = await db.user.create({
    data: {
      email: "admin@fleetdsp.demo",
      passwordHash: adminPwd,
      firstName: "Alessandro",
      lastName: "Fleet Manager",
      role: "ADMIN",
    },
  });

  const respByStation = new Map<string, string>();
  const driversByStation = new Map<string, { id: string; email: string }[]>();
  let personIdx = 0;
  for (const st of stations) {
    const nome = NOMI[personIdx % NOMI.length];
    const cognome = COGNOMI[personIdx % COGNOMI.length];
    personIdx++;
    const resp = await db.user.create({
      data: {
        email: `resp.${st.code.toLowerCase()}@fleetdsp.demo`,
        passwordHash: demoPwd,
        firstName: nome,
        lastName: cognome,
        role: "RESP_MEZZI",
        stationId: st.id,
        phone: `+39 33${int(10000000, 99999999)}`,
      },
    });
    respByStation.set(st.id, resp.id);

    const drivers = [];
    const nDrivers = int(3, 5);
    for (let i = 0; i < nDrivers; i++) {
      const dn = NOMI[personIdx % NOMI.length];
      const dc = COGNOMI[(personIdx * 3 + i) % COGNOMI.length];
      personIdx++;
      const drv = await db.user.create({
        data: {
          email: `${dn.toLowerCase()}.${dc.toLowerCase().replace(/\s/g, "")}.${st.code.toLowerCase()}@fleetdsp.demo`,
          passwordHash: demoPwd,
          firstName: dn,
          lastName: dc,
          role: "DRIVER",
          stationId: st.id,
          licenseNo: `U1${int(100000000, 999999999)}`,
          phone: `+39 34${int(10000000, 99999999)}`,
        },
      });
      drivers.push({ id: drv.id, email: drv.email });
    }
    driversByStation.set(st.id, drivers);
  }

  console.log("Seed: veicoli…");
  const vehicles: { id: string; targa: string; stationId: string; canone: number; km: number }[] = [];
  let vIdx = 0;
  for (const st of stations) {
    const nVehicles = int(4, 6);
    for (let i = 0; i < nVehicles; i++) {
      const model = pick(MODELS);
      const canone = int(model.canone[0], model.canone[1]) + 0.5;
      const km = int(15000, 140000);
      const isHvo = rnd() < 0.3;
      // distribuiamo gli stati del scadenzario: alcuni ok, alcuni in warn, alcuni scaduti
      const tagliandoBucket = rnd();
      const tagliandoData =
        tagliandoBucket < 0.15 ? daysAgo(int(1, 20)) // scaduto
        : tagliandoBucket < 0.35 ? daysFromNow(int(3, 25)) // in alert
        : daysFromNow(int(40, 180)); // ok
      const tagliandoKm = tagliandoBucket < 0.5 ? km + int(50, 900) : km + int(2000, 15000);
      const revBucket = rnd();
      const revisione =
        revBucket < 0.08 ? daysAgo(int(1, 40))
        : revBucket < 0.2 ? daysFromNow(int(5, 28))
        : daysFromNow(int(60, 700));

      const v = await db.vehicle.create({
        data: {
          targa: targa(vIdx++),
          modello: model.modello,
          allestimento: pick(["Furgone", "Furgone maxi", "Van cargo"]),
          alimentazione: isHvo ? "DIESEL_HVO" : "DIESEL",
          hvoCompatibile: isHvo,
          immatricolazione: daysAgo(int(200, 1400)),
          stationId: st.id,
          stato: rnd() < 0.88 ? "ATTIVO" : rnd() < 0.5 ? "IN_OFFICINA" : "SOSTITUTIVO",
          kmAttuali: km,
          canoneGiorno: canone,
          leasingCompany: pick(LEASING),
          contrattoLeasingNo: `NLT-${int(10000, 99999)}`,
          prossimoTagliandoData: tagliandoData,
          prossimoTagliandoKm: tagliandoKm,
          prossimaRevisione: revisione,
          stationHistory: { create: { stationId: st.id, fromDate: daysAgo(int(100, 400)), note: "assegnazione iniziale" } },
        },
      });
      vehicles.push({ id: v.id, targa: v.targa, stationId: st.id, canone, km });
    }
  }

  console.log("Seed: storico interventi…");
  for (const v of vehicles) {
    const n = int(1, 4);
    for (let i = 0; i < n; i++) {
      const data = daysAgo(int(30, 500));
      await db.serviceRecord.create({
        data: {
          vehicleId: v.id,
          tipo: pick(["TAGLIANDO", "TAGLIANDO", "RIPARAZIONE", "GOMME", "REVISIONE"]),
          officina: pick(OFFICINE),
          data,
          kmIntervento: Math.max(1000, v.km - int(5000, 60000)),
          costo: int(120, 1400) + 0.9,
          descrizione: pick(["Tagliando completo con filtri", "Sostituzione pastiglie freni", "Cambio gomme stagionale", "Revisione ministeriale", "Sostituzione frizione", null as unknown as string]),
        },
      });
    }
  }

  console.log("Seed: movimentazioni (ultimi 30 giorni)…");
  const assignmentLog: { vehicleId: string; driverId: string; date: Date }[] = [];
  for (const v of vehicles) {
    const drivers = driversByStation.get(v.stationId)!;
    let kmCursor = Math.max(1000, v.km - 3500);
    for (let d = 30; d >= 1; d--) {
      if (rnd() < 0.28) continue; // giorni senza uscita
      const date = daysAgo(d);
      const driver = pick(drivers);
      const kmDay = int(60, 190);
      const checkIn = new Date(date);
      checkIn.setHours(6, int(15, 55));
      const checkOut = new Date(date);
      checkOut.setHours(15 + int(0, 3), int(0, 59));
      await db.assignment.create({
        data: {
          date,
          vehicleId: v.id,
          driverId: driver.id,
          stationId: v.stationId,
          checkInAt: checkIn,
          checkInKm: kmCursor,
          checkOutAt: d === 1 && rnd() < 0.3 ? null : checkOut,
          checkOutKm: d === 1 && rnd() < 0.3 ? null : kmCursor + kmDay,
          danniRilevati: rnd() < 0.05 ? "Graffio paraurti posteriore" : null,
        },
      });
      assignmentLog.push({ vehicleId: v.id, driverId: driver.id, date });
      kmCursor += kmDay;
    }
  }

  console.log("Seed: multe…");
  for (let i = 0; i < 40; i++) {
    const v = pick(vehicles);
    const viol = pick(VIOLAZIONI);
    const daysBack = int(2, 60);
    const dataInfr = daysAgo(daysBack);
    dataInfr.setHours(int(7, 17), int(0, 59));
    // conducente dal log movimentazione se esiste per quel giorno
    const match = assignmentLog.find(
      (a) => a.vehicleId === v.id && a.date.toDateString() === new Date(dataInfr.getFullYear(), dataInfr.getMonth(), dataInfr.getDate()).toDateString()
    );
    const notificata = rnd() < 0.75;
    const dataNotifica = notificata ? daysAgo(Math.max(0, daysBack - int(10, 25))) : null;
    const stati = ["NOTIFICATA", "NOTIFICATA", "PAGATA", "RICORSO"] as const;
    await db.fine.create({
      data: {
        vehicleId: v.id,
        verbaleNo: `VB-2026-${int(10000, 99999)}`,
        dataOraInfrazione: dataInfr,
        luogo: pick(["Milano, Via Ripamonti", "Segrate, SP103", "Bergamo, Circonvallazione", "Brescia, Via Volta", "Tangenziale Est MI", "A4 km 148", "Pavia, Viale Partigiani"]),
        tipoViolazione: viol.tipo,
        importo: int(viol.importo[0], viol.importo[1]),
        puntiPatente: viol.punti,
        stato: notificata ? pick([...stati]) : "DA_NOTIFICARE",
        dataNotifica,
        driverId: match?.driverId ?? null,
        assegnazioneFonte: match ? `assegnazione giornaliera del ${match.date.toISOString().slice(0, 10)}` : null,
        riaddebito: match && viol.punti === 0 && rnd() < 0.5 ? "DA_ADDEBITARE" : "NON_PREVISTO",
      },
    });
  }

  console.log("Seed: pratiche sostitutivo…");
  const casesData = [
    { back: 45, ricevuto: 40, rientro: 20, stato: "CONFERMATA" },
    { back: 60, ricevuto: null, rientro: 48, stato: "INVIATA" },
    { back: 35, ricevuto: 30, rientro: null, stato: "INVIATA" },
    { back: 25, ricevuto: null, rientro: null, stato: "APERTA" },
    { back: 90, ricevuto: 82, rientro: 60, stato: "CONTESTATA" },
    { back: 12, ricevuto: 10, rientro: null, stato: "APERTA" },
    { back: 55, ricevuto: null, rientro: 40, stato: "CONFERMATA" },
  ] as const;
  for (let i = 0; i < casesData.length; i++) {
    const c = casesData[i];
    const v = vehicles[(i * 5 + 3) % vehicles.length];
    const ingresso = daysAgo(c.back);
    const ricezione = c.ricevuto !== null ? daysAgo(c.ricevuto) : null;
    const rientro = c.rientro !== null ? daysAgo(c.rientro) : null;
    const fine = [ricezione, rientro, new Date()].filter(Boolean).map((x) => (x as Date).getTime());
    const giorni = Math.max(0, Math.round((Math.min(...fine) - ingresso.getTime()) / 86400000));
    const inviata = c.stato !== "APERTA";
    await db.replacementCase.create({
      data: {
        vehicleId: v.id,
        motivo: pick(["INCIDENTE", "GUASTO", "MANUTENZIONE"]),
        dataIngressoOfficina: ingresso,
        centroConvenzionato: pick(OFFICINE),
        replacementVehicleId: ricezione ? pick(vehicles.filter((x) => x.id !== v.id)).id : null,
        dataRicezioneSostitutivo: ricezione,
        dataRientroOriginale: rientro,
        stato: c.stato,
        inviataAt: inviata ? daysAgo(c.back - 5) : null,
        canoneGiornoSnapshot: inviata ? v.canone : null,
        giorniScoperti: inviata ? giorni : null,
        importoStorno: inviata ? Math.round(giorni * v.canone * 100) / 100 : null,
        note: i === 4 ? "Leasing contesta 3 giorni: documentazione officina inviata" : null,
      },
    });
  }

  console.log("Seed: danni…");
  for (let i = 0; i < 10; i++) {
    const v = pick(vehicles);
    const drivers = driversByStation.get(v.stationId)!;
    await db.damage.create({
      data: {
        vehicleId: v.id,
        tipo: pick(["Graffio carrozzeria", "Paraurti danneggiato", "Specchietto rotto", "Parabrezza scheggiato", "Ammaccatura portellone"]),
        data: daysAgo(int(1, 90)),
        descrizione: "Rilevato in fase di check-out",
        responsabilita: pick(["DRIVER", "TERZI", "IGNOTO", "IGNOTO"]),
        reporterId: pick(drivers).id,
        centroRiparazione: rnd() < 0.5 ? pick(OFFICINE) : null,
        praticaAssicurativa: rnd() < 0.3 ? `SIN-${int(100000, 999999)}` : null,
        costoStimato: int(150, 2200),
        chiuso: rnd() < 0.4,
      },
    });
  }

  console.log("Seed: fuel card e transazioni…");
  for (const v of vehicles) {
    const card = await db.fuelCard.create({
      data: { pan: `704310${int(1000000000, 9999999999)}`, vehicleId: v.id },
    });
    const n = int(4, 10);
    for (let i = 0; i < n; i++) {
      const litri = int(35, 75) + 0.5;
      await db.fuelTransaction.create({
        data: {
          fuelCardId: card.id,
          data: daysAgo(int(1, 30)),
          litri,
          importo: Math.round(litri * (1.72 + rnd() * 0.2) * 100) / 100,
          puntoVendita: pick(["Q8 Segrate", "Q8 Opera SP40", "Q8 Grassobbio", "Q8 Castenedolo", "Q8 Gallarate Nord"]),
          prodotto: rnd() < 0.25 ? "HVO" : "DIESEL",
        },
      });
    }
  }

  console.log("Seed: pedaggi…");
  for (const st of stations) {
    const n = int(15, 30);
    for (let i = 0; i < n; i++) {
      await db.tollTransaction.create({
        data: {
          stationId: st.id,
          deviceCode: `TP${int(100000, 999999)}`,
          targa: pick(vehicles.filter((v) => v.stationId === st.id))?.targa,
          data: daysAgo(int(1, 30)),
          tratta: pick(["MI Est → Agrate", "A4 MI-BG", "A51 Tangenziale", "A8 MI-VA", "A35 Brebemi", "A7 MI-PV"]),
          importo: int(2, 14) + 0.4,
        },
      });
    }
  }

  console.log(`Seed completato: ${stations.length} stazioni, ${vehicles.length} veicoli.`);
  console.log("Login demo: admin@fleetdsp.demo / (SEED_ADMIN_PASSWORD) — resp.dml1@fleetdsp.demo / demo1234");
  console.log(`Utente admin: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
