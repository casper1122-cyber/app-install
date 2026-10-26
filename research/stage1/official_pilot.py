"""Read-only TWSE/TPEx valuation historical connection pilot.
Four requested source-day snapshots; NOT total return, delisted coverage or PIT publication proof.
"""
from datetime import date,datetime,timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request,urlopen
import json,hashlib,re,sys

def api_url(market,iso):
 d=date.fromisoformat(iso)
 if market=="TWSE":
  return "https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?"+urlencode({"response":"json","date":d.strftime("%Y%m%d"),"selectType":"ALL"})
 if market=="TPEX":
  roc=f"{d.year-1911:03d}/{d.month:02d}/{d.day:02d}"
  return "https://www.tpex.org.tw/web/stock/aftertrading/peratio_analysis/pera_result.php?"+urlencode({"l":"zh-tw","o":"json","d":roc,"c":"","s":"0,asc"})
 raise ValueError("Unknown market")

def returned_day(body):
 text=body.get("date") or body.get("Date") or ""
 if re.fullmatch(r"\d{8}",str(text)):return f"{text[:4]}-{text[4:6]}-{text[6:]}"
 if re.fullmatch(r"\d{3}/\d{2}/\d{2}",str(text)):
  a,b,c=map(int,text.split("/"));return f"{a+1911:04d}-{b:02d}-{c:02d}"
 title=body.get("title") or ""
 m=re.search(r"(\d{3})年(\d{1,2})月(\d{1,2})日",title)
 if m:
  a,b,c=map(int,m.groups());return f"{a+1911:04d}-{b:02d}-{c:02d}"
 return None

def check(market,raw,requested):
 body=json.loads(raw.decode("utf-8-sig"))
 if not isinstance(body,dict):raise ValueError("Non-object JSON")
 observed=returned_day(body)
 if observed and observed!=requested:raise ValueError(f"wrong source date {observed}, requested {requested}")
 if market=="TWSE":
  if body.get("stat")!="OK":raise ValueError(f"TWSE status: {body.get('stat')}")
  ts=body.get("tables") or [body]
  candidates=[t for t in ts if "證券代號" in (t.get("fields") or []) and "本益比" in (t.get("fields") or [])]
  count=sum(len(t.get("data") or []) for t in candidates)
 else:
  table=body.get("aaData")
  count=len(table) if isinstance(table,list) else 0
  if body.get("iTotalRecords") is not None and count!=int(body["iTotalRecords"]):
   raise ValueError("TPEx total record mismatch")
 if count<1:raise ValueError("No usable valuation rows")
 return {"rows":count,"returned_day":observed,"response_date_verified":bool(observed),
         "publication_timestamp_verified":False,"strict_historical_backtest_allowed":False}

def run(output):
 p=Path(output);p.mkdir(parents=True,exist_ok=True)
 rows=[]
 for market in ("TWSE","TPEX"):
  for day in ("2024-12-30","2025-12-30"):
   url=api_url(market,day)
   record={"market":market,"date":day,"url":url,"retrieved_at_utc":datetime.now(timezone.utc).isoformat()}
   try:
    req=Request(url,headers={"User-Agent":"Mozilla/5.0", "Accept":"application/json"})
    with urlopen(req,timeout=25) as resp:content=resp.read(12000001)
    if len(content)>12000000:raise ValueError("response too big")
    record.update(check(market,content,day))
    name=f"{market}_{day}.json";(p/name).write_bytes(content)
    record.update({"status":"downloaded","name":name,"sha256":hashlib.sha256(content).hexdigest(),"size":len(content)})
   except Exception as ex:record.update({"status":"failed","error":str(ex)[:500]})
   rows.append(record);print(json.dumps(record,ensure_ascii=False),flush=True)
 report={"research_only":True,"release_allowed":False,"records":rows,
         "downloaded":sum(r["status"]=="downloaded" for r in rows),
         "notes":"Historical endpoint probe only; source timestamp, delisted universe and corporate actions not validated."}
 (p/"manifest.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
 return report
if __name__=="__main__":
 result=run(sys.argv[1] if len(sys.argv)>1 else "out")
 if result["downloaded"]!=4:raise SystemExit("Partial connectivity or data rejection; see artifact manifest")
