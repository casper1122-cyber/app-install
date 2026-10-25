import json,gzip,glob,math,numpy as np,pandas as pd
Y={}
for f in glob.glob('/tmp/claude-0/stk/y*.json.gz'): Y.update(json.load(gzip.open(f)))
APP=json.load(open('/tmp/claude-0/stkB/app_out.json')); H=json.load(open('/tmp/claude-0/stkB/hist.json'))['a']
P=pd.read_pickle('/tmp/claude-0/stkA/panel.pkl'); raw={(c,m):(px,dy) for c,m,px,dy in zip(P.c,P.m,P.px,P.dy)}
L={x['c']:x for x in json.load(open('/tmp/claude-0/stk/list.json'))}
rows=[]; issues={'jump':[],'rawmismatch':[],'stale':[],'mdd_diff':[],'cagr_diff':[],'gap':[],'err':[]}
for c,a in APP.items():
    if 'err' in a: issues['err'].append((c,a['err'])); continue
    ser=[(ym,ac,cl,v) for ym,cl,ac,v in Y[c] if ac and ac>0 and ym<='2026-09']
    d={ym:ac for ym,ac,cl,v in ser}; ks=sorted(d)
    # 1. 獨立算最慘跌、年化
    pk=0;mdd=0
    for k in ks:
        pk=max(pk,d[k]); mdd=max(mdd,1-d[k]/pk)
    n=len(ks)-1; cagr=(d[ks[-1]]/d[ks[0]])**(12/n)-1 if n>=12 else None
    if abs(mdd-a['mdd'])>0.02: issues['mdd_diff'].append((c,round(mdd,3),round(a['mdd'],3)))
    if cagr is not None and abs(cagr-a['cagr'])>0.01: issues['cagr_diff'].append((c,round(cagr,4),round(a['cagr'],4)))
    # 2. 單月漲跌超過 ±60%（台股漲跌幅限制 10%，一個月最多約 +159%/−65%；超過多半是資料錯或減資）
    for k1,k2 in zip(ks,ks[1:]):
        r=d[k2]/d[k1]-1
        if r>1.6 or r<-0.66: issues['jump'].append((c,k2,round(r,2)))
    # 3. Yahoo 跟證交所原始收盤價比（上市股票、有兩邊資料的月份）：價格比值突然改變＝其中一邊有錯
    prev=None
    for ym,ac,cl,v in ser:
        q=raw.get((c,ym))
        if q and q[0]==q[0] and q[0]>0 and cl:
            ratio=cl/q[0]
            if abs(ratio-1)>0.03: issues['rawmismatch'].append((c,ym,round(cl,2),q[0])); break
    # 4. 很久沒成交（成交量 0 連續 6 個月以上）
    z=0;mz=0
    for ym,ac,cl,v in ser[-60:]:
        z=z+1 if v==0 else 0; mz=max(mz,z)
    if mz>=6: issues['stale'].append((c,mz))
    # 5. 中間缺月
    from itertools import pairwise
    def nxt(ym): y,m=int(ym[:4]),int(ym[5:]); return '%04d-%02d'%(y+m//12, m%12+1)
    g=sum(1 for k1,k2 in pairwise(ks) if nxt(k1)!=k2)
    if g: issues['gap'].append((c,g))
    rows.append((c,L.get(c,{}).get('n',''),L.get(c,{}).get('mk',''),a['grade'],a['el'],H[c].get('p'),mdd,cagr,a['uw']))
for k,v in issues.items(): print(k,len(v),v[:12])
df=pd.DataFrame(rows,columns=['c','n','mk','grade','el','p','mdd','cagr','uw'])
df.to_pickle('/tmp/claude-0/stkB/audit.pkl')
print(df.groupby('mk').grade.value_counts().unstack().fillna(0).astype(int))
print('p missing',df.p.isna().sum())
