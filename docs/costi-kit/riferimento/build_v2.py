"""Costruisce Stima_AMZ_SEP_26_v2.xlsx: pagina STD a formula su DWH_Ore_STD (da tracking), Parametri da ADIT ago, festivi per station,
blocco voci non da tracking, controllo vs ADIT set, Rettifiche. Parte SIC copiata dall'originale (valori) in attesa del DWH_SIC."""
import sys; sys.path.insert(0,'/home/claude/stima')
import pandas as pd, numpy as np, re, datetime as dt, openpyxl
from openpyxl import Workbook
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter as gl, column_index_from_string as ci
from parse_trk import FEST

MESE, MM, YY = 'SEP', 9, 2026
PREV = '08'  # ADIT di riferimento per le tariffe
ST = ['DER1','DER2','DLO2','DLO4','DLO5','DLZ2','DVN1']
STCOL = {'DER1':'G','DER2':'L','DLO2':'Q','DLO4':'V','DLO5':'AA','DLZ2':'AF','DVN1':'AK'}
YEL = PatternFill('solid', fgColor='FFFF00')
B = Font(bold=True)

# ---------- festivi (nazionali + patroni + semifestivi)
def nth_sunday(y, m, n):
    d = dt.date(y, m, 1);
    while d.weekday() != 6: d += dt.timedelta(1)
    return d + dt.timedelta(7*(n-1))
festivi = [(d,'Nazionale','TUTTE') for d in sorted(FEST)]
festivi += [(dt.date(2026,12,24),'Semifestivo (art.10 Accordo)','TUTTE'),(dt.date(2026,12,31),'Semifestivo (art.10 Accordo)','TUTTE')]
pat = {'DER1':dt.date(2026,10,11),'DER2':dt.date(2026,9,29),'DLO2':nth_sunday(2026,9,2),'DLO4':nth_sunday(2026,9,3),'DLO5':nth_sunday(2026,5,2),'DLZ2':dt.date(2026,7,11),'DVN1':dt.date(2026,7,20)}
festivi += [(d,'Patrono',s) for s,d in pat.items()]
festivi.sort()
def is_fest(d, st):  # domenica o festivo nazionale o patrono station (per MAGG50)
    return d.weekday()==6 or d in FEST or pat.get(st)==d

# ---------- tracking -> DWH_Ore (STD e SIC)
VM = {'STD':'Standard','STR':'Straordinario','SUPP':'Supplementare','ACC':'Accordo','FERIE':'Ferie','ROL':'ROL','EXF':'ExF','MAL':'Malattia','INF':'Infortunio','104':'104','ASSING':'Assenza ingiust.','SIND':'Perm. sindacale','ALTRIP':'Altri permessi','PNR':'Perm. non retrib.'}
def dwh_ore(pkl):
    d = pd.read_pickle(pkl); d = d[(d.voce!='RIP')&(d.mese==MM)].copy()
    d['fest'] = [is_fest(x, s) for x, s in zip(d.data, d.station)]
    rows = []
    for (st, v), g in d[d.voce.isin(VM)].groupby(['station','voce']):
        rows.append([st, VM[v], round(g.ore.sum(),2), round(g[g.fest].ore.sum(),2)])
    w = d[d.voce.isin(['STD','STR','SUPP','ACC'])].groupby(['station','nome','data']).ore.sum().reset_index()
    w['dom'] = w.data.map(lambda x: x.weekday()==6)
    contr = d.groupby(['station','nome']).contratto.first().astype(str).str.upper()
    w['disp'] = [bool(pd.Series(contr.get((s,n),'')).str.contains('DISP|DSP').iloc[0]) for s,n in zip(w.station,w.nome)]
    for st, g in w[w.ore>4].groupby('station'):
        rows.append([st, 'Trasferta gg', int(len(g)), int(g.dom.sum())])
        rows.append([st, 'Trasferta gg dispatcher', int(g.disp.sum()), int((g.dom&g.disp).sum())])
    for st, g in d.groupby('station'):
        rows.append([st, 'Teste', int(g.nome.nunique()), 0])
    mal = d[d.voce=='MAL'].sort_values(['station','nome','data']); car = {}
    for (st, n), g in mal.groupby(['station','nome']):
        prev = None; start = None
        for x in g.itertuples():
            if prev is None or (x.data - prev).days > 1: start = x.data
            if (x.data - start).days < 3: car[st] = car.get(st,0) + x.ore
            prev = x.data
    for st in ST: rows.append([st, 'Carenza malattia (ore primi 3 gg)', round(car.get(st,0),2), 0])
    return d, pd.DataFrame(rows, columns=['Station','Voce','Ore_tot','Ore_domfest']).sort_values(['Station','Voce']).reset_index(drop=True)
d, dwh = dwh_ore('trk_std.pkl')
dsic, dwh_sic_ore = dwh_ore('trk_sic.pkl')

# ---------- DWH_SIC: un lavoratore SIC per riga (tracking x CDL)
cdl = pd.read_excel('cdl.xlsx', sheet_name='SIC Amazon TR', header=1)
cdl = cdl[cdl['CODICE FISCALE'].notna()].copy(); cdl['CF'] = cdl['CODICE FISCALE'].astype(str).str.strip().str.upper()
def bucket(c):
    c = str(c).upper()
    if 'DISP' in c or c.strip()=='DSP': return 'DISPATCHER'
    if 'FT' in c: return 'CTI FT'
    if '32' in c: return 'CTI PT 32h'
    return 'CTI PT'
ws_ = dsic[dsic.voce.isin(['STD','STR','SUPP','ACC'])]
lav = dsic.groupby(['station','nome']).agg(CF=('cf','first'), Contratto=('contratto','first')).reset_index()
lav['CF'] = lav.CF.str.strip().str.upper(); lav['Bucket'] = lav.Contratto.map(bucket)
def hrs(v): return dsic[dsic.voce==v].groupby(['station','nome']).ore.sum()
for v,lab in [('STD','Ore Standard'),('STR','Ore Straord'),('SUPP','Ore Suppl'),('ACC','Ore Accordo'),('FERIE','Ore Ferie'),('ROL','Ore ROL'),('EXF','Ore ExF'),('MAL','Ore Malattia')]:
    lav[lab] = [hrs(v).get((s,n),0.0) for s,n in zip(lav.station,lav.nome)]
cdl_fix = {'FSCPTR96D11A4940':'FSCPTR96D11A494O'}  # 0/O finale (trappola nota)
lav['CF_join'] = lav.CF.map(lambda c: cdl_fix.get(c,c))
cc = cdl.set_index('CF')
cols = {'CDL':'CDL','h Settim.':'h Settim.','GG LAVORATIVI':'GG lavorativi','Tipologia PT':'Tipologia PT','CONTRATTO':'Contratto CDL','Saving FE':'Saving FE €/gg','Saving ROL':'Saving ROL €/h','Saving EXF':'Saving EXF €/h','Costo festività (Non goduta)':'Costo festività non goduta €/gg','Strao a forfait':'Strao a forfait'}
for k,lab in cols.items(): lav[lab] = [cc[k].get(c, np.nan) for c in lav.CF_join]
lav['CDL in anagrafica'] = ['SI' if c in cc.index else 'NO' for c in lav.CF_join]
lav['gg Ferie'] = lav['Ore Ferie'] / (lav['h Settim.']/lav['GG lavorativi']).replace(0,np.nan)
lav = lav.rename(columns={'station':'Station','nome':'Lavoratore'})
dwh_sic = lav[['Station','Lavoratore','CF','Contratto','Bucket','CDL in anagrafica','Contratto CDL','Tipologia PT','h Settim.','GG lavorativi','CDL','Strao a forfait','Ore Standard','Ore Straord','Ore Suppl','Ore Accordo','Ore Ferie','gg Ferie','Ore ROL','Ore ExF','Ore Malattia','Saving FE €/gg','Saving ROL €/h','Saving EXF €/h','Costo festività non goduta €/gg']].copy()
dwh_sic = dwh_sic.sort_values(['Station','Bucket','Lavoratore']).reset_index(drop=True)
cdl_non_tracciati = cdl[~cdl.CF.isin(set(lav.CF_join))][['COGNOME','NOME','PLANT/STATION/PV','CONTRATTO','CDL']]

# ---------- ADIT
a = pd.read_pickle('adit5569.pkl'); a['mm'] = a.file.str[:2]; a['st'] = a['STATION/PLANT/PV']
def adit_rows(mm):
    x = a[a.mm==mm]
    g = x.groupby(['st','voce','InvoiceDescription']).agg(Quantita=('Quantity','sum'), Costo=('NoTaxableIncome','sum'), Teste=('CodFiscale','nunique')).reset_index()
    g['Residuo'] = ''
    r = x[x.MeseCompetenza.astype(str).str[5:7]!=mm].groupby(['st','voce','InvoiceDescription']).NoTaxableIncome.sum()
    return g, round(float(r.sum()),2)
ago, ago_res = adit_rows(PREV); setd, set_res = adit_rows('09')

# ---------- originale (per SIC e Rettifiche)
wbo = openpyxl.load_workbook('Stima_Costo_personale.xlsx', data_only=True); wso = wbo['AMZ_SEP_26']
wbf = openpyxl.load_workbook('Stima_Costo_personale.xlsx'); wsf = wbf['AMZ_SEP_26']

# ---------- workbook
wb = Workbook(); pg = wb.active; pg.title = f'AMZ_{MESE}_26_v2'
def tbl(ws, name, df, style='TableStyleMedium2'):
    ws.append(list(df.columns))
    for r in df.itertuples(index=False): ws.append([None if (isinstance(v,float) and np.isnan(v)) else v for v in r])
    t = Table(displayName=name, ref=f'A1:{gl(len(df.columns))}{len(df)+1}'); t.tableStyleInfo = TableStyleInfo(name=style, showRowStripes=True); ws.add_table(t)
    for i,c in enumerate(df.columns,1): ws.column_dimensions[gl(i)].width = max(12, min(40, len(str(c))+4))
    return len(df)+1
# DWH
w1 = wb.create_sheet('DWH_Ore_STD'); n1 = tbl(w1,'DWH_Ore_STD',dwh)
w1s = wb.create_sheet('DWH_Ore_SIC'); n1s = tbl(w1s,'DWH_Ore_SIC',dwh_sic_ore)
w4 = wb.create_sheet('DWH_SIC'); n4 = tbl(w4,'DWH_SIC',dwh_sic)
w2 = wb.create_sheet(f'DWH_ADIT_AGO'); n2 = tbl(w2,'DWH_ADIT_AGO',ago.rename(columns={'st':'Station','voce':'Voce'}))
w3 = wb.create_sheet(f'DWH_ADIT_SET'); n3 = tbl(w3,'DWH_ADIT_SET',setd.rename(columns={'st':'Station','voce':'Voce'}))
wf = wb.create_sheet('Festivi'); nf = tbl(wf,'Festivi',pd.DataFrame([[d,desc,s] for d,desc,s in festivi],columns=['Data','Descrizione','Station']))
for r in range(2,nf+1): wf.cell(r,1).number_format='dd/mm/yyyy'
# Parametri
wp = wb.create_sheet('Parametri')
wp['A1']='Tariffe orarie/giornaliere STD = costo ADIT / quantità ADIT del mese precedente (DWH_ADIT_AGO). Celle gialle = parametri non deducibili da ADIT.'; wp['A1'].font=B
hdrp=['Voce','Tariffa','Origine']
for j,h in enumerate(hdrp,1): wp.cell(3,j,h).font=B
A2=f'DWH_ADIT_AGO!$B$2:$B${n2}'; Q2=f'DWH_ADIT_AGO!$D$2:$D${n2}'; C2=f'DWH_ADIT_AGO!$E$2:$E${n2}'
par=[('Standard','STANDARD'),('STR 30%','STR30'),('SUPP 18%','SUPP18'),('MAGG 50%','MAGG50'),('STR 65%','STR65'),('Festività €/h','FESTIVITA'),('Ferie/ROL/ExF godute €/h','FERIE_PERM_GOD'),('Carenza malattia €/h','CARENZA')]
P={}
r=4
for lab,v in par:
    wp.cell(r,1,lab); wp.cell(r,2,f'=IFERROR(SUMIFS({C2},{A2},"{v}")/SUMIFS({Q2},{A2},"{v}"),0)'); wp.cell(r,3,f'ADIT ago: {v}'); wp.cell(r,2).number_format='0.00'; P[v]=f'Parametri!$B${r}'; r+=1
wp.cell(r,1,'Carenza malattia/infortunio % su costo ore'); wp.cell(r,2,f'=IFERROR(SUMIFS({C2},{A2},"CARENZA")/(SUMIFS({C2},{A2},"STANDARD")+SUMIFS({C2},{A2},"MAGG50")+SUMIFS({C2},{A2},"SUPP18")+SUMIFS({C2},{A2},"STR30")+SUMIFS({C2},{A2},"STR65")),0)'); wp.cell(r,2).number_format='0.00%'; wp.cell(r,3,'ADIT ago: carenza / costo ore (la fattura non segue le ore di malattia del mese: usare il coefficiente)'); P['CARENZAPCT']=f'Parametri!$B${r}'; r+=1
wp.cell(r,1,'SUPP 65%'); wp.cell(r,2,f'={P["STR65"]}'); wp.cell(r,3,'in fattura non esiste: tutto il 65% è Straordinario a tariffa STR65'); P['SUPP65']=f'Parametri!$B${r}'; r+=1
gialli=[('Trasferta feriale €/gg',22.5,'Accordo art.5: 22,50 dal 1/1/2026 (23,50 dal 1/1/2027, 24,00 dal 1/6/2027)','TRASF'),
        ('Trasferta domenica €/gg',29.5,'Accordo art.22e: feriale + 7,00','TRASFDOM'),
        ('CTRB Decr. Dignità €/h',0.10,'ADIT: 0,10 €/h su tutte le ore lavorate','CTRB'),
        ('Altro (clausola costo lavoro, ASRE, congedi, corsi) % su costo ore',0.002,'media ADIT gen-set 2026: 0,2%','ALTRO'),
        ('Giorni retribuiti/mese per stimare le ore festività',26,'ore festività per festivo = ore Standard mese / 26','GGMESE'),
        ('Integrazione MOG €',0,'dal controllo MOG del mese (0 se non disponibile)','MOG'),
        ('Trasferta ai dispatcher SIC (1 = sì, 0 = no)',1,'i tracking non sono allineati: DER1/DER2/DLZ2 la mettono, DLO5/DVN1 no — da chiarire con Erika','DISPTR')]
for lab,val,src,k in gialli:
    wp.cell(r,1,lab); wp.cell(r,2,val).fill=YEL; wp.cell(r,3,src); P[k]=f'Parametri!$B${r}'; r+=1
r+=1; wp.cell(r,1,'Festivi nel mese per station (da foglio Festivi: nazionali/semifestivi "TUTTE" + patrono)').font=B; r+=1
wp.cell(r,1,'Station'); wp.cell(r,2,'N. festivi'); wp.cell(r,3,'Periodo'); r+=1
first=dt.date(YY,MM,1); last=dt.date(YY,MM,30)
wp.cell(r,1,'inizio'); wp.cell(r,2,first).number_format='dd/mm/yyyy'; PFIRST=f'Parametri!$B${r}'; r+=1
wp.cell(r,1,'fine'); wp.cell(r,2,last).number_format='dd/mm/yyyy'; PLAST=f'Parametri!$B${r}'; r+=1
NFEST={}
for st in ST:
    wp.cell(r,1,st); wp.cell(r,2,f'=COUNTIFS(Festivi!$A$2:$A${nf},">="&{PFIRST},Festivi!$A$2:$A${nf},"<="&{PLAST},Festivi!$C$2:$C${nf},"TUTTE")+COUNTIFS(Festivi!$A$2:$A${nf},">="&{PFIRST},Festivi!$A$2:$A${nf},"<="&{PLAST},Festivi!$C$2:$C${nf},"{st}")'); NFEST[st]=f'Parametri!$B${r}'; r+=1
wp.column_dimensions['A'].width=58; wp.column_dimensions['C'].width=70

# ---------- pagina
S=f'DWH_Ore_STD!$A$2:$A${n1}'; V=f'DWH_Ore_STD!$B$2:$B${n1}'; OT=f'DWH_Ore_STD!$C$2:$C${n1}'; OD=f'DWH_Ore_STD!$D$2:$D${n1}'
def sumifs(col, st, voce): return f'SUMIFS({col},{S},"{st}",{V},"{voce}")'
pg['A1']='SETTEMBRE 2026 — v2 (tutto a formula: STD da DWH_Ore_STD, SIC da DWH_SIC/DWH_Ore_SIC, tariffe da Parametri)'
SS=f'DWH_Ore_SIC!$A$2:$A${n1s}'; VS=f'DWH_Ore_SIC!$B$2:$B${n1s}'; OTS=f'DWH_Ore_SIC!$C$2:$C${n1s}'; ODS=f'DWH_Ore_SIC!$D$2:$D${n1s}'
def sumifs_sic(col, st, voce): return f'SUMIFS({col},{SS},"{st}",{VS},"{voce}")'
KS=f'DWH_SIC!$A$2:$A${n4}'; KB=f'DWH_SIC!$E$2:$E${n4}'; KCDL=f'DWH_SIC!$K$2:$K${n4}'; KFOR=f'DWH_SIC!$L$2:$L${n4}'
KGGF=f'DWH_SIC!$R$2:$R${n4}'; KROL=f'DWH_SIC!$S$2:$S${n4}'; KEXF=f'DWH_SIC!$T$2:$T${n4}'; KSFE=f'DWH_SIC!$V$2:$V${n4}'; KSROL=f'DWH_SIC!$W$2:$W${n4}'; KSEXF=f'DWH_SIC!$X$2:$X${n4}'; KFEST=f'DWH_SIC!$Y$2:$Y${n4}'; KIN=f'DWH_SIC!$F$2:$F${n4}'
# etichette e rotte (riga 6 = dato esterno, resta digitato)
for rr in range(2,22):
    for cc in range(1,42):
        v=wso.cell(rr,cc).value
        if v is not None and (rr in (3,6,7,19,20,21) or cc in (1,2) or (cc-7)%5==0 or isinstance(v,str)): pg.cell(rr,cc,v)
pg['E2']='CDL base SIC tracciati (DWH_SIC)'; pg['F2']=f'=SUM({KCDL})'
pg['B2']='FERIE'
# SIC righe 8-11: teste e CDL medio per bucket
BUCK={8:'CTI FT',9:'CTI PT',10:'CTI PT 32h',11:'DISPATCHER'}
for rr,bk in BUCK.items():
    pg.cell(rr,2,bk); pg.cell(rr,3,'='+'+'.join(f'{gl(ci(c)+1)}{rr}' for c in STCOL.values())); pg.cell(rr,4,f'=IFERROR(E{rr}/C{rr},0)'); pg.cell(rr,5,'='+'+'.join(f'{gl(ci(c)+3)}{rr}' for c in STCOL.values()))
    for st,c in STCOL.items():
        b=ci(c); pg.cell(rr,b,bk)
        pg.cell(rr,b+1,f'=COUNTIFS({KS},"{st}",{KB},"{bk}")')
        # CDL: somma dei CDL noti + per chi manca in anagrafica il CDL medio del bucket nella station
        pg.cell(rr,b+2,f'=IFERROR({gl(b+3)}{rr}/{gl(b+1)}{rr},0)')
        pg.cell(rr,b+3,f'=SUMIFS({KCDL},{KS},"{st}",{KB},"{bk}")+COUNTIFS({KS},"{st}",{KB},"{bk}",{KIN},"NO")*IFERROR(AVERAGEIFS({KCDL},{KS},"{st}",{KB},"{bk}"),0)')
    pg.cell(rr,b+4,None)
pg['F8']='=SUM(E8:E11)'
for st,c in STCOL.items():
    b=ci(c); pg.cell(8,b+4,f'=SUM({gl(b+3)}8:{gl(b+3)}11)')
# SIC righe 12-18: ore x tariffe Parametri (stesse voci del foglio originale)
SICR={12:('TRASFERTE','TRASF',44),13:('TRASFERTE DOM.','TRASFDOM',45),14:('STR 30%','STR30',38),15:('SUPP 18%','SUPP18',41),16:('MAGG 50%','MAGG50',36),17:('STR 65%','STR65',39),18:('SUPP 65%','SUPP65',42)}
for rr,(lab,pk,src) in SICR.items():
    pg.cell(rr,2,lab); pg.cell(rr,3,'='+'+'.join(f'{gl(ci(c)+1)}{rr}' for c in STCOL.values())); pg.cell(rr,4,f'={P[pk]}'); pg.cell(rr,5,f'=C{rr}*D{rr}')
    for st,c in STCOL.items():
        b=ci(c); pg.cell(rr,b,lab); pg.cell(rr,b+1,f'={gl(b+1)}{src}'); pg.cell(rr,b+2,f'=$D{rr}'); pg.cell(rr,b+3,f'={gl(b+1)}{rr}*{gl(b+2)}{rr}')
pg['F12']='=SUM(E12:E13)'; pg['F14']='=SUM(E14:E18)'
for st,c in STCOL.items():
    b=ci(c); pg.cell(12,b+4,f'=SUM({gl(b+3)}12:{gl(b+3)}13)'); pg.cell(14,b+4,f'=SUM({gl(b+3)}14:{gl(b+3)}18)')
    pg.cell(4,b,f'={gl(b+4)}8+{gl(b+4)}12+{gl(b+4)}14')
pg['B4']='=F8+F12+F14'
# teste STD righe 19-21 (FT/PT/MOG): dal tracking STD non deducibili in modo affidabile -> teste totali in riga 20, MOG lasciato
for st,c in STCOL.items():
    b=ci(c); pg.cell(19,b,'STD FT'); pg.cell(19,b+1,wso.cell(19,b+1).value); pg.cell(20,b,'STD teste tracking'); pg.cell(20,b+1,'='+f'SUMIFS({"DWH_Ore_STD!$C$2:$C$"+str(n1)},{"DWH_Ore_STD!$A$2:$A$"+str(n1)},"{st}",{"DWH_Ore_STD!$B$2:$B$"+str(n1)},"Teste")'); pg.cell(21,b,'MOG'); pg.cell(21,b+1,wso.cell(21,b+1).value)
pg['F6']='=K6+P6+U6+Z6+AE6+AJ6+AO6'
# riga 2: ogni station la PROPRIA colonna (bug storico)
for st,c in STCOL.items():
    b=ci(c); pg.cell(2,b,f'=SUM({gl(b+1)}34:{gl(b+2)}34,{gl(b+1)}37:{gl(b+2)}37,{gl(b+1)}40:{gl(b+2)}40)')
pg['AP2']='=G2+L2+Q2+V2+AA2+AF2+AK2'
# righe 22-31 STD
labels={22:('Standard STD','STANDARD',35),23:('STR STD 30%','STR30',38),24:('SUPP STD 18%','SUPP18',41),25:('MAGG STD 50%','MAGG50',36),26:('STR STD 65%','STR65',39),27:('SUPP 65%','SUPP65',42),28:('TRASFERTA','TRASF',44),29:('TRASFERTA DOM','TRASFDOM',45)}
pg['A22']='STD'
for rr,(lab,pk,src) in labels.items():
    pg.cell(rr,2,lab); pg.cell(rr,4,f'={P[pk]}'); pg.cell(rr,3,'='+'+'.join(f'{gl(ci(c)+1)}{rr}' for c in STCOL.values())); pg.cell(rr,5,f'=C{rr}*D{rr}')
    for st,c in STCOL.items():
        b=ci(c); pg.cell(rr,b,lab); pg.cell(rr,b+1,f'={gl(b+2)}{src}'); pg.cell(rr,b+2,f'=$D{rr}'); pg.cell(rr,b+3,f'={gl(b+1)}{rr}*{gl(b+2)}{rr}')
pg['F22']='=SUM(E22:E27)'; pg['F28']='=SUM(E28:E29)'
for st,c in STCOL.items():
    b=ci(c); pg.cell(22,b+4,f'=SUM({gl(b+3)}22:{gl(b+3)}27)'); pg.cell(28,b+4,f'=SUM({gl(b+3)}28:{gl(b+3)}29)')
    pg.cell(5,b,f'={gl(b+4)}22+{gl(b+4)}28')
pg['B5']='=F22+F28'
# righe 33-45 ore (SIC da DWH_Ore_SIC, STD da DWH_Ore_STD)
hrs={34:('Standard tot','Standard','tot'),35:('Ordin',None,None),36:('magg 50%','Standard','dom'),37:('Strao tot','Straordinario','tot'),38:('STR STD 30%',None,None),39:('STR STD 65%','Straordinario','dom'),
     40:('Supp tot','Supplementare','tot'),41:('SUPP STD 18%',None,None),42:('SUPP 65%','Supplementare','dom'),43:('Trasf. TOT','Trasferta gg','tot'),44:('TRASFERTE',None,None),45:('TRASFERTE DOM.','Trasferta gg','dom')}
for st,c in STCOL.items():
    b=ci(c); pg.cell(33,b+1,'SIC'); pg.cell(33,b+2,'STD')
    for rr,(lab,voce,kind) in hrs.items():
        pg.cell(rr,b,lab)
        if kind=='tot': pg.cell(rr,b+2,'='+sumifs(OT,st,voce)); pg.cell(rr,b+1,'='+sumifs_sic(OTS,st,voce)+(f'-(1-{P["DISPTR"]})*'+sumifs_sic(OTS,st,'Trasferta gg dispatcher') if voce=='Trasferta gg' else ''))
        elif kind=='dom': pg.cell(rr,b+2,'='+sumifs(OD,st,voce)); pg.cell(rr,b+1,'='+sumifs_sic(ODS,st,voce)+(f'-(1-{P["DISPTR"]})*'+sumifs_sic(ODS,st,'Trasferta gg dispatcher') if voce=='Trasferta gg' else ''))
    for k in (1,2):
        pg.cell(35,b+k,f'={gl(b+k)}34-{gl(b+k)}36'); pg.cell(38,b+k,f'={gl(b+k)}37-{gl(b+k)}39'); pg.cell(41,b+k,f'={gl(b+k)}40-{gl(b+k)}42'); pg.cell(44,b+k,f'={gl(b+k)}43-{gl(b+k)}45')
# blocco nuovo 48+
pg['A48']='BLOCCO v2 — solo STD'; pg['A48'].font=B
new=[(49,'Ore Accordo 39-44h (esposte, non valorizzate: assorbite)',lambda st,b: '='+sumifs(OT,st,'Accordo')),
     (50,'Teste tracking STD',lambda st,b: '='+sumifs(OT,st,'Teste')),
     (51,'Teste ADIT ago (Stipendio)',lambda st,b: f'=SUMIFS(DWH_ADIT_AGO!$F$2:$F${n2},DWH_ADIT_AGO!$A$2:$A${n2},"{st}",DWH_ADIT_AGO!$B$2:$B${n2},"STANDARD")'),
     (52,'Teste ADIT set (Stipendio)',lambda st,b: f'=SUMIFS(DWH_ADIT_SET!$F$2:$F${n3},DWH_ADIT_SET!$A$2:$A${n3},"{st}",DWH_ADIT_SET!$B$2:$B${n3},"STANDARD")'),
     (54,'Festivi nel mese (nazionali + patrono)',lambda st,b: f'={NFEST[st]}'),
     (55,'Ore festività stimate = Standard tot / gg mese × festivi',lambda st,b: f'={gl(b+2)}34/{P["GGMESE"]}*{gl(b+2)}54'),
     (56,'€ Festività',lambda st,b: f'={gl(b+2)}55*{P["FESTIVITA"]}'),
     (57,'Ore Ferie+ROL+ExF godute (tracking)',lambda st,b: '='+sumifs(OT,st,'Ferie')+'+'+sumifs(OT,st,'ROL')+'+'+sumifs(OT,st,'ExF')),
     (58,'€ Ferie/ROL/ExF godute',lambda st,b: f'={gl(b+2)}57*{P["FERIE_PERM_GOD"]}'),
     (59,'Ore carenza malattia (primi 3 gg evento, tracking)',lambda st,b: '='+sumifs(OT,st,'Carenza malattia (ore primi 3 gg)')),
     (60,'€ Carenza malattia/infortunio (% ADIT ago su costo ore)',lambda st,b: f'={gl(b+4)}22*{P["CARENZAPCT"]}'),
     (61,'€ CTRB Decr. Dignità (ore lavorate × 0,10)',lambda st,b: f'=({gl(b+2)}34+{gl(b+2)}37+{gl(b+2)}40)*{P["CTRB"]}'),
     (62,'€ Altro (% su costo ore)',lambda st,b: f'={gl(b+4)}22*{P["ALTRO"]}'),
     (63,'€ Integrazione MOG',lambda st,b: f'={P["MOG"]}/7'),
     (64,'TOT voci non da tracking €',lambda st,b: f'={gl(b+2)}56+{gl(b+2)}58+{gl(b+2)}60+{gl(b+2)}61+{gl(b+2)}62+{gl(b+2)}63'),
     (66,'TOT COSTO STD v2 € (riga 5 + voci non da tracking)',lambda st,b: f'={gl(b)}5+{gl(b+2)}64'),
     (68,'ADIT set 2026 € (fattura reale, per validazione)',lambda st,b: f'=SUMIFS(DWH_ADIT_SET!$E$2:$E${n3},DWH_ADIT_SET!$A$2:$A${n3},"{st}")'),
     (69,'Delta v2 − ADIT €',lambda st,b: f'={gl(b+2)}66-{gl(b+2)}68'),
     (70,'Delta %',lambda st,b: f'=IF({gl(b+2)}68=0,"",{gl(b+2)}69/{gl(b+2)}68)'),
     (71,'(memo) Delta foglio originale − ADIT €',lambda st,b: f'={wso.cell(5,b).value}-{gl(b+2)}68'),
     (73,'Controllo: ore stima/ore ADIT set — Standard',lambda st,b: f'=IFERROR({gl(b+2)}35/SUMIFS(DWH_ADIT_SET!$D$2:$D${n3},DWH_ADIT_SET!$A$2:$A${n3},"{st}",DWH_ADIT_SET!$B$2:$B${n3},"STANDARD"),"")'),
     (74,'Controllo: ore stima/ore ADIT set — MAGG50',lambda st,b: f'=IFERROR({gl(b+2)}36/SUMIFS(DWH_ADIT_SET!$D$2:$D${n3},DWH_ADIT_SET!$A$2:$A${n3},"{st}",DWH_ADIT_SET!$B$2:$B${n3},"MAGG50"),"")'),
     (75,'Controllo: ore stima/ore ADIT set — STR30',lambda st,b: f'=IFERROR({gl(b+2)}38/SUMIFS(DWH_ADIT_SET!$D$2:$D${n3},DWH_ADIT_SET!$A$2:$A${n3},"{st}",DWH_ADIT_SET!$B$2:$B${n3},"STR30"),"")'),
     (76,'Controllo: ore stima/ore ADIT set — SUPP18',lambda st,b: f'=IFERROR({gl(b+2)}41/SUMIFS(DWH_ADIT_SET!$D$2:$D${n3},DWH_ADIT_SET!$A$2:$A${n3},"{st}",DWH_ADIT_SET!$B$2:$B${n3},"SUPP18"),"")'),
     (77,'Controllo: teste tracking / teste ADIT set',lambda st,b: f'=IFERROR({gl(b+2)}50/{gl(b+2)}52,"")')]
for rr,lab,f in new:
    pg.cell(rr,1,lab)
    for st,c in STCOL.items():
        b=ci(c); pg.cell(rr,b+2,f(st,b))
        if rr in (70,73,74,75,76,77): pg.cell(rr,b+2).number_format='0.0%' if rr==70 else '0.00'
        elif rr in (56,58,60,61,62,63,64,66,68,69,71): pg.cell(rr,b+2).number_format='#,##0'
    if rr not in (54,70,73,74,75,76,77):
        pg.cell(rr,3,'='+'+'.join(f'{gl(ci(c)+2)}{rr}' for c in STCOL.values())); pg.cell(rr,3).number_format='#,##0'
pg.cell(70,3,'=IF(C68=0,"",C69/C68)').number_format='0.0%'
pg['A80']='BLOCCO v2 — SIC (saving ratei goduti e festività, da DWH_SIC × anagrafica CDL 06/2026)'; pg['A80'].font=B
sic_new=[(81,'Teste SIC tracciate',lambda st,b: f'=COUNTIFS({KS},"{st}")'),
 (82,'di cui senza CDL in anagrafica (CDL = media bucket station)',lambda st,b: f'=COUNTIFS({KS},"{st}",{KIN},"NO")'),
 (83,'Ore Accordo SIC (esposte)',lambda st,b: '='+sumifs_sic(OTS,st,'Accordo')),
 (92,'gg trasferta dispatcher SIC (inclusi in riga 43 se Parametri = 1)',lambda st,b: '='+sumifs_sic(OTS,st,'Trasferta gg dispatcher')),
 (84,'gg Ferie godute (ore ferie / ore giornaliere contratto)',lambda st,b: f'=SUMIFS({KGGF},{KS},"{st}")'),
 (85,'€ Saving Ferie = Σ gg ferie × Saving FE €/gg del lavoratore',lambda st,b: f'=SUMPRODUCT(({KS}="{st}")*{KGGF}*{KSFE})'),
 (86,'h ROL godute',lambda st,b: f'=SUMIFS({KROL},{KS},"{st}")'),
 (87,'€ Saving ROL',lambda st,b: f'=SUMPRODUCT(({KS}="{st}")*{KROL}*{KSROL})'),
 (88,'h ExF godute',lambda st,b: f'=SUMIFS({KEXF},{KS},"{st}")'),
 (89,'€ Saving ExF',lambda st,b: f'=SUMPRODUCT(({KS}="{st}")*{KEXF}*{KSEXF})'),
 (90,'€ Saving totale ratei goduti',lambda st,b: f'={gl(b+2)}85+{gl(b+2)}87+{gl(b+2)}89'),
 (91,'€ Festività non godute SIC (festivi mese × Σ costo festività non goduta, potenziale max)',lambda st,b: f'={NFEST[st]}*SUMIFS({KFEST},{KS},"{st}")'),
 (93,'TOT COSTO SIC lordo (riga 4)',lambda st,b: f'={gl(b)}4'),
 (94,'TOT COSTO SIC NETTO = lordo − saving (DA CONFERMARE con Erika che il CDL base includa i ratei)',lambda st,b: f'={gl(b+2)}93-{gl(b+2)}90'),
 (96,'TOT COSTO SIC + STD v2 (SIC netto + STD v2)',lambda st,b: f'={gl(b+2)}94+{gl(b+2)}66')]
for rr,lab,f in sic_new:
    pg.cell(rr,1,lab)
    for st,c in STCOL.items():
        b=ci(c); pg.cell(rr,b+2,f(st,b)); pg.cell(rr,b+2).number_format='#,##0' if rr in (85,87,89,90,91,93,94,96) else '0.0'
        pass
    pg.cell(rr,3,'='+'+'.join(f'{gl(ci(c)+2)}{rr}' for c in STCOL.values())); pg.cell(rr,3).number_format='#,##0' if rr in (85,87,89,90,91,93,94,96) else '0.0'

pg.cell(1,1).font=B; pg.column_dimensions['A'].width=52
for c in range(2,43): pg.column_dimensions[gl(c)].width=11
pg.freeze_panes='B4'
# ---------- Rettifiche
wr=wb.create_sheet('Rettifiche',1)
rows=[['Cella/area','Prima (foglio originale)','Ora (v2)','Fonte','Delta € (v2 − orig)','Nota']]
A=pd.read_pickle('trk_agg.pkl')
cmp=pd.read_pickle('cmp_st_voce.pkl')
rate={'STANDARD':20.86,'MAGG50':28.56,'STR30':20.11,'STR65':25.52,'SUPP18':18.25,'SUPP65':25.52}
for st in ST:
    x=A.loc[(st,'09')]; trk={'STANDARD':x.STD_tot-x.STD_dom,'MAGG50':x.STD_dom,'STR30':x.STR_tot-x.STR_dom,'STR65':x.STR_dom,'SUPP18':x.SUPP_tot-x.SUPP_dom,'SUPP65':x.SUPP_dom}
    for v,h in trk.items():
        hs=cmp.loc[('0926',st,v),'h_stima']
        if abs(hs-h)>0.5: rows.append([f'{st} ore {v}',round(hs,1),round(h,1),'tracking STD settembre (ricalcolo)',round((h-hs)*rate[v],2),'cella digitata ≠ tracking' if abs(hs-h)>5 else 'arrotondamento'])
    hs=cmp.loc[('0926',st,'TRASFERTA'),'h_stima']
    if abs(hs-x.trasf_tot)>0.5: rows.append([f'{st} gg trasferta',round(hs),int(x.trasf_tot),'tracking STD settembre (ore>4)',round((x.trasf_tot-hs)*22.5,2),'DLO4: file che sconfina su due mesi' if st=='DLO4' else ''])
for st in ST:
    for rr,bk in BUCK.items():
        hs=wso.cell(rr,ci(STCOL[st])+1).value or 0; hn=int((dwh_sic.Station.eq(st)&dwh_sic.Bucket.eq(bk)).sum())
        if hs!=hn: rows.append([f'{st} teste {bk}',hs,hn,'tracking SIC set × bucket contratto','',''])
    cs=wso.cell(4,ci(STCOL[st])).value
    rows.append([f'{st} TOT COSTO SIC (riga 4)',round(cs,2),'formula v2 (CDL per CF + ore × Parametri)','DWH_SIC + DWH_Ore_SIC','vedi pagina riga 4',''])
for r_ in dwh_sic[dwh_sic['CDL in anagrafica']=='NO'].itertuples():
    rows.append([f'{r_.Station} {r_.Lavoratore}','CDL assente in anagrafica 06/2026',f'CDL = media bucket {r_.Bucket} della station','DWH_SIC','',f'CF {r_.CF} — {r_.Contratto}'])
for r_ in cdl_non_tracciati.itertuples():
    rows.append([f'{r_._3} {r_.COGNOME} {r_.NOME}',f'in anagrafica CDL 06/2026 ({r_.CONTRATTO}, {r_.CDL:,.0f} €)','non presente nel tracking SIC di settembre: escluso','anagrafica CDL','',''])
rows+= [['B4 TOT COSTO SIC',"era: F2 + 'AMZ_APR_26'!F12 + 'AMZ_APR_26'!F14 (puntava ad aprile!)",'ora: F8+F12+F14','bug formula','',''],
        ['F2 costo SIC cdl base','1.256.309,94 = tutta l\'anagrafica (403 teste)','Σ CDL dei soli tracciati (394 teste, 8 con CDL medio)','DWH_SIC','',''],
        ['Righe 80-96 blocco SIC','assente','saving ferie/ROL/ExF goduti per lavoratore, festività non godute, SIC netto','DWH_SIC × anagrafica','','saving da confermare con Erika (doppio conteggio se il CDL è già netto)'],
        ['Riga 2 (ore SIC+STD per station)','L2 sommava R:S (DLO2), AK2 non sommava DVN1','ogni station somma la propria colonna','bug storico','',''],
        ['D22:D29 tariffe','20,86/20,11/18,25/28,56/25,52/25,01/22,5/29,5 digitate','tariffe = Parametri (ADIT agosto)','ADIT 0826','≈0','SUPP 65% → tariffa STR65 (25,52): la voce a 25,01 non esiste in fattura'],
        ['Righe 49-64 blocco voci non da tracking','assente','festività (patroni inclusi), ferie/ROL/ExF godute, carenza malattia, CTRB, altro, MOG','ADIT + tracking','vedi riga 64 della pagina','prima erano il delta "strutturale" −2/−4% ogni mese'],
        ['Righe 66-77 controllo vs ADIT set','assente','TOT v2 vs fattura reale e rapporti ore per voce','ADIT 0926','',''],
        ['A1','"AGOSTO"','"SETTEMBRE 2026 — v2"','',''],
        ['Residui altri mesi in fattura set', '', set_res, 'ADIT 0926 MeseCompetenza ≠ 2026-09','','non stimabili: restano nel delta']]
for r in rows: wr.append(r)
t=Table(displayName='Rettifiche', ref=f'A1:F{len(rows)}'); t.tableStyleInfo=TableStyleInfo(name='TableStyleMedium2',showRowStripes=True); wr.add_table(t)
for i,wd in enumerate([34,40,40,34,16,60],1): wr.column_dimensions[gl(i)].width=wd
wb.move_sheet('Parametri', offset=-(len(wb.sheetnames)-3))
out='out/Stima_AMZ_SEP_26_v2.xlsx'; wb.save(out); print('scritto', out, wb.sheetnames)
