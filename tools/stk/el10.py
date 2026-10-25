# 個股 10 年預期損失（扣通膨）跟「公司自己出事」機率的關係：用 2007～2016 年買進、抱 10 年的實際結果
# 下市的：用最後一個月的成交價（被收購的股東拿到錢、倒閉的接近 0），不再一律當 0
import json,numpy as np,pandas as pd,warnings;warnings.filterwarnings('ignore')
B=json.load(open('/home/claude/lib/rate/ratedata.json'))
def ymadd(ym,k): y,m=int(ym[:4]),int(ym[5:7])-1+k; return "%04d-%02d"%(y+m//12,m%12+1)
ci=1; cidx={}
for i,v in enumerate(B['cpi']): ci*=1+v/1e5; cidx[ymadd(B['base'],i)]=ci
P=pd.read_pickle('/tmp/claude-0/stkA/feat2.pkl')
J=json.load(open('/tmp/claude-0/stkA/model_final.json'))
def pred(S):
    pbv=np.where(S.pb>0,S.pb,np.nan); dy0=S.dy.fillna(0)
    f={'ivol':S.ivol.fillna(S.vol).clip(0,1.2),'mom_dn':np.maximum(0,-S.mom.fillna(0)-0.15),'mom_up':np.maximum(0,S.mom.fillna(0)-0.3),'pb_hi':np.log(np.maximum(pd.Series(pbv,index=S.index).fillna(1.5),2)/2),'loss':S.loss,'nodiv':(dy0<=0.01).astype(int),'dy':dy0.clip(0,10)}
    z=J['b0']+sum(f[k]*v for k,v in J['w'].items()); return 1/(1+np.exp(-z))
S=P[(P.m.str.endswith('-01'))&P.vol.notna()&(P.m>='2007-01')&(P.m<='2016-01')].copy(); S['pp']=pred(S)
arr={c:(d.m.values,d.p.values) for c,d in P.groupby('c')}
lastm=P.m.max(); rows=[]
for c,m,pp in zip(S.c,S.m,S.pp):
    e10=ymadd(m,120); ms,ps=arr[c]; d=dict(zip(ms,ps)); p0=d.get(m)
    if not p0 or e10>lastm: continue
    if e10 in d and d[e10]==d[e10]: p1=d[e10]; gone=0; endm=e10
    else:
        ok=[(mm,pv) for mm,pv in zip(ms,ps) if mm<=e10 and pv==pv]
        if not ok: continue
        endm,p1=ok[-1]
        if endm>=ymadd(e10,-1): gone=0
        else: gone=1
    rr=(p1/p0)/(cidx[endm]/cidx[m])
    rows.append((m,c,pp,rr,gone))
O=pd.DataFrame(rows,columns=['m','c','pp','rr','gone']); O['loss']=np.maximum(0,1-O.rr)
O['d']=pd.qcut(O.pp,10,labels=False)
t=O.groupby('d').agg(p=('pp','mean'),n=('rr','size'),EL=('loss','mean'),lossP=('rr',lambda x:(x<1).mean()),half=('rr',lambda x:(x<0.5).mean()),gone=('gone','mean')).round(3); print(t)
# 平滑：EL10 = a + b·ln(p)（用十分位的點配，越危險的越高）；時間外驗證：用 2007～2011 年配、2012～2016 年測
def fit(D):
    g=D.groupby(pd.qcut(D.pp,10,labels=False)).agg(p=('pp','mean'),EL=('loss','mean'))
    b,a=np.polyfit(np.log(g.p),g.EL,1); return a,b
a1,b1=fit(O[O.m<='2011-01']); te=O[O.m>='2012-01']
g=te.groupby(pd.qcut(te.pp,5,labels=False)).agg(p=('pp','mean'),EL=('loss','mean'))
g['pred']=a1+b1*np.log(g.p); print('out-of-time check (fit 2007-11, test 2012-16)');print(g.round(3))
a,b=fit(O); print('FINAL EL10 = %.4f + %.4f ln(p)'%(a,b)); 
for p in [0.01,0.02,0.037,0.06,0.1,0.2,0.4]: print(p, round(a+b*np.log(p),3))
json.dump({'a':float(a),'b':float(b)},open('/tmp/claude-0/stkA/el10_fit.json','w'))
# 改用十分位查表（直線內插），時間外驗證
def table(D):
    g=D.groupby(pd.qcut(D.pp,10,labels=False)).agg(p=('pp','mean'),EL=('loss','mean')); el=np.maximum.accumulate(g.EL.values); return list(zip(g.p.values,el))
def look(T,p):
    ps=[t[0] for t in T]; es=[t[1] for t in T]
    if p<=ps[0]: return es[0]
    if p>=ps[-1]: return min(0.6, es[-1]+(p-ps[-1])*(es[-1]-es[-2])/(ps[-1]-ps[-2]))
    return float(np.interp(p,ps,es))
T1=table(O[O.m<='2011-01']); te=O[O.m>='2012-01'].copy(); te['pred']=[look(T1,p) for p in te.pp]
g=te.groupby(pd.qcut(te.pp,5,labels=False)).agg(p=('pp','mean'),EL=('loss','mean'),pred=('pred','mean')); print('lookup out-of-time');print(g.round(3))
T2=table(O[O.m>='2012-01']); tr=O[O.m<='2011-01'].copy(); tr['pred']=[look(T2,p) for p in tr.pp]
g=tr.groupby(pd.qcut(tr.pp,5,labels=False)).agg(p=('pp','mean'),EL=('loss','mean'),pred=('pred','mean')); print('reverse (fit 2012-16, test 2007-11)');print(g.round(3))
T=table(O); print('FINAL table',[(round(a,4),round(b,4)) for a,b in T])
json.dump({'elt':[[round(float(a),4),round(float(b),4)] for a,b in T]},open('/tmp/claude-0/stkA/el10_fit.json','w'))
