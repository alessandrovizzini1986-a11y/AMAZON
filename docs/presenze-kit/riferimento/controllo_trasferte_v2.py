"""
Controllo indennità di trasferta: tracking (STD+SIC) vs export Amazon (CSV giornalieri).
USO: python3 controllo_trasferte_v2.py <cartella_input> <STATION> <da AAAA-MM-GG> <a AAAA-MM-GG> <output.xlsx>
Cartella input: 2 tracking della station (nome con STD/std e SIC/Sic + sigla) + CSV Amazon (uno per giorno, colonna Data).
Stessa logica di controllo_trasferte.py; differenze:
 - fogli mese: accetta anche '10_26'
 - giorni: dopo il 31 il giorno successivo e' mese+1 (colonna 1 novembre non piu' confusa col 1 ottobre)
 - fogli con intestazioni-data e colonne 'totale' intercalate (DLO5/DVN1): i totali vengono saltati, non fermano la lettura
 - valori giornalieri > 24 h = cella anomala (XLOOKUP esterno), azzerata e segnalata in Anomalie_file
 - output a matrice driver x giorno (come il format manuale) + Alert + Dettaglio
"""
import openpyxl, glob, re, csv, sys, datetime as dt
from collections import defaultdict
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.utils import get_column_letter

ATT = sys.argv[1].rstrip('/') + '/'; STATION = sys.argv[2].upper()
D_FROM, D_TO = dt.date.fromisoformat(sys.argv[3]), dt.date.fromisoformat(sys.argv[4]); OUT = sys.argv[5]
MESI = {1:'gennaio',2:'febbraio',3:'marzo',4:'aprile',5:'maggio',6:'giugno',7:'luglio',8:'agosto',9:'settembre',10:'ottobre',11:'novembre',12:'dicembre'}
SOGLIA_ORE, SOGLIA_PACCHI, IND_EUR = 4, 10, 22.50
WORK = {'standard','straordinario','supplementare','accordo (dalla ora 39 a 44)'}
ABS = {'ferie','rol','exf','104','assenza ingiust.','assenza ingiustificata','permesso sindacale','altri permessi (104, cong. par)',
       'altri permesssi (104, cong. par)','altri permessi (cong. par)','permesso non retribuito','malattia','infortunio'}
GG = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom']

def num(v):
    if v is None: return 0.0
    if isinstance(v,(int,float)): return float(v)
    try: return float(str(v).strip().replace(',','.'))
    except: return 0.0
def norm(s): return ' '.join(sorted(re.sub(r'[^a-z ]',' ',str(s).lower()).split()))

AM_IDS=set()
def parse_tracking(path, tipo_file):
    wb = openpyxl.load_workbook(path, data_only=True)
    wbf = openpyxl.load_workbook(path, data_only=False)
    mm, yy = D_FROM.month, D_FROM.year
    if D_TO.month != mm and D_TO.day > 7:  # periodo a cavallo: si usa il foglio del mese di D_TO solo se D_FROM e' fine mese precedente
        pass
    sheet_month = D_TO.month if D_FROM.month != D_TO.month else mm
    mm = sheet_month
    cands = {f'{mm:02d}.{yy%100:02d}', f'{mm:02d}_{yy%100:02d}', MESI[mm]+str(yy), MESI[mm]+' '+str(yy), MESI[mm]}
    cands = {c.lower().replace(' ','') for c in cands}
    ws = next((wb[s] for s in wb.sheetnames if s.strip().lower().replace(' ','') in cands), None)
    if ws is None: raise SystemExit(f'Foglio del mese {mm:02d}/{yy} non trovato in {path}: fogli = {wb.sheetnames}')
    wsf = wbf[ws.title]
    hdr=None
    for r in range(1,8):
        vals=[str(ws.cell(r,c).value or '').strip().lower() for c in range(1,12)]
        if 'tipo' in vals:
            hdr=r; tc=vals.index('tipo')+1
            def col(*opts):
                for o in opts:
                    for i,v in enumerate(vals):
                        if v.startswith(o): return i+1
                return None
            idc=col('driver id','id'); namec=col('lavoratore','driver'); cfc=col('codice fiscale'); contrc=col('tipo contratto')
            if not (idc and namec and contrc): raise SystemExit(f'Intestazione non riconosciuta in {path}: {vals}')
            break
    if hdr is None: raise SystemExit(f'Riga intestazione non trovata in {path}')
    # colonne giorno
    daycols={}; month=None; prev=None; intmode=None
    for c in range(tc+1, ws.max_column+1):
        v=ws.cell(hdr,c).value
        if v is None: continue
        if isinstance(v,dt.datetime): daycols[c]=v.date(); intmode=False; continue
        s=str(v).strip()
        if s.lower().startswith('tot') or s.lower().startswith('somma'):
            if intmode: break      # intestazioni numeriche: dopo Totale ci sono i subtotali settimanali
            continue               # intestazioni-data: totali intercalati, si saltano
        if re.fullmatch(r'\d{1,2}', s) and 1<=int(s)<=31:
            d=int(s); intmode=True
            if month is None: month = mm-1 if d>=28 else mm
            elif prev is not None and d<prev: month+=1
            prev=d
            y = yy + (1 if month==13 else 0); m = 12 if month==0 else (1 if month==13 else month)
            try: daycols[c]=dt.date(y,m,d)
            except ValueError: pass
    blocks=[]
    for r in range(hdr+1, ws.max_row+1):
        t=ws.cell(r,tc).value
        if t is None: continue
        if str(t).strip().lower()=='standard': blocks.append([r])
        elif blocks: blocks[-1].append(r)
    rows=defaultdict(lambda: defaultdict(dict)); info={}; anomalie=[]
    for b in blocks:
        r0=b[0]; nome=str(ws.cell(r0,namec).value or '').strip()
        def okid(v): return v not in (None,'',' ') and str(v).strip().upper() not in ('0','-','NA','N/A','NESSUNO','X')
        ids=[str(ws.cell(r,idc).value).strip().upper() for r in b if okid(ws.cell(r,idc).value)]
        id0=str(ws.cell(r0,idc).value).strip().upper() if okid(ws.cell(r0,idc).value) else None
        in_am=[i for i in set(ids) if i in AM_IDS]
        did=in_am[0] if len(in_am)==1 else (id0 or (max(set(ids),key=ids.count) if ids else None))
        if not did: did='NOID|'+norm(nome); anomalie.append((tipo_file,r0,nome,'Driver ID mancante'))
        elif len(set(ids))>1: anomalie.append((tipo_file,r0,nome,f'ID diversi nello stesso blocco: {sorted(set(ids))}'))
        key=(tipo_file,did)
        if key in info: anomalie.append((tipo_file,r0,nome,f'Driver duplicato nel file (ID {did})'))
        info[key]=dict(nome=nome, cf=ws.cell(r0,cfc).value if cfc else None, contratto=ws.cell(r0,contrc).value, tipo=tipo_file, riga=r0, id=did)
        for r in b:
            tl=str(ws.cell(r,tc).value).strip().lower()
            for c,date in daycols.items():
                v=ws.cell(r,c).value; x=num(v); rec=rows[key][date]
                if tl in WORK or tl in ABS or tl=='totali':
                    if x>24:
                        if D_FROM<=date<=D_TO: anomalie.append((tipo_file,r,nome,f'Valore anomalo {x:g} h il {date:%d/%m} riga {tl} (cella collegata a file esterno?) - ignorato'))
                        x=0
                if tl in WORK: rec['ore_lav']=rec.get('ore_lav',0)+x
                elif tl in ABS: rec['ore_ass']=rec.get('ore_ass',0)+x
                elif tl=='totali': rec['totali_file']=x
                elif tl=='riposo':
                    if v not in (None,'',' '): rec['riposo']=str(v).strip()
                elif tl=='indennità trasferta':
                    rec['trasf_file']=x
                    fv=wsf.cell(r,c).value
                    rec['trasf_formula']=isinstance(fv,str) and fv.startswith('=')
    stale=0; manual=0; mdrv={}
    for key,days_ in rows.items():
        for date,rec in days_.items():
            if 'trasf_formula' not in rec: continue
            calc=1 if rec.get('ore_lav',0)>SOGLIA_ORE else 0
            if rec['trasf_formula']:
                if int(rec['trasf_file'])!=calc: stale+=1
                rec['trasf_trk']=calc          # formula: si usa il ricalcolo (il valore salvato puo' essere non aggiornato)
            else:
                manual+=1; rec['trasf_trk']=int(rec['trasf_file'])   # valore scritto a mano: si usa quello
                mdrv.setdefault(key,[]).append(date)
    if stale: anomalie.append((tipo_file,'','(file)',f'{stale} celle "Indennità Trasferta" con formula il cui valore salvato non corrisponde alle ore (file non ricalcolato): usato il ricalcolo'))
    if manual: anomalie.append((tipo_file,'','(file)',f'Info: {manual} celle "Indennità Trasferta" scritte a mano su {len(mdrv)} driver (0 a mano = ignorato; 1 a mano senza ore/rotta = alert)'))
    return rows, info, daycols, anomalie

def parse_amazon():
    am={}
    for f in glob.glob(ATT+'*.csv'):
        with open(f, encoding='utf-8-sig') as fh:
            rd=csv.DictReader(fh)
            cols={c.strip().replace('’',"'"):c for c in rd.fieldnames}
            def g(row,name):
                for k,orig in cols.items():
                    if k.lower().startswith(name.lower()): return row[orig]
                return None
            for row in rd:
                stcol=g(row,'Station')
                if stcol is not None and stcol.strip().upper()!=STATION: continue   # file unico multi-station: tengo solo la station richiesta
                d=dt.date.fromisoformat(g(row,'Data').strip()[:10])
                did=(g(row,'ID addetto') or '').strip().upper()
                if not did: continue
                am[(did,d)]=dict(nome=g(row,"Nome dell'addetto") or '', pacchi=int(num(g(row,'Pacchi consegnati'))),
                                  spediti=int(num(g(row,'Pacchi spediti'))), dnr=int(num(g(row,'Pacchi consegnati non'))))
    return am

am=parse_amazon(); AM_IDS.update(i for i,_ in am)
if not am: raise SystemExit('Nessun CSV Amazon trovato nella cartella input')
def find(tag):
    c=[f for f in glob.glob(ATT+'*.xls*') if STATION in f.upper() and tag in f.upper() and 'FORMAT' not in f.upper()]
    if len(c)!=1: raise SystemExit(f'Tracking {tag} {STATION}: trovati {len(c)} file {c}')
    return c[0]
files={'STD':find('STD'),'SIC':find('SIC')}
allrows,allinfo,anom={},{},[]
for tipo,p in files.items():
    rows,info,dc,an=parse_tracking(p,tipo); allrows.update(rows); allinfo.update(info); anom+=an
ids_std={k[1] for k in allinfo if k[0]=='STD'}; ids_sic={k[1] for k in allinfo if k[0]=='SIC'}
for d in ids_std & ids_sic:
    anom.append(('STD+SIC','',allinfo[('STD',d)]['nome'],f'Stesso Driver ID {d} in STD e SIC: ore unite'))
    a,b=allrows[('STD',d)],allrows[('SIC',d)]
    for date in set(a)|set(b):
        m={k:a.get(date,{}).get(k,0)+b.get(date,{}).get(k,0) for k in ('ore_lav','ore_ass','totali_file','trasf_file','trasf_trk')}
        m['trasf_file']=min(1,m['trasf_file']); m['trasf_trk']=min(1,m['trasf_trk']); m['riposo']=a.get(date,{}).get('riposo') or b.get(date,{}).get('riposo') or ''; a[date]=m
    allinfo[('STD',d)]['tipo']='STD+SIC'; del allinfo[('SIC',d)]; del allrows[('SIC',d)]
am_by_name={(norm(a['nome']),d):a for (i,d),a in am.items()}
am_names={norm(a['nome']) for a in am.values()}
def fuzzy(nome):
    # nome tracking piu' lungo del nome Amazon (es. doppio cognome): match se le parole Amazon sono tutte nel nome tracking, unico
    w=set(norm(nome).split()); c=[n for n in am_names if len(n.split())>=2 and n!=norm(nome) and (set(n.split())<=w or (len(w)>=2 and w<=set(n.split())))]
    return c[0] if len(c)==1 else None
days=[D_FROM+dt.timedelta(days=i) for i in range((D_TO-D_FROM).days+1)]
am_days=sorted({d for _,d in am if D_FROM<=d<=D_TO})
missing_csv=[d for d in days if d not in am_days]

dettaglio,alert=[],[]
for key,inf in sorted(allinfo.items(), key=lambda kv:(kv[1]['tipo'],norm(kv[1]['nome']))):
    did=inf['id']
    for d in days:
        rec=allrows[key].get(d,{}); ore=rec.get('ore_lav',0); ass=rec.get('ore_ass',0)
        t_calc=1 if ore>SOGLIA_ORE else 0; t_file=int(rec.get('trasf_trk', rec.get('trasf_file',0)))
        manual0 = ('trasf_formula' in rec and not rec['trasf_formula'] and t_file==0)
        rip=str(rec.get('riposo','') or '').strip().upper()
        NONGUIDA={'MEZZI','SM','UFF','UFFICIO','CORSO','FORMAZIONE','MAGAZZINO','OFFICINA'}
        ALTRADS=bool(re.fullmatch(r'D[A-Z]{2}\d|ORIGGIO|BUCCINASCO|VALSAMOGGIA|SANTARCANGELO|CASTEGNATO|POMEZIA|VIGONZA',rip))
        a=am.get((did,d)); via='ID'
        if a is None: a=am_by_name.get((norm(inf['nome']),d)); via='NOME' if a else ''
        if a is None:
            fz=fuzzy(inf['nome'])
            if fz: a=am_by_name.get((fz,d)); via='NOME~' if a else ''
        pacchi=a['pacchi'] if a else None; flex=1 if (pacchi or 0)>SOGLIA_PACCHI else 0
        delta=t_file-flex; esito,nota,cat='OK','',''
        if d in missing_csv:
            esito='N/D'; nota='CSV Amazon mancante per questo giorno'; cat='F. Giorno senza export Amazon'
        elif t_file==1 and flex==0:
            esito='ALERT +1'
            if ass>0 and ore==0: cat='A. Trasferta su giorno di assenza'; nota=f'{ass:g} h di assenza e 0 h lavorate: la formula Totali include le assenze'
            elif a is None: cat='B. Driver non in Amazon'; nota=f'Tracking {ore:g} h con trasferta, nessuna riga Amazon quel giorno: chiedere agli Operations'
            else: cat='C. Sotto soglia pacchi'; nota=f'Tracking {ore:g} h con trasferta, Amazon solo {pacchi} pacchi (rescue/attivita non di consegna?)'
        elif t_file==0 and flex==1 and manual0 and ore>0:
            esito='OK'; nota=f'Trasferta 0 scritta a mano con {ore:g} h e {pacchi} pacchi: considerata voluta'
        elif t_file==0 and flex==1:
            esito='ALERT -1'
            if ore>SOGLIA_ORE: cat='D. Ore >4 nel tracking ma trasferta 0 (formula)'; nota=f'Tracking {ore:g} h, trasferta 0; Amazon {pacchi} pacchi'
            elif ore==SOGLIA_ORE: esito='OK'; nota=''
            elif ore>0: cat='D3. Ore <4 nel tracking, Amazon in rotta'; nota=f'Tracking solo {ore:g} h, Amazon {pacchi} pacchi: ore probabilmente incomplete'
            else: cat='D. Nessuna ora nel tracking, Amazon in rotta'; nota=f'Amazon {pacchi} pacchi, tracking 0 h: giornata mancante nel tracking'
        if esito=='ALERT +1' and rip in NONGUIDA:
            esito='OK'; cat=''; nota=f'Giustificativo {rip} nel tracking: nessun alert'
        elif esito=='ALERT +1' and ALTRADS:
            esito='OK'; cat=''; nota=f'Prestato ad altra station ({rip}): trasferta giustificata, verificare nel CSV di {rip}'
        elif esito=='ALERT +1' and rip=='RESCUE':
            esito='OK'; cat=''; nota='Rescue: indennita dovuta (art. 8b)'
        elif esito=='OK' and rip=='RESCUE' and t_file==0 and ore>SOGLIA_ORE:
            esito='CHECK formula'; cat='I. Rescue senza trasferta: indennita dovuta'; nota=f'Codice RESCUE con {ore:g} h ma trasferta 0'
        if esito in ('OK','ALERT +1','ALERT -1') and t_file==1 and t_calc==0:
            nota=(nota+' | ' if nota else '')+f'trasferta = 1 scritta a mano ma solo {ore:g} h lavorate'
            if esito=='OK': esito='CHECK formula'; cat='E. Trasferta 1 scritta a mano con ore <=4'
        row=dict(Station=STATION,Tipo=inf['tipo'],Driver=inf['nome'],DriverID=did,Contratto=inf['contratto'],Data=d,Giorno=GG[d.weekday()],
                 OreLavorate=ore,OreAssenza=ass,TrasfFile=t_file,TrasfRicalcolata=t_calc,PacchiAmazon=pacchi,MatchAmazon=via,Riposo=rip,
                 InRottaAmazon=flex,Delta=delta,Esito=esito,Categoria=cat,Nota=nota)
        dettaglio.append(row)
        if esito not in ('OK','N/D'): alert.append(row)

id_proposti=[]
am_name_ids=defaultdict(set)
for (i,d),a in am.items(): am_name_ids[norm(a['nome'])].add(i)
for key,inf in allinfo.items():
    if inf['id'].startswith('NOID|'):
        ids=sorted(am_name_ids.get(norm(inf['nome']),[])) or sorted(am_name_ids.get(fuzzy(inf['nome']) or '',[]))
        id_proposti.append(dict(File=inf['tipo'],Riga=inf['riga'],Driver=inf['nome'],DriverID_Amazon=(ids[0] if len(ids)==1 else ('' if not ids else ' / '.join(ids))),
                                Esito=('trovato' if len(ids)==1 else ('ambiguo' if ids else 'NON trovato in Amazon'))))
non_abb=[]
ids_trk={i['id'] for i in allinfo.values()}; names_trk={norm(i['nome']) for i in allinfo.values()}|{fuzzy(i['nome']) for i in allinfo.values() if fuzzy(i['nome'])}
for (did,d),a in sorted(am.items(), key=lambda x:(x[0][1],x[0][0])):
    if did not in ids_trk and norm(a['nome']) not in names_trk and D_FROM<=d<=D_TO:
        non_abb.append(dict(Data=d,Driver=a['nome'],DriverID=did,Pacchi=a['pacchi'],InRotta=1 if a['pacchi']>SOGLIA_PACCHI else 0))

riep=[]
for tipo in ('STD','SIC','TOT'):
    sub=[r for r in dettaglio if (tipo=='TOT' or tipo in r['Tipo']) and r['Esito']!='N/D']
    p1=sum(1 for r in sub if r['Esito']=='ALERT +1'); m1=sum(1 for r in sub if r['Esito']=='ALERT -1')
    m1e=m1
    riep.append(dict(Tipo=tipo, Driver=len({r['DriverID'] for r in sub}), TrasferteTracking=sum(r['TrasfFile'] for r in sub),
        GiorniInRottaAmazon=sum(r['InRottaAmazon'] for r in sub), Alert_piu1=p1, Alert_meno1=m1,
        Trasf1_a_mano_senza_ore=sum(1 for r in sub if r['Esito']=='CHECK formula'), EUR_piu1=p1*IND_EUR, EUR_meno1=m1e*IND_EUR))

def write(ws, rows, name, widths=None):
    if not rows: ws.append(['nessun record']); return
    cols=list(rows[0].keys()); ws.append(cols)
    for r in rows: ws.append([r[c] for c in cols])
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            if isinstance(cell.value,dt.date): cell.number_format='DD/MM/YYYY'
    t=Table(displayName=name, ref=f"A1:{get_column_letter(len(cols))}{len(rows)+1}"); t.tableStyleInfo=TableStyleInfo(name='TableStyleMedium2',showRowStripes=True); ws.add_table(t)
    for i,c in enumerate(cols,1): ws.column_dimensions[get_column_letter(i)].width=(widths or {}).get(c, max(8,min(40,len(str(c))+3)))

# MATRICE driver x giorno: una colonna per giorno. Simboli: ok = trasferta e rotta Amazon coincidono; +1 = trasferta senza rotta; -1 = rotta senza trasferta; 4h = turno 4 h esatte (PT) con rotta; vuoto = nessuna attivita
def simb(r):
    if r['Esito']=='N/D': return '?'
    if r['Esito']=='ALERT +1': return '+1'
    if r['Esito']=='ALERT -1': return '-1'
    if r['TrasfFile']==1: return 'ok'
    return ''
matrice=[]; by_drv=defaultdict(list)
for r in dettaglio: by_drv[(r['Tipo'],r['Driver'],r['DriverID'],r['Contratto'])].append(r)
for (tipo,nome,did,ctr),rs in by_drv.items():
    row={'Tipo':tipo,'Driver':nome,'DriverID':did,'Contratto':ctr}
    for r in rs: row[f"{r['Data']:%d/%m} {r['Giorno']}"]=simb(r)
    row['Trasf.Trk']=sum(r['TrasfFile'] for r in rs); row['Rotte Amz']=sum(r['InRottaAmazon'] for r in rs)
    row['+1']=sum(1 for r in rs if r['Esito']=='ALERT +1'); row['-1']=sum(1 for r in rs if r['Esito']=='ALERT -1')
    row['Check']=sum(1 for r in rs if r['Esito']=='CHECK formula')
    matrice.append(row)
matrice.sort(key=lambda r:(-(r['+1']+r['-1']), r['Tipo'], r['Driver']))

wb=openpyxl.Workbook(); ws0=wb.active; ws0.title='Riepilogo'; write(ws0,riep,'Riepilogo')
ws0.append([]); ws0.append(['Station',STATION]); ws0.append(['Periodo',f'{D_FROM:%d/%m/%Y} - {D_TO:%d/%m/%Y}'])
ws0.append(['Giorni con CSV Amazon',', '.join(f'{d:%d/%m}' for d in am_days)])
if missing_csv: ws0.append(['Giorni SENZA CSV Amazon (esclusi)',', '.join(f'{d:%d/%m}' for d in missing_csv)])
ws0.append(['Regole','Trasferta tracking = riga "Indennità Trasferta"; In rotta Amazon = pacchi consegnati > 10; Delta = Trk - Amz; +1 = da chiedere agli Operations, -1 = ore mancanti nel tracking'])
ws0.append(['Legenda categorie','+1 (tracking paga, Amazon no): A trasferta su giorno di assenza | B driver assente in Amazon | C sotto soglia pacchi.  -1 (Amazon in rotta, tracking no): D nessuna ora | D3 ore <4.  Altro: E trasferta = 1 scritta a mano con ore <=4 | F giorno senza CSV | I RESCUE senza trasferta (dovuta). Giustificati, mai alert: servizio 4 h con rotta, MEZZI/UFF/CORSO, prestito ad altra station, rescue.  Trasferta 0 scritta a mano = voluta, mai alert'])
write(wb.create_sheet('Matrice'),matrice,'Matrice',{'Driver':30,'DriverID':16,'Contratto':12})
mw=wb['Matrice']
for i,c in enumerate(list(matrice[0].keys()) if matrice else [],1):
    if '/' in c: mw.column_dimensions[get_column_letter(i)].width=5.5
mw.freeze_panes='E2'
ws0.append(['Legenda Matrice','ok = trasferta tracking e rotta Amazon coincidono | +1 = trasferta nel tracking, Amazon no | -1 = Amazon in rotta, tracking senza trasferta | vuoto = nessuna attivita o caso giustificato (4 h, MEZZI/UFF/CORSO, prestito ad altra station, rescue)'])
write(wb.create_sheet('Alert'),alert,'Alert',{'Driver':30,'Nota':70,'Categoria':45,'Riposo':9})
write(wb.create_sheet('Dettaglio'),dettaglio,'Dettaglio',{'Driver':30,'Nota':60})
write(wb.create_sheet('Amazon_non_in_tracking'),non_abb,'NonAbbinati',{'Driver':30})
write(wb.create_sheet('DriverID_mancanti'),id_proposti,'IDMancanti',{'Driver':30,'DriverID_Amazon':18,'Esito':22})
write(wb.create_sheet('Anomalie_file'),[dict(File=a[0],Riga=a[1],Driver=a[2],Anomalia=a[3]) for a in anom],'Anomalie',{'Driver':30,'Anomalia':80})
wb.save(OUT)
print('CSV giorni:',[f'{d:%d/%m}' for d in am_days],'| mancanti:',[f'{d:%d/%m}' for d in missing_csv])
print('anomalie file:',len(anom))
for r in riep: print(r)
print('alert:',len(alert),'| amazon non in tracking:',len(non_abb))
