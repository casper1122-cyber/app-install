"""TWSE historical valuation snapshot -> evidence rows, never invented release times."""
import re
from datetime import date
FIELDS={'pe':('本益比','PE'),'pb':('股價淨值比','PBR'),'dy':('殖利率(%)','殖利率％','殖利率')}
def num(v):
 if v is None or isinstance(v,bool):return None
 s=str(v).strip().replace(',','').replace('%','')
 if s in ('','--','-','N/A','NaN','null','除權息','—'):return None
 try:
  x=float(s);return x if x==x and abs(x)!=float('inf') else None
 except ValueError:return None
def field_index(fields,aliases):
 return next((i for i,f in enumerate(fields) if str(f).strip() in aliases),None)
def normalize_day(v):
 s=str(v).replace('/','-').strip()
 if re.fullmatch(r'\d{8}',s):return date(int(s[:4]),int(s[4:6]),int(s[6:]))
 if re.fullmatch(r'\d{3}-\d{1,2}-\d{1,2}',s):
  y,m,d=map(int,s.split('-'));return date(y+1911,m,d)
 return date.fromisoformat(s)
def convert_snapshot(snapshot,*,observed_day,source_url,downloaded_at):
 if not isinstance(source_url,str) or not source_url.startswith('https://'):raise ValueError('HTTPS source required')
 if not downloaded_at:raise ValueError('retrieval timestamp required')
 day=normalize_day(observed_day).isoformat()
 table=snapshot.get('pe') if isinstance(snapshot,dict) and 'pe' in snapshot else snapshot
 fields=table.get('f',table.get('fields',[]));data=table.get('r',table.get('data',[]))
 code_i=field_index(fields,('證券代號','股票代號','代號'))
 if code_i is None:raise ValueError('missing stock code')
 indices={k:field_index(fields,v) for k,v in FIELDS.items()}
 if all(i is None for i in indices.values()):raise ValueError('no valuation columns')
 out=[]
 for r in data:
  if len(r)<=code_i:continue
  code=str(r[code_i]).strip()
  if not re.fullmatch(r'[0-9A-Z]{4,10}',code):continue
  for key,i in indices.items():
   if i is None or i>=len(r):continue
   value=num(r[i])
   if value is None or (key in ('pe','pb') and value<=0) or (key=='dy' and value<0):continue
   out.append({'asset_id':code,'feature':key,'value':value,'period_end':day,
     'observed_at':day,'published_at':None,'retrieved_at':downloaded_at,
     'source_id':'TWSE_BWIBBU_d','source_url':source_url,
     'evidence_kind':'historical_exchange_snapshot','availability':'unverified','real_observation':True})
 return out
def available_by(feature,decision_date,*,decision_time='09:00',verified_publication=None,mode='strict',lag_days=1):
 from pit_release_gate import judge
 if verified_publication is not None:feature=dict(feature,published_at=verified_publication)
 return judge(feature,f'{decision_date}T{decision_time}+08:00',
  policy='verified' if mode=='strict' else 'sensitivity',lag_days=lag_days)['allowed']
