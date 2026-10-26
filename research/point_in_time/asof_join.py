"""Point-in-time joins for asset-level historical features; no fabricated availability."""
from collections import defaultdict
from datetime import datetime,date
from zoneinfo import ZoneInfo
TZ=ZoneInfo("Asia/Taipei")
def moment(value):
 d=datetime.fromisoformat(value)
 if d.tzinfo is None or d.utcoffset() is None:raise ValueError("timezone-aware timestamp required")
 return d.astimezone(TZ)
def asof_join(records,decisions,*,mode="strict",lag_days=1):
 if mode not in ("strict","sensitivity"):raise ValueError("invalid mode")
 if lag_days<1:raise ValueError("lag_days must be >=1")
 by=defaultdict(list)
 for r in records:
  if r.get("asset_id") and r.get("feature") and isinstance(r.get("value"),(int,float)) and not isinstance(r["value"],bool):
   by[(r["asset_id"],r["feature"])].append(r)
 joined=[];rejected=[]
 for d in decisions:
  stamp=moment(d["decision_at"]);eligible=[]
  for r in by.get((d["asset_id"],d["feature"]),[]):
   try:
    observed=date.fromisoformat(r["observed_at"])
    if observed>stamp.date():continue
    proof=r.get("publication_proof") or {}
    verified=bool(r.get("published_at") and proof.get("kind")=="archived_official" and proof.get("url") and proof.get("verified") is True)
    if verified:
     if moment(r["published_at"])>stamp:continue
     flag="verified"
    else:
     if mode=="strict" or (stamp.date()-observed).days<lag_days:continue
     flag="assumed"
    eligible.append((observed,r,flag))
   except (KeyError,TypeError,ValueError):continue
  if not eligible:
   rejected.append({"decision":d,"reason":"no eligible as-of observation"});continue
  observed,r,flag=max(eligible,key=lambda z:(z[0],z[1].get("retrieved_at","")))
  joined.append({"asset_id":d["asset_id"],"feature":d["feature"],"decision_at":d["decision_at"],"observed_at":observed.isoformat(),"value":r["value"],"evidence":flag,"source_url":r.get("source_url"),"lag_days":None if flag=="verified" else lag_days})
 return {"joined":joined,"rejected":rejected,"mode":mode,"lag_days":lag_days if mode=="sensitivity" else None}
