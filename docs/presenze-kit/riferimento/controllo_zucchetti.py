# -*- coding: utf-8 -*-
"""
Controllo mensile SIC: ore tracking vs ore Zucchetti + domeniche / giorni consecutivi.
USO: python controllo_zucchetti.py <cartella_file> <ANNO> <MESE> <out.xlsx> [solo_sic=1]
La cartella deve contenere: i tracking SIC delle 7 DS (file con 'Sic'/'SIC' nel nome) e i 7 export
Zucchetti 'Amazon_<AAAA>_<MM>_<Citta>_*.xlsm'. Facoltativi i tracking STD per il foglio STD di check_domenica.
"""
import sys, os, re, glob, datetime as dt, calendar, unicodedata
MESI_IT = ["", "gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"]
import openpyxl
from openpyxl import Workbook
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.worksheet.formula import ArrayFormula
from openpyxl.utils import get_column_letter as L
from openpyxl.formatting.rule import ColorScaleRule, CellIsRule
from openpyxl.styles import PatternFill, Font

CITTA = {"VALSAMOGGIA": "DER1", "SANTARCANGELO": "DER2", "ORIGGIO": "DLO2", "BUCCINASCO": "DLO4",
         "CASTEGNATO": "DLO5", "POMEZIA": "DLZ2", "VIGONZA": "DVN1"}
STATIONS = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"]
LAVORO = ("Standard", "Straordinario", "Supplementare", "Accordo")
ASSENZE_RETRIB = ("FERIE", "ROL", "ExF", "104", "MALATTIA", "INFORTUNIO", "PERM_SIND", "ALTRI_PERM")
# Su Zucchetti si inseriscono TUTTE le ore tranne i riposi: anche permesso non retribuito e assenza ingiustificata
ASSENZE_NON_RETRIB = ("PERM_NR", "ASS_INGIUST")

def norm_voce(t):
    t = str(t).strip().lower()
    for k, v in [("standard", "Standard"), ("straord", "Straordinario"), ("supplement", "Supplementare"), ("accordo", "Accordo"),
                 ("total", "Totali"), ("riposo", "RIPOSO"), ("ferie", "FERIE"), ("rol", "ROL"), ("exf", "ExF"), ("104", "104"),
                 ("malatt", "MALATTIA"), ("infort", "INFORTUNIO")]:
        if t.startswith(k): return v
    if "ingiust" in t: return "ASS_INGIUST"
    if "trasfert" in t: return "TRASFERTA"
    if "sindac" in t: return "PERM_SIND"
    if "altri perm" in t: return "ALTRI_PERM"
    if "non retrib" in t: return "PERM_NR"
    return "ALTRO"

def nk(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower().replace("'", "").replace("`", "")
    return " ".join(sorted(re.sub(r"[^a-z ]", " ", s).split()))

def matr_key(v):
    if v is None: return ""
    s = str(v).strip().upper()
    if re.fullmatch(r"\d+(\.0)?", s): return str(int(float(s)))
    return s

def ore(v):
    """Converte una cella Zucchetti (time, datetime, '08:00', 7.8, '') in ore decimali."""
    if v is None or v == "": return 0.0
    if isinstance(v, dt.time): return v.hour + v.minute / 60 + v.second / 3600
    if isinstance(v, dt.datetime): return v.hour + v.minute / 60 + v.second / 3600
    if isinstance(v, (int, float)): return float(v) * 24 if 0 < float(v) < 1 else float(v)
    s = str(v).strip()
    m = re.fullmatch(r"(\d{1,2})[:.](\d{2})(?::(\d{2}))?", s)
    if m: return int(m.group(1)) + int(m.group(2)) / 60 + (int(m.group(3)) if m.group(3) else 0) / 3600
    try: return float(s.replace(",", "."))
    except: return 0.0

# ---------------------------------------------------------------- TRACKING
def trova_foglio(wb, anno, mese):
    """Ritorna (ws, header_row, tipo_col, {col: date}) del foglio che copre il mese richiesto."""
    best = None
    for ws in wb.worksheets:
        data = list(ws.iter_rows(min_row=1, max_row=8, values_only=True))
        hr = next((i for i, r in enumerate(data) if any(str(v).strip() == "Tipo" for v in r if v is not None)), None)
        if hr is None: continue
        hdr = data[hr]; tc = next(j for j, v in enumerate(hdr) if v is not None and str(v).strip() == "Tipo")
        daymap = {}; prev = None; m = None; intmode = False
        for j in range(tc + 1, len(hdr)):
            h = hdr[j]
            if h is None: continue
            if isinstance(h, (dt.datetime, dt.date)):
                daymap[j] = h.date() if isinstance(h, dt.datetime) else h; continue
            hs = str(h).strip()
            if hs.lower().startswith(("tot", "somma")):
                if intmode: break
                continue
            if re.fullmatch(r"\d{1,2}", hs):
                d = int(hs); intmode = True
                if m is None: m = mese - 1 if d >= 28 else mese
                elif prev is not None and d < prev: m += 1
                prev = d
                y = anno
                if m < 1: m2, y = 12, anno - 1
                elif m > 12: m2, y = 1, anno + 1
                else: m2 = m
                try: daymap[j] = dt.date(y, m2, d)
                except ValueError: pass
        n = sum(1 for d in daymap.values() if d.year == anno and d.month == mese)
        if n and (best is None or n > best[0]): best = (n, ws, hr, tc, daymap)
    if not best: raise SystemExit(f"Nessun foglio con i giorni {mese}/{anno} in {wb}")
    _, ws, hr, tc, daymap = best
    daymap = {j: d for j, d in daymap.items() if d.year == anno and d.month == mese}
    return ws, hr, tc, daymap

def leggi_tracking(path, anno, mese):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws, hr, tc, daymap = trova_foglio(wb, anno, mese)
    data = list(ws.iter_rows(values_only=True))
    hdr = data[hr]
    def col(nome):
        return next((j for j, v in enumerate(hdr) if v is not None and str(v).strip().lower().startswith(nome)), None)
    c_nome, c_cf, c_matr, c_contr, c_id = col("lavorat"), col("codice f"), col("codice m"), col("tipo c"), col("driver")
    lav = {}; cur = None
    for r in data[hr + 1:]:
        if len(r) <= tc or r[tc] is None or str(r[tc]).strip() == "": continue
        voce = norm_voce(r[tc])
        if voce == "Standard":
            nome = str(r[c_nome]).strip() if c_nome is not None and r[c_nome] else ""
            cur = dict(nome=nome, cf=str(r[c_cf]).strip() if c_cf is not None and r[c_cf] else "",
                       contr=str(r[c_contr]).strip() if c_contr is not None and r[c_contr] else "",
                       driver_id=str(r[c_id]).strip() if c_id is not None and r[c_id] else "", matr="", giorni={})
            lav[id(cur)] = cur
        if cur is None: continue
        if c_matr is not None and r[c_matr] not in (None, "") and not cur["matr"]: cur["matr"] = matr_key(r[c_matr])
        if voce in ("Totali", "RIPOSO", "TRASFERTA", "ALTRO"): continue
        for j, d in daymap.items():
            if j >= len(r): continue
            try: v = float(r[j])
            except (TypeError, ValueError): continue
            if v and v <= 24:
                cur["giorni"].setdefault(d, {}); cur["giorni"][d][voce] = cur["giorni"][d].get(voce, 0) + v
    return list(lav.values())

# ---------------------------------------------------------------- ZUCCHETTI
def leggi_zucchetti(path, anno, mese):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb["ORARI"] if "ORARI" in wb.sheetnames else wb.worksheets[0]
    data = list(ws.iter_rows(values_only=True))
    hr = next(i for i, r in enumerate(data[:5]) if any(str(v).strip().upper() == "MATR" for v in r if v is not None))
    hdr = data[hr]
    daymap = {}
    for j, h in enumerate(hdr):
        if isinstance(h, (dt.datetime, dt.date)):
            d = h.date() if isinstance(h, dt.datetime) else h
            if d.year == anno and d.month == mese: daymap[j] = d
        elif isinstance(h, (int, float)) and 1 <= h <= 31:
            try: daymap[j] = dt.date(anno, mese, int(h))
            except ValueError: pass
    out = {}
    for r in data[hr + 1:]:
        if len(r) < 7 or str(r[5]).strip().upper() != "TOTALE": continue
        nome = f"{r[2] or ''} {r[3] or ''}".strip(); k = matr_key(r[1]) or ("NOME:" + nk(nome))
        g = {d: round(ore(r[j]), 4) for j, d in daymap.items() if j < len(r)}
        out[k] = dict(matr=k, nome=nome, pt=r[4], giorni=g)
    return out

# ---------------------------------------------------------------- MAIN
def main():
    if len(sys.argv) < 5: sys.exit(__doc__)
    cart, anno, mese, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    ndays = calendar.monthrange(anno, mese)[1]
    giorni_mese = [dt.date(anno, mese, d) for d in range(1, ndays + 1)]
    files = glob.glob(os.path.join(cart, "**", "*.xls*"), recursive=True)
    trk_sic, trk_std, zuc = {}, {}, {}
    for f in files:
        b = os.path.basename(f); up = b.upper()
        if b.startswith("~$"): continue
        st = next((s for s in STATIONS if s in up), None)
        if "TRACKING" in up and st:
            if "SIC" in up: trk_sic[st] = f
            elif "STD" in up: trk_std[st] = f
        elif up.startswith("AMAZON_"):
            citta = next((c for c in CITTA if c in up.replace(" ", "")), None)
            if citta: zuc[CITTA[citta]] = f
    print("Tracking SIC:", sorted(trk_sic)); print("Tracking STD:", sorted(trk_std)); print("Zucchetti:", sorted(zuc))

    wb = Workbook(); wb.remove(wb.active)
    riep, delta_rows, nonabb = [], [], []
    matrici = {}
    dom_sic, dom_std = [], []
    for st in STATIONS:
        if st not in trk_sic: print(f"  {st}: manca tracking SIC"); continue
        lav = leggi_tracking(trk_sic[st], anno, mese)
        for w in lav:
            dom_sic.append((st, w))
        if st not in zuc: print(f"  {st}: manca file Zucchetti"); continue
        Z = leggi_zucchetti(zuc[st], anno, mese)
        z_by_name = {nk(z["nome"]): k for k, z in Z.items()}
        def trova(w):
            if w["matr"] and w["matr"] in Z: return w["matr"]
            n = nk(w["nome"])
            if n in z_by_name: return z_by_name[n]
            tok = set(n.split())
            if len(tok) >= 2:
                cand = [k for k, z in Z.items() if tok <= set(nk(z["nome"]).split()) or set(nk(z["nome"]).split()) <= tok]
                if len(cand) == 1: return cand[0]
            return None
        usati = set(); n_match = 0; d_tot = 0; n_gg_delta = 0
        for w in lav:
            k = trova(w)
            if k is None:
                nonabb.append(dict(Station=st, Fonte="TRACKING", Matricola=w["matr"], Lavoratore=w["nome"], CF=w["cf"], Contratto=w["contr"],
                                   Ore_mese=round(sum(sum(v.values()) for v in w["giorni"].values()), 2), Nota="non trovato su Zucchetti (né matricola né nome)"))
                continue
            usati.add(k); n_match += 1; z = Z[k]
            for d in giorni_mese:
                voci = w["giorni"].get(d, {})
                lavoro = sum(v for kk, v in voci.items() if kk in LAVORO)
                assret = sum(v for kk, v in voci.items() if kk in ASSENZE_RETRIB)
                assnr = sum(v for kk, v in voci.items() if kk in ASSENZE_NON_RETRIB)
                trk = round(lavoro + assret + assnr, 4); zz = z["giorni"].get(d, 0.0)
                delta = round(trk - zz, 4)
                matrici.setdefault(st, []).append((k, w["nome"], d, trk, zz, delta))
                if abs(delta) > 0.01:
                    n_gg_delta += 1; d_tot += delta
                    delta_rows.append(dict(Station=st, Matricola=k, Lavoratore=w["nome"], Contratto=w["contr"], Data=d, Giorno=["Lun","Mar","Mer","Gio","Ven","Sab","Dom"][d.weekday()],
                        Ore_tracking=trk, Ore_lavoro=round(lavoro, 2), Ore_assenze_retrib=round(assret, 2), Ore_assenze_non_retrib=round(assnr, 2),
                        Ore_zucchetti=round(zz, 2), Delta=round(delta, 2),
                        Voci_tracking=", ".join(f"{kk} {v:g}" for kk, v in voci.items()),
                        Lettura=("manca su Zucchetti" if zz == 0 and trk > 0 else "manca su tracking" if trk == 0 and zz > 0 else "ore diverse")))
        for k, z in Z.items():
            if k not in usati:
                tot = round(sum(z["giorni"].values()), 2)
                nonabb.append(dict(Station=st, Fonte="ZUCCHETTI", Matricola=k, Lavoratore=z["nome"], CF="", Contratto=f"%PT {z['pt']}", Ore_mese=tot,
                                   Nota="su Zucchetti ma non nel tracking SIC" + (" (0 ore: probabile cessato/non attivo)" if tot == 0 else "")))
        riep.append(dict(Station=st, Lavoratori_tracking=len(lav), Lavoratori_zucchetti=len(Z), Abbinati=n_match,
                         Solo_tracking=sum(1 for x in nonabb if x["Station"] == st and x["Fonte"] == "TRACKING"),
                         Solo_zucchetti=sum(1 for x in nonabb if x["Station"] == st and x["Fonte"] == "ZUCCHETTI"),
                         Giorni_con_delta=n_gg_delta, Delta_ore_tot=round(d_tot, 2),
                         Ore_tracking_tot=round(sum(x[3] for x in matrici.get(st, [])), 1), Ore_zucchetti_tot=round(sum(x[4] for x in matrici.get(st, [])), 1)))
    for st in STATIONS:
        if st in trk_std:
            for w in leggi_tracking(trk_std[st], anno, mese): dom_std.append((st, w))

    def tabella(ws, name, cols, rows):
        ws.append(cols)
        for r in rows: ws.append([r.get(c) if isinstance(r, dict) else r[i] for i, c in enumerate(cols)])
        ref = f"A1:{L(len(cols))}{max(2, len(rows) + 1)}"
        t = Table(displayName=name, ref=ref); t.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True); ws.add_table(t)
        for i, c in enumerate(cols, 1):
            w = max([len(str(c))] + [len(str(r.get(c) if isinstance(r, dict) else r[i - 1])) for r in rows[:300]]) if rows else len(str(c))
            ws.column_dimensions[L(i)].width = min(45, w + 2)
        ws.freeze_panes = "A2"

    tabella(wb.create_sheet("Riepilogo"), "T_Riepilogo", ["Station", "Lavoratori_tracking", "Lavoratori_zucchetti", "Abbinati", "Solo_tracking", "Solo_zucchetti", "Giorni_con_delta", "Delta_ore_tot", "Ore_tracking_tot", "Ore_zucchetti_tot"], riep)
    ws = wb.create_sheet("Delta_giorni")
    tabella(ws, "T_Delta", ["Station", "Matricola", "Lavoratore", "Contratto", "Data", "Giorno", "Ore_tracking", "Ore_lavoro", "Ore_assenze_retrib", "Ore_assenze_non_retrib", "Ore_zucchetti", "Delta", "Lettura", "Voci_tracking"], delta_rows)
    for r in range(2, len(delta_rows) + 2): ws.cell(r, 5).number_format = "DD/MM/YYYY"
    tabella(wb.create_sheet("Non_abbinati"), "T_NonAbb", ["Station", "Fonte", "Matricola", "Lavoratore", "CF", "Contratto", "Ore_mese", "Nota"], nonabb)

    # matrici per station: TRK | ZUC | DELTA (come il formato VERIFICA)
    red = PatternFill("solid", fgColor="FFC7CE"); orange = PatternFill("solid", fgColor="FFEB9C")
    for st, rows in matrici.items():
        ws = wb.create_sheet(f"V_{st}")
        ws["A1"] = "MATRICOLA"; ws["B1"] = "LAVORATORE"; ws.cell(1, 3, "TRACKING (lavoro + tutte le assenze, esclusi riposi)"); ws.cell(1, 3 + ndays + 1, "ZUCCHETTI (riga TOTALE)"); ws.cell(1, 3 + 2 * (ndays + 1), "DELTA"); ws.cell(1, 3 + 3 * (ndays + 1), "TOT DELTA")
        for c in (1, 2, 3, 3 + ndays + 1, 3 + 2 * (ndays + 1), 3 + 3 * (ndays + 1)): ws.cell(1, c).font = Font(bold=True)
        for d in range(1, ndays + 1):
            for b in range(3): ws.cell(2, 2 + b * (ndays + 1) + d, d).font = Font(bold=True)
        per = {}
        for k, nome, d, trk, zz, delta in rows: per.setdefault((k, nome), {})[d.day] = (trk, zz, delta)
        r = 3
        for (k, nome), gg in per.items():
            ws.cell(r, 1, k); ws.cell(r, 2, nome)
            for d in range(1, ndays + 1):
                trk, zz, delta = gg.get(d, (0, 0, 0))
                ws.cell(r, 2 + d, round(trk, 2)); ws.cell(r, 2 + (ndays + 1) + d, round(zz, 2))
                c = ws.cell(r, 2 + 2 * (ndays + 1) + d, f"={L(2 + d)}{r}-{L(2 + (ndays + 1) + d)}{r}")
            ws.cell(r, 3 + 3 * (ndays + 1), f"=SUM({L(3 + 2 * (ndays + 1))}{r}:{L(2 + 2 * (ndays + 1) + ndays)}{r})")
            r += 1
        rng = f"{L(3 + 2 * (ndays + 1))}3:{L(2 + 2 * (ndays + 1) + ndays)}{max(3, r - 1)}"
        ws.conditional_formatting.add(rng, CellIsRule(operator="greaterThan", formula=["0.01"], fill=red))
        ws.conditional_formatting.add(rng, CellIsRule(operator="lessThan", formula=["-0.01"], fill=orange))
        ws.freeze_panes = "C3"; ws.column_dimensions["B"].width = 28
        for c in range(3, 3 + 3 * (ndays + 1) + 1): ws.column_dimensions[L(c)].width = 5

    # ---------------- check domenica / giorni consecutivi (formato identico al file di Alessandro)
    settimane = []  # (label, primo, ultimo) lun-dom
    d = dt.date(anno, mese, 1)
    while d.month == mese:
        fine = min(d + dt.timedelta(days=6 - d.weekday()), dt.date(anno, mese, ndays))
        settimane.append((f"{d.day:02d}-{fine.day:02d} {MESI_IT[mese]}", d.day, fine.day)); d = fine + dt.timedelta(days=1)
    domeniche = [g for g in giorni_mese if g.weekday() == 6]
    def foglio_dom(nome, lista, sic):
        ws = wb.create_sheet(nome)
        hdr = ["DS", "Lavoratore", "Codice Fiscale", "Tipo Contratto"] + [str(i) for i in range(1, ndays + 1)] + [s[0] for s in settimane] + ["Max ore/sett", "≥40h", "N.sett ≥40h"]
        if sic: hdr += [f"6+dom {g.day}" for g in domeniche] + ["N.sett 6+dom", "6+dom"]
        hdr += ["Max gg consec", "7gg consec"]
        ws.append(hdr)
        for c in range(1, len(hdr) + 1): ws.cell(1, c).font = Font(bold=True)
        c0 = 5; cN = 4 + ndays; r = 2
        for st, w in lista:
            ws.cell(r, 1, st); ws.cell(r, 2, w["nome"]); ws.cell(r, 3, w["cf"]); ws.cell(r, 4, w["contr"])
            for g in giorni_mese:
                h = sum(v for kk, v in w["giorni"].get(g, {}).items() if kk in LAVORO)
                if h: ws.cell(r, c0 - 1 + g.day, round(h, 2))
            c = cN + 1
            for lab, a, b in settimane:
                ws.cell(r, c, f"=SUM({L(c0 - 1 + a)}{r}:{L(c0 - 1 + b)}{r})"); c += 1
            cs, ce = cN + 1, cN + len(settimane)
            ws.cell(r, c, f"=MAX({L(cs)}{r}:{L(ce)}{r})"); cmax = c; c += 1
            ws.cell(r, c, f'=IF({L(cmax)}{r}>=40,"SI","NO")'); c += 1
            ws.cell(r, c, f'=COUNTIF({L(cs)}{r}:{L(ce)}{r},">=40")'); c += 1
            if sic:
                c6 = c
                for g in domeniche:
                    a = g.day - 6
                    if a >= 1: ws.cell(r, c, f'=IF(AND(COUNTIF({L(c0 - 1 + a)}{r}:{L(c0 - 1 + g.day)}{r},">0")=6,{L(c0 - 1 + g.day)}{r}>0),1,0)')
                    else: ws.cell(r, c, 0)
                    c += 1
                ws.cell(r, c, f"=SUM({L(c6)}{r}:{L(c - 1)}{r})"); c += 1
                ws.cell(r, c, f'=IF({L(c - 1)}{r}>0,"SI","NO")'); c += 1
            rng = f"${L(c0)}{r}:${L(cN)}{r}"
            ws.cell(r, c).value = ArrayFormula(f"{L(c)}{r}", f"=IF(COUNTIF({rng},\">0\")=0,0,IF(COUNTIF({rng},\">0\")=COLUMNS({rng}),COLUMNS({rng}),MAX(FREQUENCY(IF({rng}>0,COLUMN({rng})),IF(NOT({rng}>0),COLUMN({rng}))))))")
            c += 1
            ws.cell(r, c, f'=IF({L(c - 1)}{r}>=7,"SI","NO")')
            r += 1
        ws.freeze_panes = "E2"; ws.column_dimensions["B"].width = 30; ws.column_dimensions["C"].width = 18; ws.column_dimensions["D"].width = 14
        for cc in range(c0, cN + 1): ws.column_dimensions[L(cc)].width = 4.5
        ws.auto_filter.ref = f"A1:{L(len(hdr))}{max(2, r - 1)}"
        return ws
    foglio_dom("SIC", dom_sic, True)
    if dom_std: foglio_dom("STD", dom_std, False)
    # Tabella 6+domenica (SIC): per DS, colonne = domeniche, nomi di chi ha lavorato lun-dom (7 giorni)
    ws = wb.create_sheet("Tabella 6+domenica (SIC)"); r = 1
    for st in STATIONS:
        ws.cell(r, 1, st).font = Font(bold=True); r += 1
        for i, g in enumerate(domeniche, 1): ws.cell(r, i, g.strftime("%d-") + MESI_IT[mese]).font = Font(bold=True)
        r += 1; maxlen = 0
        for i, g in enumerate(domeniche, 1):
            nomi = []
            for s2, w in dom_sic:
                if s2 != st or g.day < 7: continue
                gg = [dt.date(anno, mese, x) for x in range(g.day - 6, g.day + 1)]
                lav = [sum(v for kk, v in w["giorni"].get(x, {}).items() if kk in LAVORO) > 0 for x in gg]
                if sum(lav) == 6 and lav[-1]: nomi.append(w["nome"])
            for j, n in enumerate(sorted(nomi)): ws.cell(r + j, i, n)
            maxlen = max(maxlen, len(nomi))
        r += maxlen + 1
    for i in range(1, len(domeniche) + 1): ws.column_dimensions[L(i)].width = 32
    wb.save(out)
    print("Scritto", out)
    for x in riep: print(x)
    print("Delta righe:", len(delta_rows), "| non abbinati:", len(nonabb))

if __name__ == "__main__":
    main()
