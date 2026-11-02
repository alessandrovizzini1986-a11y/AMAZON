# -*- coding: utf-8 -*-
"""
Unisce tutti i CSV del portale Amazon (uno per station e giorno) in un unico file.
USO: metti questo script nella cartella dei CSV e lancia:  python unisci_csv_flex.py
Legge i file *.csv con nome <STATION>_<giorno>.csv (es. DER2_5.csv) anche nelle sottocartelle;
se il nome non contiene la station, usa il nome della sottocartella (es. DER2\14.csv).
Output: FLEX_TUTTI.csv (con colonna Station in piu') + riepilogo a video di giorni per station.
"""
import csv, glob, os, re, sys
STATIONS = ["DER1","DER2","DLO2","DLO4","DLO5","DLZ2","DVN1"]
here = os.path.dirname(os.path.abspath(__file__))
files = sorted(glob.glob(os.path.join(here, "**", "*.csv"), recursive=True))
files = [f for f in files if os.path.basename(f).upper() != "FLEX_TUTTI.CSV"]
righe = []; hdr = None; riep = {}; skip = []
for f in files:
    nome = os.path.basename(f); up = f.upper()
    st = next((s for s in STATIONS if re.search(r"(^|[\\/_\- ])" + s + r"([_\- .]|$)", up)), None)
    if not st: skip.append(nome); continue
    with open(f, encoding="utf-8-sig", newline="") as fh:
        rd = csv.reader(fh); h = next(rd, None)
        if not h or h[0].strip().lower() != "data": skip.append(nome + " (intestazione inattesa)"); continue
        if hdr is None: hdr = [c.strip() for c in h]
        for r in rd:
            if not r or not r[0].strip(): continue
            righe.append([st] + r); riep.setdefault(st, set()).add(r[0].strip())
if not righe: sys.exit("Nessun CSV letto. I file devono chiamarsi <STATION>_<giorno>.csv ed essere nella cartella dello script.")
# dedup righe identiche (stesso file incollato due volte)
visti = set(); out = []
for r in righe:
    k = tuple(r)
    if k in visti: continue
    visti.add(k); out.append(r)
with open(os.path.join(here, "FLEX_TUTTI.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.writer(fh); w.writerow(["Station"] + hdr); w.writerows(out)
print(f"Scritto FLEX_TUTTI.csv: {len(out)} righe da {len(files)-len(skip)} file")
for st in STATIONS:
    gg = sorted(riep.get(st, []))
    if gg: print(f"  {st}: {len(gg)} giorni, dal {gg[0]} al {gg[-1]}")
    else: print(f"  {st}: NESSUN FILE")
if skip: print("File ignorati:", ", ".join(skip))
