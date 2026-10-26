"""Strict official TWSE per-date historical acquisition, research only."""
import hashlib,json,re,urllib.parse,urllib.request
from datetime import date,datetime,timezone
from pathlib import Path
URL="https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d"
def normalize_day(value):
 s=str(value).strip().replace("/","-")
 if re.fullmatch(r"\d{8}",s):return date(int(s[:4]),int(s[4:6]),int(s[6:8]))
 if re.fullmatch(r"\d{7}",s):return date(int(s[:3])+1911,int(s[3:5]),int(s[5:7]))
 if re.fullmatch(r"\d{3}-\d{1,2}-\d{1,2}",s):
  y,m,d=map(int,s.split("-"));return date(y+1911,m,d)
 return date.fromisoformat(s)
def validate(raw,day):
 if not isinstance(raw,dict) or raw.get("stat")!="OK":raise ValueError("non-OK response")
 expected=normalize_day(day)
 dates=[normalize_day(raw[k]) for k in ("date","Date") if raw.get(k)]
 dates.extend(normalize_day(t["date"]) for t in raw.get("tables",[]) if t.get("date"))
 if not dates:raise ValueError("missing response date, quarantine")
 if any(x!=expected for x in dates):raise ValueError("response date mismatch")
 tables=raw.get("tables") or [raw]
 matched=[t for t in tables if "證券代號" in (t.get("fields") or []) and "本益比" in (t.get("fields") or [])]
 if not matched:raise ValueError("missing valuation table")
 t=matched[0]
 if not t.get("data"):raise ValueError("no valuation data")
 return {"date":expected.isoformat(),"rows":len(t["data"])}
def fetch(day,out):
 day=normalize_day(day).strftime("%Y%m%d")
 url=URL+"?"+urllib.parse.urlencode({"date":day,"selectType":"ALL","response":"json"})
 req=urllib.request.Request(url,headers={"User-Agent":"AssetQualityResearch/1.0","Accept":"application/json"})
 with urllib.request.urlopen(req,timeout=20) as resp:rawbytes=resp.read(12000001)
 if len(rawbytes)>12000000:raise ValueError("too large")
 checked=validate(json.loads(rawbytes.decode("utf-8-sig")),day)
 path=Path(out);path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(rawbytes)
 report=dict(checked,sha256=hashlib.sha256(rawbytes).hexdigest(),source_url=url,retrieved_at=datetime.now(timezone.utc).isoformat(),historical_publication_verified=False)
 path.with_suffix(".audit.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
 return report
if __name__=="__main__":
 import argparse
 p=argparse.ArgumentParser();p.add_argument("date");p.add_argument("output");a=p.parse_args()
 print(json.dumps(fetch(a.date,a.output),ensure_ascii=False,indent=2))
