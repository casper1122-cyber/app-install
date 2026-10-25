import json,gzip,glob,numpy as np,pandas as pd
Y={}
for f in glob.glob('/tmp/claude-0/stk/y*.json.gz'): Y.update(json.load(gzip.open(f)))
P=pd.read_pickle('/tmp/claude-0/stkA/panel.pkl'); raw={(c,m):px for c,m,px in zip(P.c,P.m,P.px)}
def prv(ym): y,m=int(ym[:4]),int(ym[5:]); m-=1
def pm(ym):
    y,m=int(ym[:4]),int(ym[5:]); m-=1
    if m==0: y-=1;m=12
    return '%04d-%02d'%(y,m)
bad=[];ok=[];pre=[]
for c,rows in Y.items():
    d={ym:ac for ym,cl,ac,v in rows if ac and ac>0 and ym<='2026-09'}
    for k in sorted(d):
        p0=d.get(pm(k))
        if not p0: continue
        r=d[k]/p0-1
        if r>1.6 or r<-0.66:
            a,b=raw.get((c,pm(k))),raw.get((c,k))
            if a and b and a==a and b==b and a>0: (ok if abs((b/a-1)-r)<0.35 else bad).append((c,k,round(r,2),round(b/a-1,2)))
            else: pre.append((c,k,round(r,2)))
print('jumps confirmed by TWSE raw',len(ok),ok[:8]); print('jumps NOT matching raw',len(bad),bad[:20]); print('no raw to compare (OTC or pre-2005)',len(pre),pre[:15])
