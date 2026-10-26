"""Batch check of snapshot feature timestamps; no historical publication dates are invented."""
import json, zipfile, collections
def audit(path):
 with zipfile.ZipFile(path) as z: d=json.loads(z.read("stk/hist.json"))
 a=d.get("a",{}); counts=collections.Counter(); vintaged=collections.Counter()
 for v in a.values():
  for key,feature in (v.get("f") or {}).items():
   counts[key]+=1
   if isinstance(feature,dict) and all(feature.get(x) for x in ("period_end","published_at","retrieved_at","source_id")):vintaged[key]+=1
 return {"assets":len(a),"snapshot_last":d.get("last"),"features_by_type":dict(counts),"features_with_provenance":dict(vintaged),"unverified":sum(counts.values())-sum(vintaged.values())}
if __name__=="__main__":
 import sys
 print(json.dumps(audit(sys.argv[1]),ensure_ascii=False,indent=2))
