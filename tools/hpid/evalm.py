import pandas as pd, numpy as np, json
df=pd.read_pickle('res.pkl'); df=df.assign(byear=(df.y-df.age).round())
H=json.load(open('hpid.json')); q=H['q']; DR=H['drift']; n=len(q)
i14=[i for i,x in enumerate(q) if x[:4] in ('2013','2014')]; i25=[i for i,x in enumerate(q) if x[:4] in('2025','2026')]
COH=[(1900,1974),(1975,1984),(1985,1994),(1995,2004),(2005,2014)]
def dOf(a,ty,k):
    for lo,hi,b in DR['bands']:
        if lo<a<=hi: return k*DR['typ'].get(b+'|'+ty, DR['all'][b])/100
    return 0
def pathD(I,typ,by,k):
    out=list(I); cum=0
    for t in range(n-1,-1,-1):
        out[t]*=np.exp(-cum); tt=int(q[t][:4])+(int(q[t][-1])-0.5)/4; a=tt-by
        if a>0: cum+=dOf(a,typ,k)/4
    return out
rows=[]
for (dist,typ),d in df[df.byear<2012].groupby(['dist','typ']):
    I=H['idx'].get(dist)
    if I is None: continue
    for lo,hi in COH:
        e=d[(d.byear>=lo)&(d.byear<=hi)]
        A=e[e.y.isin([2013,2014])]; B=e[e.y>=2025]
        if len(A)<40 or len(B)<40: continue
        # 控制坪數、樓層的差：用中位數比（簡單），另外算 log 平均
        act=np.log(B.unit.median()/A.unit.median())
        by=(lo+hi)/2 if lo>1900 else 1970
        r={'dist':dist,'typ':typ,'band':f'{lo}-{hi}','n':min(len(A),len(B)),'act':act}
        for k in [0,0.5,1.0]:
            P=pathD(I,typ,by,k); r[f'k{k}']=np.log(np.mean([P[i] for i in i25])/np.mean([P[i] for i in i14]))
        rows.append(r)
R=pd.DataFrame(rows); print('cases',len(R))
for k in ['k0','k0.5','k1.0']:
    e=R.act-R[k]; w=np.sqrt(R.n)
    print(k,'bias %.3f'%np.average(e,weights=w),'MAE %.3f'%np.average(e.abs(),weights=w))
R['old']=R.band.str[:4].astype(int)<1990
for k in ['k0','k0.5','k1.0']:
    print(k, R.groupby('old').apply(lambda x: round(np.average(x.act-x[k],weights=np.sqrt(x.n)),3)).to_dict())
best=None
for k in np.arange(0,1.05,0.1):
    pass
