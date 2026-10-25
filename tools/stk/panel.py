import json,gzip,glob,re,numpy as np,pandas as pd
D='/tmp/claude-0/stk/'
T={}
for f in sorted(glob.glob(D+'twse_*.json.gz')): T.update(json.load(gzip.open(f)))
num=lambda s: float(str(s).replace(',','')) if re.match(r'^-?[\d,]+(\.\d+)?$',str(s).strip()) else np.nan
rows=[]
for m in sorted(T):
    px=T[m]['px']; f=px['f']; ic=f.index('收盤價'); iv=f.index('成交金額'); 
    pe=T[m].get('pe') or {}; pf=pe.get('f') or []; pr={r[0]:r for r in (pe.get('r') or [])}
    for r in px['r']:
        c=r[0]
        if not (len(c)==4 and c.isdigit()): continue
        q=pr.get(c); 
        rows.append((m,c,r[1],num(r[ic]),num(r[iv]),
            num(q[pf.index('本益比')]) if q else np.nan, num(q[pf.index('股價淨值比')]) if q else np.nan, num(q[pf.index('殖利率(%)')]) if q else np.nan, 1 if q else 0))
P=pd.DataFrame(rows,columns=['m','c','n','px','val','pe','pb','dy','hasq'])
L={x['c']:x for x in json.load(open(D+'list.json'))}
P['ind']=P.c.map(lambda c:L[c]['ind'] if c in L else '')
P['listed_now']=P.c.isin(L)
# Yahoo 還原股價（現在還上市的）
Y={}
for f in sorted(glob.glob(D+'y*.json.gz')): Y.update(json.load(gzip.open(f)))
adj={}
for c,v in Y.items():
    for ym,cl,ac,vol in v: adj[(c,ym)]=ac
P['adj']=[adj.get((c,m)) for c,m in zip(P.c,P.m)]
P.to_pickle('/tmp/claude-0/stkA/panel.pkl')
print(P.shape, P.m.nunique(), P.c.nunique(), P.adj.notna().mean().round(3), (P.pe>0).mean().round(3))
