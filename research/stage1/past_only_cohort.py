"""Past-only cohort for next-month downside research. The target month's availability
must NEVER determine which stocks enter the risk ranking. Research sample still
suffers survivor and unverified corporate action biases; NO rating approval.
"""
from math import isfinite
def previous_months(year,month,n=12):
 end=year*12+month-1
 return [f"{(end-i-1)//12:04d}-{(end-i-1)%12+1:02d}" for i in reversed(range(n))]
def month_cohort(assets,year,month):
 target=f"{year:04d}-{month:02d}"
 past=previous_months(year,month)
 entries=[]
 for ticker,(industry,rets) in assets.items():
  if not all(k in rets and isinstance(rets[k],(int,float)) and isfinite(rets[k]) for k in past):continue
  entries.append({"month":target,"ticker":ticker,"industry":industry,
                  "score":sum(abs(rets[k]) for k in past)/12})
 entries.sort(key=lambda r:(round(r["score"],12),r["ticker"]))
 for i,r in enumerate(entries):
  r["risk_decile"]=min(9,(i*10)//len(entries))
  x=assets[r["ticker"]][1].get(target)
  observed=isinstance(x,(int,float)) and not isinstance(x,bool) and isfinite(x)
  r["label_status"]="observed" if observed else "missing"
  r["signed"]=x if observed else None
  r["down10"]=int(x<=-.1) if observed else None
 return entries
