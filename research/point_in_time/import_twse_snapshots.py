"""Import locally archived TWSE historical BWIBBU_d JSON; no invented publication times."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, json, re
from twse_pit import convert_snapshot
from validate_twse_response import validate_response
from twse_openapi_adapter import adapt_openapi
def parse_snapshot(raw):
 if isinstance(raw.get('pe'),dict):return raw
 if 'tables' in raw:
  t=next((x for x in raw['tables'] if '本益比' in (x.get('fields') or []) and '證券代號' in (x.get('fields') or [])),None)
  if not t:raise ValueError('no valuation table')
  return {'pe':{'f':t['fields'],'r':t.get('data') or []}}
 if 'fields' in raw and 'data' in raw:return {'pe':{'f':raw['fields'],'r':raw['data']}}
 raise ValueError('unrecognized snapshot')
def import_directory(folder,retrieved_at=None):
 retrieved_at=retrieved_at or datetime.now(timezone.utc).isoformat()
 rows=[];stats={'files':0,'accepted_files':0,'rejected_files':[],'features':0,'publication_times_verified':0}
 for path in sorted(Path(folder).glob('*.json')):
  stats['files']+=1
  if not re.fullmatch(r'\d{8}',path.stem):
   stats['rejected_files'].append({'file':path.name,'reason':'invalid date filename'});continue
  try:
   date=f'{path.stem[:4]}-{path.stem[4:6]}-{path.stem[6:]}'
   url=f'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date={path.stem}&selectType=ALL&response=json'
   r=convert_snapshot(parse_snapshot(json.loads(path.read_text(encoding='utf-8-sig'))),observed_day=date,source_url=url,downloaded_at=retrieved_at)
   if not r:raise ValueError('no valid valuation features')
   for a in r:a['local_archive']=path.name
   rows+=r;stats['accepted_files']+=1
  except (ValueError,TypeError,KeyError,OSError) as e:stats['rejected_files'].append({'file':path.name,'reason':str(e)[:150]})
 stats['features']=len(rows)
 return rows,stats
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('input_dir',type=Path);p.add_argument('output_json',type=Path);a=p.parse_args()
 r,s=import_directory(a.input_dir);a.output_json.write_text(json.dumps({'records':r,'audit':s},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(s,ensure_ascii=False,indent=2))
 if s['rejected_files']:raise SystemExit('Some files were rejected; inspect output audit')
