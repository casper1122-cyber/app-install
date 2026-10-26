"""Month-cluster uncertainty and cross-sectional risk sorting, 2025 held-out monthly predictions."""
import csv,json,random,statistics
from pathlib import Path
def audit(predictions_csv):
 rows=[]
 with open(predictions_csv,newline='') as f:
  for row in csv.DictReader(f):
   if row['month'].startswith('2025-'):
    for col in ('actual_abs','expanding_market','shrink_50'):row[col]=float(row[col])
    rows.append(row)
 months=sorted({r['month'] for r in rows})
 if len(months)!=12:raise ValueError('requires all twelve 2025 months')
 groups={m:[r for r in rows if r['month']==m] for m in months}
 gain={m:100*statistics.mean(abs(r['expanding_market']-r['actual_abs'])-abs(r['shrink_50']-r['actual_abs']) for r in group) for m,group in groups.items()}
 rng=random.Random(20261026);samples=[]
 for _ in range(5000):
  chosen=[rng.choice(months) for _ in months]
  samples.append(sum(gain[m]*len(groups[m]) for m in chosen)/sum(len(groups[m]) for m in chosen))
 samples.sort()
 high=[];low=[]
 for m,group in groups.items():
  sorted_group=sorted(group,key=lambda r:r['shrink_50'])
  n=max(1,len(group)//10)
  high.append(statistics.mean(r['actual_abs'] for r in sorted_group[-n:]))
  low.append(statistics.mean(r['actual_abs'] for r in sorted_group[:n]))
 return {'holdout_records':len(rows),'positive_months':sum(v>0 for v in gain.values()),
 'monthly_mae_improvement_pct_points':gain,
 'monthly_cluster_bootstrap_95pct_interval_pct_points':[round(samples[124],4),round(samples[4874],4)],
 'high_decile_realized_abs_pct':round(100*statistics.mean(high),4),
 'low_decile_realized_abs_pct':round(100*statistics.mean(low),4),
 'limitations':['only twelve month clusters','current-universe survivor bias','unverified dividend and delisting adjustments','absolute return, not loss probability']}
if __name__=='__main__':
 import sys
 print(json.dumps(audit(sys.argv[1]),indent=2))
