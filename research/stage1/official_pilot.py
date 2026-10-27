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
  return "https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate?"+urlencode({"date":d.strftime("%Y/%m/%d"),"response":"json"})
 raise ValueError("Unknown market")

def returned_day(body):
 text=body.get("date") or body.get("Date") or ""
 if re.fullmatch(r"\d{8}",str(text)):return f"{text[:4]}-{text[4:6]}-{text[6:]}"
 if re.fullmatch(r"\d{3}/\d{2}/\d{2}",str(text)):
  a,b,c=map(int,text.split("/"));return f"{a+1911:04d}-{b:02d}-{c:02d}"
 if re.fullmatch(r"\d{4}/\d{2}/\d{2}",str(text)):
  return text.replace("/","-")
 titles=[body.get("title") or ""]
 for table in body.get("tables") or []:
  if table.get("date"):
   v=table["date"]
   if re.fullmatch(r"\d{8}",str(v)):
    return f"{v[:4]}-{v[4:6]}-{v[6:]}"
   if re.fullmatch(r"\d{3}/\d{2}/\d{2}",str(v)):
    y,mo,d=map(int,v.split("/"));return f"{y+1911:04d}-{mo:02d}-{d:02d}"
  titles.append(table.get("title") or "")
 for title in titles:
  m=re.search(r"(\d{3})年(\d{1,2})月(\d{1,2})日",title)
  if m:
   a,b,c=map(int,m.groups());return f"{a+1911:04d}-{b:02d}-{c:02d}"
 return None

def check(market,raw,requested):
 body=json.loads(raw.decode("utf-8-sig"))
 if not isinstance(body,dict):raise ValueError("Non-object JSON")
 observed=returned_day(body)
 all_days=[observed]
 for table in body.get("tables") or []:
  all_days.append(returned_day(table))
 known={day for day in all_days if day}
 if len(known)>1:raise ValueError("conflicting official response dates")
 if any(day!=requested for day in known):raise ValueError(f"wrong source date {sorted(known)}, requested {requested}")
 observed=next(iter(known),None)
 if market=="TWSE":
  if body.get("stat")!="OK":raise ValueError(f"TWSE status: {body.get('stat')}")
  ts=body.get("tables") or [body]
  candidates=[t for t in ts if "證券代號" in (t.get("fields") or []) and "本益比" in (t.get("fields") or [])]
  count=sum(len(t.get("data") or []) for t in candidates)
 else:
  if body.get("stat")!="ok":raise ValueError(f"TPEx status: {body.get('stat')}")
  tables=body.get("tables") or []
  candidates=[t for t in tables if "股票代號" in (t.get("fields") or []) and all(x in (t.get("fields") or []) for x in ("本益比","殖利率(%)","股價淨值比"))]
  count=sum(len(t.get("data") or []) for t in candidates)
  if count:
   for t in candidates:
    fields=t["fields"];code_i=fields.index("股票代號");seen=set()
    for i,row in enumerate(t.get("data") or []):
     if not isinstance(row,list) or len(row)!=len(fields):raise ValueError(f"TPEx row width {i}")
     code=str(row[code_i]).strip()
     if not re.fullmatch(r"[0-9A-Z]{4,10}",code) or code in seen:raise ValueError("TPEx invalid or duplicate security code")
     seen.add(code)
 if count<1:raise ValueError("No usable valuation rows")
 tables=body.get("tables") or [body]
 code_name="證券代號" if market=="TWSE" else "股票代號"
 seen=set()
 for t in tables:
  fields=t.get("fields") or []
  if code_name not in fields or "本益比" not in fields:continue
  i=fields.index(code_name)
  for n,row in enumerate(t.get("data") or []):
   if not isinstance(row,list) or len(row)!=len(fields):raise ValueError(f"bad valuation row width at {n}")
   code=str(row[i]).strip()
   if not re.fullmatch(r"[0-9A-Z]{4,10}",code) or code in seen:
    raise ValueError("invalid or duplicate security code")
   seen.add(code)
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
    verified=record["response_date_verified"]
    name=f"{market}_{day}.json" if verified else f"{market}_{day}.quarantine"
    (p/name).write_bytes(content)
    record.update({"status":"downloaded" if verified else "quarantined","name":name,"sha256":hashlib.sha256(content).hexdigest(),"size":len(content)})
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
