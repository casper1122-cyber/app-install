"""Small, non-mutating coverage gate for TWSE delisted events vs 54h stock universe."""
import json,zipfile,csv,io,re,sys
from datetime import date
from pathlib import Path
def load_54h(path):
 with zipfile.ZipFile(path) as z:return json.loads(z.read('stk/hist.json'))['a']
def roc_date(s):
 m=re.fullmatch(r'(\d{2,3})/(\d{2})/(\d{2})',s.strip())
 if not m: raise ValueError(f'invalid ROC date: {s}')
 a,b,c=map(int,m.groups());return date(a+1911,b,c).isoformat()
def read_reference(path):
 data=Path(path).read_text(encoding='utf-8-sig')
 return [{'date':roc_date(r['roc_date']),'name':r['name'],'code':r['code']} for r in csv.DictReader(io.StringIO(data))]
def check(stocks,events,asof='2026-09-30'):
 absent=[];ambiguous=[];seen=set()
 for r in events:
  if r['date']>asof:continue
  key=(r['code'],r['date'])
  if key in seen:raise ValueError(f'duplicate {key}')
  seen.add(key)
  obj=stocks.get(r['code'])
  if obj is None:absent.append(r)
  else:ambiguous.append(dict(r,current_name=obj.get('n'),current_market=obj.get('mk'),reason='REQUIRES_CORPORATE_ACTION_RECONCILIATION'))
 return {'events_checked':len(seen),'missing':len(absent),'ambiguous_or_migrated':len(ambiguous),'missing_rows':absent,'review_rows':ambiguous,'can_derive_loss_probability':False,'grade_release':'BLOCK'}
if __name__=='__main__':
 if len(sys.argv)!=3:raise SystemExit('usage: python coverage_gate.py <54h.zip> <official_reference.csv>')
 r=check(load_54h(Path(sys.argv[1])),read_reference(Path(sys.argv[2])))
 print(json.dumps(r,ensure_ascii=False,indent=2))
