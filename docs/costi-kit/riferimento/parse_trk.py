"""Parser tracking STD per la stima: ritorna righe (station, mese, lavoratore, cf, contratto, data, voce, ore)."""
import openpyxl, re, datetime as dt, sys, pickle, glob, os
from collections import defaultdict
import pandas as pd

MESI = {1:'gennaio',2:'febbraio',3:'marzo',4:'aprile',5:'maggio',6:'giugno',7:'luglio',8:'agosto',9:'settembre',10:'ottobre',11:'novembre',12:'dicembre'}
FEST = {dt.date(2026,1,1),dt.date(2026,1,6),dt.date(2026,4,6),dt.date(2026,4,25),dt.date(2026,5,1),dt.date(2026,6,2),dt.date(2026,8,15),dt.date(2026,12,8),dt.date(2026,12,25),dt.date(2026,12,26)}
def num(v):
    if v is None: return 0.0
    if isinstance(v,(int,float)): return float(v)
    try: return float(str(v).strip().replace(',','.'))
    except: return 0.0
def voce(tl):
    tl=tl.strip().lower()
    for k,v in [('standard','STD'),('straord','STR'),('supplement','SUPP'),('accordo','ACC'),('totali','TOT'),('riposo','RIP'),('ferie','FERIE'),('rol','ROL'),('exf','EXF'),('104','104'),('malatt','MAL'),('infort','INF'),('assenza ingiust','ASSING'),('permesso sindac','SIND'),('altri perm','ALTRIP'),('permesso non','PNR'),('indennit','TRASF')]:
        if tl.startswith(k): return v
    return None

def find_sheet(wb, mm, yy):
    """foglio con più colonne-giorno nel mese richiesto"""
    best=None
    for ws in wb.worksheets:
        hdr=None
        for r in range(1,8):
            vals=[str(ws.cell(r,c).value or '').strip().lower() for c in range(1,12)]
            if 'tipo' in vals: hdr=r; tc=vals.index('tipo')+1; break
        if hdr is None: continue
        n=0
        for c in range(tc+1, min(ws.max_column,120)+1):
            v=ws.cell(hdr,c).value
            if isinstance(v,dt.datetime) and v.month==mm and v.year==yy: n+=1
        # intestazioni intere: usa nome foglio
        nm=ws.title.strip().lower().replace(' ','')
        if nm in {f'{mm:02d}.{yy%100:02d}',f'{mm:02d}_{yy%100:02d}',MESI[mm]+str(yy),MESI[mm]}: n+=100
        if best is None or n>best[0]: best=(n,ws)
    return best[1] if best and best[0]>0 else None

def parse(path, station, mm, yy, sheet=None):
    wb=openpyxl.load_workbook(path,data_only=True)
    ws=wb[sheet] if sheet else find_sheet(wb,mm,yy)
    if ws is None: raise SystemExit(f'nessun foglio {mm}/{yy} in {path}: {wb.sheetnames}')
    for r in range(1,8):
        vals=[str(ws.cell(r,c).value or '').strip().lower() for c in range(1,12)]
        if 'tipo' in vals: hdr=r; tc=vals.index('tipo')+1; break
    def col(*opts):
        for o in opts:
            for i,v in enumerate(vals):
                if v.startswith(o): return i+1
    idc=col('driver id','id'); namec=col('lavoratore','driver'); cfc=col('codice fiscale'); contrc=col('tipo contratto'); ggc=col('giorni da')
    daycols={}; month=None; prev=None; intmode=None
    for c in range(tc+1, ws.max_column+1):
        v=ws.cell(hdr,c).value
        if v is None: continue
        if isinstance(v,dt.datetime): daycols[c]=v.date(); intmode=False; continue
        s=str(v).strip()
        if s.lower().startswith(('tot','somma')):
            if intmode: break
            continue
        if re.fullmatch(r'\d{1,2}',s) and 1<=int(s)<=31:
            d=int(s); intmode=True
            if month is None: month = mm-1 if d>=28 else mm
            elif prev is not None and d<prev: month+=1
            prev=d
            y=yy+(1 if month==13 else 0); m=12 if month==0 else (1 if month==13 else month)
            try: daycols[c]=dt.date(y,m,d)
            except ValueError: pass
    daycols={c:d for c,d in daycols.items() if d.month==mm and d.year==yy}
    blocks=[]
    for r in range(hdr+1, ws.max_row+1):
        t=ws.cell(r,tc).value
        if t is None: continue
        if str(t).strip().lower()=='standard': blocks.append([r])
        elif blocks: blocks[-1].append(r)
    rows=[]; anom=[]
    for b in blocks:
        r0=b[0]; nome=str(ws.cell(r0,namec).value or '').strip()
        if not nome: continue
        cf=str(ws.cell(r0,cfc).value or '').strip().upper() if cfc else ''
        contr=ws.cell(r0,contrc).value if contrc else None
        did=str(ws.cell(r0,idc).value or '').strip() if idc else ''
        for r in b:
            v=voce(str(ws.cell(r,tc).value or ''))
            if v is None: continue
            for c,date in daycols.items():
                raw=ws.cell(r,c).value; x=num(raw)
                if v=='RIP':
                    if raw not in (None,'',' '): rows.append(dict(station=station,mese=mm,nome=nome,cf=cf,did=did,contratto=contr,data=date,voce='RIP',ore=0,txt=str(raw).strip()))
                    continue
                if x==0: continue
                if x>24 and v!='TOT': anom.append((station,nome,date,v,x)); continue
                rows.append(dict(station=station,mese=mm,nome=nome,cf=cf,did=did,contratto=contr,data=date,voce=v,ore=x,txt=None))
    df=pd.DataFrame(rows)
    return df, anom, ws.title, len(daycols)

if __name__=='__main__':
    folder=sys.argv[1]; out=sys.argv[2]
    jobs=[]
    for f in sorted(glob.glob(os.path.join(folder,'*.xls*'))):
        base=os.path.basename(f); m=re.search(r'-(\d{2})_',base); mm=int(m.group(1))
        st=re.search(r'(DER1|DER2|DLO2|DLO4|DLO5|DLZ2|DVN1)',base.upper()).group(1)
        if base.startswith(('ca4d8307','e0c27023')): mm=9   # file 08_ ma con foglio settembre
        jobs.append((f,st,mm))
    alld=[]; alla=[]
    for f,st,mm in jobs:
        df,anom,title,nd=parse(f,st,mm,2026)
        w=df[df.voce.isin(['STD','STR','SUPP','ACC'])].ore.sum(); t=df[df.voce=='TOT'].ore.sum()
        print(f'{st} {mm:02d} foglio={title!r} giorni={nd} lavoratori={df.nome.nunique()} ore lavoro={w:.1f} totali_file={t:.1f} diff={w-t:+.1f} anomalie>24={len(anom)}')
        alld.append(df); alla+=anom
    pd.concat(alld,ignore_index=True).to_pickle(out)
    pickle.dump(alla,open(out+'.anom','wb'))
