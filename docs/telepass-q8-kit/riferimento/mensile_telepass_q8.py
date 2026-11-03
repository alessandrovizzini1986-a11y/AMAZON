# -*- coding: utf-8 -*-
"""
Formatta gli export mensili Telepass e Q8 come i file di esempio di Alessandro.
USO:
  python mensile_telepass_q8.py telepass <export_telepass.csv> <TBusiness_carica_veicoli.xlsx> <cartella_out>
  python mensile_telepass_q8.py q8       <export_q8.xlsx>      <Censimento_fuel_card.xlsx>     <cartella_out>
Il tipo di file viene comunque riconosciuto dal contenuto (non dal nome):
  - Telepass = CSV ';' con intestazione che inizia per "ID Transazione;ID Codificato"
  - Q8       = Excel con riga intestazione che contiene "PAN Carta" e "N. ticket" (riga 1 o 2)
Mese e anno = dalla colonna Data (mese prevalente).
"""
import sys, os, csv, re, datetime as dt, calendar
import warnings; warnings.filterwarnings("ignore")
import openpyxl
from openpyxl import Workbook
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.utils import get_column_letter as L
from openpyxl.styles import Font

MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"]
STATIONS_ORD = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1", "GLS", "GLS - CASTEL MAGGIORE", "SEDE"]
STATION_STD = set(STATIONS_ORD)

def tabella(ws, nome, ncol, nrow):
    t = Table(displayName=nome, ref=f"A1:{L(ncol)}{max(2, nrow)}")
    t.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True, showFirstColumn=False, showLastColumn=False, showColumnStripes=False)
    ws.add_table(t)

def mese_prevalente(date):
    c = {}
    for d in date:
        if d: c[(d.year, d.month)] = c.get((d.year, d.month), 0) + 1
    return max(c, key=c.get)

def num_it(s):
    if s is None or s == "": return None
    try: return float(str(s).replace(".", "").replace(",", ".")) if re.fullmatch(r"-?\d{1,3}(\.\d{3})*,\d+|-?\d+,\d+", str(s)) else float(str(s).replace(",", "."))
    except ValueError: return s

def is_telepass(path):
    if not path.lower().endswith(".csv"): return False
    with open(path, encoding="utf-8-sig") as fh: return fh.readline().startswith("ID Transazione;ID Codificato")

def is_q8(path):
    if not path.lower().endswith((".xlsx", ".xlsm")): return False
    ws = openpyxl.load_workbook(path).worksheets[0]
    for r in ws.iter_rows(min_row=1, max_row=3, values_only=True):
        v = [str(x) for x in r if x]
        if "PAN Carta" in v and "N. ticket" in v: return True
    return False

# ------------------------------------------------------------------ TELEPASS
def leggi_mappa_telepass(path):
    ws = openpyxl.load_workbook(path, data_only=True)["TELEPASS FINALE"]
    hdr = [str(c.value).strip().upper() if c.value else "" for c in ws[1]]
    it, ist, ipr, ick = hdr.index("TELEPASS"), hdr.index("STATION"), hdr.index("PROGETTO"), hdr.index("CHECK")
    m = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[it] in (None, ""): continue
        k = str(r[it]).strip().split(".")[0]
        m[k] = dict(station=str(r[ist]).strip() if r[ist] else "", progetto=str(r[ipr]).strip() if r[ipr] else "", check=str(r[ick]).strip() if r[ick] else "")
    return m

def telepass(csv_path, tbusiness_path, out_dir):
    with open(csv_path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.reader(fh, delimiter=";"))
    hdr, body = rows[0], [r for r in rows[1:] if any(r)]
    i_data, i_ora, i_imp, i_stato, i_disp = hdr.index("Data"), hdr.index("Orario"), hdr.index("Importo"), hdr.index("Stato"), hdr.index("Codice dispositivo")
    mappa = leggi_mappa_telepass(tbusiness_path)
    date = []
    for r in body:
        try: date.append(dt.datetime.strptime(r[i_data], "%d/%m/%Y"))
        except ValueError: date.append(None)
    anno, mese = mese_prevalente(date)
    out_hdr = hdr[:]; out_hdr[i_stato] = "STATION"; out_hdr.append("WEEK")
    wb = Workbook(); ws = wb.active; ws.title = f"{mese:02d}_Telepass_{MESI[mese]}_{anno}"
    ws.append(out_hdr)
    non_mappati = {}; ricondotti = {}; fuori_mese = 0
    numeric_cols = {hdr.index(c) for c in ("Importo", "Prezzo unitario", "Quantità", "Prezzo", "KM", "Durata") if c in hdr}
    for r, d in zip(body, date):
        if d is None or (d.year, d.month) != (anno, mese): fuori_mese += 1
        disp = r[i_disp].strip()
        info = mappa.get(disp)
        if info is None:
            st = "NON MAPPATO"; non_mappati[disp] = non_mappati.get(disp, 0) + 1
        else:
            st = info["station"]
            if st not in STATION_STD:   # regola confermata: STATION non standard (es. VALERIO, VIZZINI) -> GLS - CASTEL MAGGIORE
                ricondotti[(disp, st)] = ricondotti.get((disp, st), 0) + 1; st = "GLS - CASTEL MAGGIORE"
        vals = []
        for j, v in enumerate(r):
            if j == i_data: vals.append(d)
            elif j == i_ora:
                try: vals.append(dt.datetime.strptime(v, "%H:%M:%S").time())
                except ValueError: vals.append(v)
            elif j == i_stato: vals.append(st)
            elif j in numeric_cols: vals.append(num_it(v))
            elif j == hdr.index("Codice dispositivo") or j == hdr.index("CDC veicolo"):
                vals.append(int(v) if re.fullmatch(r"\d+", v or "") else (v or None))
            else: vals.append(v if v != "" else None)
        vals.append(None)
        ws.append(vals)
    n = ws.max_row
    cW = len(out_hdr)
    for rr in range(2, n + 1):
        ws.cell(rr, cW, "=WEEKNUM(Toll[[#This Row],[Data]])")
        ws.cell(rr, i_data + 1).number_format = "mm-dd-yy"; ws.cell(rr, i_ora + 1).number_format = "h:mm:ss"
    tabella(ws, "Toll", cW, n)
    for col, w in {"A": 16.3, "B": 15, "C": 48.9, "D": 24.6, "E": 9.3, "F": 10.4, "H": 10.3, "I": 20.1, "J": 22, "K": 26.6, "L": 9.7, "M": 13.9, "N": 16, "P": 16, "T": 10, "X": 28, "Y": 28}.items():
        ws.column_dimensions[col].width = w
    # PVT: recap STATION x WEEK a formula (equivalente della pivot "Somma di Importo")
    pv = wb.create_sheet("PVT")
    settimane = sorted({dt.date(anno, mese, g).isocalendar()[1] for g in range(1, calendar.monthrange(anno, mese)[1] + 1)})
    # WEEKNUM Excel (sistema 1, domenica inizio) differisce da ISO: calcolo come Excel
    def weeknum_excel(d):
        jan1 = dt.date(d.year, 1, 1); return (d - jan1).days // 7 + 1 if False else ((d.toordinal() - jan1.toordinal()) + ((jan1.weekday() + 1) % 7)) // 7 + 1
    settimane = sorted({weeknum_excel(dt.date(anno, mese, g)) for g in range(1, calendar.monthrange(anno, mese)[1] + 1)})
    pv["K1"] = "oggetto"; pv["L1"] = f"Transazioni Telepass {anno}"
    pv["A3"] = "Somma di Importo"; pv["B3"] = "Etichette di colonna"
    pv["A4"] = "Etichette di riga"
    for j, w in enumerate(settimane): pv.cell(4, 2 + j, w)
    cT = 2 + len(settimane); pv.cell(4, cT, "Totale complessivo"); pv.cell(4, cT + 2, "RMPP"); pv.cell(4, cT + 3, "ZTL"); pv.cell(4, cT + 4, "TOTALE")
    stazioni = sorted({ws.cell(r, i_stato + 1).value for r in range(2, n + 1)}, key=lambda s: (STATIONS_ORD.index(s) if s in STATIONS_ORD else 99, s))
    r = 5
    for st in stazioni:
        pv.cell(r, 1, st)
        for j, w in enumerate(settimane):
            pv.cell(r, 2 + j, f'=SUMIFS(Toll[Importo],Toll[STATION],$A{r},Toll[WEEK],{L(2 + j)}$4)')
        pv.cell(r, cT, f"=SUM(B{r}:{L(cT - 1)}{r})"); pv.cell(r, cT + 4, f"=-{L(cT)}{r}+{L(cT + 2)}{r}+{L(cT + 3)}{r}")
        r += 1
    pv.cell(r, 1, "Totale complessivo")
    for c in range(2, cT + 1): pv.cell(r, c, f"=SUM({L(c)}5:{L(c)}{r - 1})")
    pv.cell(r, cT + 2, f"=SUM({L(cT + 2)}5:{L(cT + 2)}{r - 1})"); pv.cell(r, cT + 3, f"=SUM({L(cT + 3)}5:{L(cT + 3)}{r - 1})"); pv.cell(r, cT + 4, f"=-{L(cT)}{r}+{L(cT + 2)}{r}+{L(cT + 3)}{r}")
    for c in range(1, cT + 5): pv.cell(4, c).font = Font(bold=True)
    pv.cell(r, 1).font = Font(bold=True); pv.column_dimensions["A"].width = 24
    # righe di raccordo per station (come nel file di esempio, riga 16-17)
    r2 = r + 4; ordine = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"]
    for j, st in enumerate(ordine): pv.cell(r2, 5 + j, st).font = Font(bold=True)
    pv.cell(r2, 12, "TOTALE").font = Font(bold=True)
    for j, st in enumerate(ordine):
        pv.cell(r2 + 1, 5 + j, f'=IFERROR(INDEX({L(cT + 4)}5:{L(cT + 4)}{r - 1},MATCH("{st}",A5:A{r - 1},0)),0)')
    pv.cell(r2 + 1, 12, f"=SUM(E{r2 + 1}:K{r2 + 1})")
    # fogli manuali del mese (vuoti, stessa intestazione dell'esempio)
    z = wb.create_sheet("ztlrimini"); z.append(["ZTL", "TARGA", "DATA RICHIESTA ATTIVAZIONE", "DAL", "AL", "NOTE", "WEEK"])
    m = wb.create_sheet("RMPP"); m.append(["CODICE SOCIETA'", "DATA", "N. RAPPORTO", "TARGA", "DS", "CL.", "ENTRATA ", "ORA ENTRATA", "USCITA", "ORA USCITA", "IMPORTO", "IMPORTO VERSATO", "SPESE FISSE", "SPESE VISURA", "IMPORTO DOVUTO", "EVENTUALE NUMERO PROGRESSIVO"])
    # Anomalie
    an = wb.create_sheet("Anomalie"); an.append(["Tipo", "Chiave", "N. transazioni", "Nota"])
    for k, v in sorted(non_mappati.items(), key=lambda x: -x[1]): an.append(["Telepass non in TELEPASS FINALE", k, v, "aggiungere il dispositivo in TBusiness_carica_veicoli"])
    for (k, st0), v in sorted(ricondotti.items(), key=lambda x: -x[1]):
        an.append(["STATION non standard ricondotta a GLS - CASTEL MAGGIORE", k, v, f"in TELEPASS FINALE STATION = '{st0}' (regola confermata il 3/11/2026)"])
    if fuori_mese: an.append(["Righe fuori dal mese prevalente", "", fuori_mese, f"mese prevalente {MESI[mese]} {anno}"])
    nome = f"{mese:02d}_Telepass_{MESI[mese]}_{anno}.xlsx"
    os.makedirs(out_dir, exist_ok=True); wb.save(os.path.join(out_dir, nome))
    return nome, n - 1, non_mappati, stazioni

# ------------------------------------------------------------------ Q8
def leggi_censimento(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    hdr = [str(c.value).strip() if c.value else "" for c in ws[1]]
    ipan, ids, iag, ibl = hdr.index("PAN"), hdr.index("DS"), hdr.index("AMZ/GLS"), hdr.index("Bloccata")
    inom = hdr.index("Nominativo driver (dato personale)")
    m = {}; by_ident = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r[ipan]: continue
        d = dict(ds=str(r[ids]).strip() if r[ids] else "", appalto=str(r[iag]).strip() if r[iag] else "", bloccata=str(r[ibl]).strip() if r[ibl] else "", ident=str(r[inom]).strip().upper() if r[inom] else "")
        m[str(r[ipan]).strip()] = d
        if d["ident"] and d["ds"] and d["ds"].lower() != "da verificare": by_ident.setdefault(d["ident"], d)
    m["__by_ident__"] = by_ident
    return m

def q8(xlsx_path, cens_path, out_dir):
    src = openpyxl.load_workbook(xlsx_path, data_only=True).worksheets[0]
    rows = list(src.iter_rows(values_only=True))
    hr = next(i for i, r in enumerate(rows[:3]) if r and "PAN Carta" in [str(x) for x in r if x])
    hdr = [str(x).strip() if x else "" for x in rows[hr]]; body = [r for r in rows[hr + 1:] if r and any(x not in (None, "") for x in r)]
    fmt_src = {c.column: c.number_format for c in src[hr + 2]}  # formati della prima riga dati
    i_pan, i_data, i_ora, i_ident, i_veic, i_aut = hdr.index("PAN Carta"), hdr.index("Data"), hdr.index("Ora"), hdr.index("Identificativo"), hdr.index("Veicolo"), hdr.index("Codice autista")
    cens = leggi_censimento(cens_path)
    date = [r[i_data] if isinstance(r[i_data], dt.datetime) else None for r in body]
    anno, mese = mese_prevalente(date)
    out_hdr = hdr[:]; out_hdr[i_veic] = "STATION"; out_hdr[i_aut] = "ASSEGNAZION"; out_hdr += ["AMZ", "WEEK"]
    wb = Workbook(); ws = wb.active; ws.title = "Transazioni Q8 Flotte"; ws.append(out_hdr)
    scartate = {}; non_cens = {}; per_ident = {}; tenute = 0
    for r in body:
        ident = str(r[i_ident] or "").strip().upper()
        if not (ident.startswith("AMZ") or ident.startswith("GLS")):
            scartate[ident[:3] or "(vuoto)"] = scartate.get(ident[:3] or "(vuoto)", 0) + 1; continue
        pan = str(r[i_pan] or "").strip(); c = cens.get(pan)
        if c is not None and c["ds"] and c["ds"].lower() != "da verificare": st = c["ds"]
        elif ident in cens["__by_ident__"]:
            st = cens["__by_ident__"][ident]["ds"]; per_ident[(pan, ident, st)] = per_ident.get((pan, ident, st), 0) + 1
        else:
            st = "NON CENSITA"; non_cens[(pan, ident)] = non_cens.get((pan, ident), 0) + 1
        vals = list(r); vals[i_veic] = st; vals[i_aut] = ""; vals += [None, None]
        ws.append(vals); tenute += 1
    n = ws.max_row; cA, cW = len(out_hdr) - 1, len(out_hdr)
    for rr in range(2, n + 1):
        ws.cell(rr, cA, "=LEFT(Q8_[[#This Row],[Identificativo]],3)"); ws.cell(rr, cW, "=WEEKNUM(Q8_[[#This Row],[Data]])")
        ws.cell(rr, i_data + 1).number_format = "mm-dd-yy"; ws.cell(rr, i_ora + 1).number_format = "h:mm:ss"
        for col, f in fmt_src.items():
            if f and f != "General" and col not in (i_data + 1, i_ora + 1): ws.cell(rr, col).number_format = f.replace("#,###0.000", "##,##0.000")
    tabella(ws, "Q8_", cW, n)
    for col, w in {"C": 28, "D": 21, "G": 11, "H": 10, "J": 10, "L": 10, "M": 13, "R": 34, "S": 18}.items(): ws.column_dimensions[col].width = w
    # Recap per station per settimana (equivalente della pivot in Foglio2)
    def weeknum_excel(d):
        jan1 = dt.date(d.year, 1, 1); return ((d.toordinal() - jan1.toordinal()) + ((jan1.weekday() + 1) % 7)) // 7 + 1
    settimane = sorted({weeknum_excel(dt.date(anno, mese, g)) for g in range(1, calendar.monthrange(anno, mese)[1] + 1)})
    rc = wb.create_sheet("Recap", 0)
    rc["A3"] = "Somma di Imp. Scontato no IVA"; rc["B3"] = "Etichette di colonna"; rc["A4"] = "Etichette di riga"
    for j, w in enumerate(settimane): rc.cell(4, 2 + j, w)
    cT = 2 + len(settimane); rc.cell(4, cT, "Totale complessivo")
    stazioni = sorted({ws.cell(r, i_veic + 1).value for r in range(2, n + 1)}, key=lambda s: (STATIONS_ORD.index(s) if s in STATIONS_ORD else 99, s))
    r = 5
    for st in stazioni:
        rc.cell(r, 1, st)
        for j, w in enumerate(settimane): rc.cell(r, 2 + j, f'=SUMIFS(Q8_[Imp. Scontato no IVA],Q8_[STATION],$A{r},Q8_[WEEK],{L(2 + j)}$4)')
        rc.cell(r, cT, f"=SUM(B{r}:{L(cT - 1)}{r})"); r += 1
    rc.cell(r, 1, "Totale complessivo")
    for c in range(2, cT + 1): rc.cell(r, c, f"=SUM({L(c)}5:{L(c)}{r - 1})")
    for c in range(1, cT + 1): rc.cell(4, c).font = Font(bold=True)
    rc.cell(r, 1).font = Font(bold=True)
    for rr in range(5, r + 1):
        for c in range(2, cT + 1): rc.cell(rr, c).number_format = "#,##0.00"
    # giornaliero per station (equivalente della seconda pivot, filtro STATION)
    r += 3; rc.cell(r, 1, "STATION"); rc.cell(r, 2, "GLS"); rc.cell(r, 1).font = Font(bold=True); fst = f"$B${r}"
    r += 1; rc.cell(r, 1, "Giorno"); rc.cell(r, 2, "Somma di Imp. Scontato"); rc.cell(r, 3, "Giorno sett."); r += 1
    for g in range(1, calendar.monthrange(anno, mese)[1] + 1):
        rc.cell(r, 1, dt.date(anno, mese, g)); rc.cell(r, 1).number_format = "dd-mmm"
        rc.cell(r, 2, f'=SUMPRODUCT((INT(Q8_[Data])=A{r})*(Q8_[STATION]={fst})*Q8_[Imp. Scontato])'); rc.cell(r, 2).number_format = "#,##0.00"
        rc.cell(r, 3, f"=WEEKDAY(A{r})"); r += 1
    rc.cell(r, 1, "Totale complessivo"); rc.cell(r, 2, f"=SUM(B{r - calendar.monthrange(anno, mese)[1]}:B{r - 1})"); rc.cell(r, 2).number_format = "#,##0.00"
    rc.column_dimensions["A"].width = 26; rc.column_dimensions["B"].width = 20
    an = wb.create_sheet("Anomalie"); an.append(["Tipo", "PAN", "Identificativo", "N. transazioni", "Nota"])
    for (pan, ident), v in sorted(non_cens.items(), key=lambda x: -x[1]): an.append(["Carta non nel censimento (o senza DS)", pan, ident, v, "aggiornare il censimento fuel card"])
    for (pan, ident, st), v in sorted(per_ident.items(), key=lambda x: -x[1]): an.append(["PAN non censito: abbinata per Identificativo", pan, ident, v, f"STATION {st} presa dalla carta con lo stesso identificativo (carta riemessa?): aggiungere il nuovo PAN al censimento"])
    for k, v in sorted(scartate.items(), key=lambda x: -x[1]): an.append(["Scartate (Identificativo non AMZ/GLS)", "", k, v, "non nostri appalti"])
    nome = f"{mese:02d}_Transazioni_{MESI[mese]}_{str(anno)[2:]}_Q8.xlsx"
    os.makedirs(out_dir, exist_ok=True); wb.save(os.path.join(out_dir, nome))
    return nome, tenute, scartate, non_cens, stazioni

if __name__ == "__main__":
    if len(sys.argv) < 5: sys.exit(__doc__)
    tipo, f, mappa, out = sys.argv[1:5]
    if tipo == "auto": tipo = "telepass" if is_telepass(f) else ("q8" if is_q8(f) else sys.exit("File non riconosciuto"))
    if tipo == "telepass":
        assert is_telepass(f), "Non e' un export Telepass (intestazione attesa: ID Transazione;ID Codificato;...)"
        nome, n, nm, st = telepass(f, mappa, out); print(f"{nome}: {n} transazioni, station {st}, dispositivi non mappati: {len(nm)}")
    else:
        assert is_q8(f), "Non e' un export Q8 (intestazione attesa con 'PAN Carta' e 'N. ticket')"
        nome, n, sc, nc, st = q8(f, mappa, out); print(f"{nome}: {n} transazioni tenute, scartate {sc}, carte non censite {len(nc)}, station {st}")
