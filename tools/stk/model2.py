import numpy as np, pandas as pd, warnings; warnings.filterwarnings('ignore')
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
P=pd.read_pickle('/tmp/claude-0/stkA/feat.pkl')
# 等權重市場：每個月所有股票報酬的中位數
mk=P.groupby('mi').r.median().fillna(0); M=np.exp(mk.cumsum())
P['rel']=P.p/P.mi.map(M)
arr={c:(d.mi.values,d.rel.values) for c,d in P.groupby('c')}
H=36; out=np.full(len(P),np.nan); dl=np.zeros(len(P))
mx=P.mi.max()
for k,(c,mi,v) in enumerate(zip(P.c.values,P.mi.values,P.rel.values)):
    if mi+H>mx: continue
    a,b=arr[c]; j=np.searchsorted(a,mi); seg=b[j+1:j+1+H]
    if len(seg)==0 or np.all(np.isnan(seg)): continue
    out[k]=1.0 if np.nanmin(seg)/v<=0.5 else 0.0
    dl[k]=1.0 if a[-1]<mi+H and a[-1]<mx else 0.0
P['bigrel']=out; P['gone']=dl
S=P[(P.m.str.endswith('-01'))&P.vol.notna()&P.bigrel.notna()].copy()
S['indg']=S.ind.replace('','其他(已下市)')
print('samples',len(S),'rel big rate',S.bigrel.mean().round(3),'gone',S.gone.mean().round(3))
print(S.groupby(S.m.str[:4]).bigrel.mean().round(3).to_dict())
tr=S[S.m<'2016-01']; te=S[S.m>='2016-01']
def tab(col,bins,lab):
    for nm,d in [('train',tr),('test',te)]:
        q=pd.cut(d[col],bins) if bins is not None else d[col]
        print(lab,nm,d.groupby(q).bigrel.agg(['mean','size']).round(3).T.to_dict())
tab('vol',[0,0.25,0.35,0.45,0.6,0.8,5],'vol')
S['pecat']=np.select([S.loss==1,S.pe>40,S.pe>20,S.pe>12,S.pe>0],['虧損','>40','20-40','12-20','<12'],'無資料')
tr=S[S.m<'2016-01']; te=S[S.m>='2016-01']
tab('pecat',None,'PE')
tab('dy',[-1,0.01,2,4,6,100],'yield')
tab('liq',[0,15,17,18.5,20,30],'liq(log daily value)')
for nm,d in [('test',te)]:
    t=d.groupby('indg').bigrel.agg(['mean','size']); print(t[t['size']>=60].sort_values('mean').round(3).T.to_dict())
for name,cols in [('vol',['vol']),('vol+liq',['vol','liq']),('vol+liq+loss',['vol','liq','loss']),('vol+liq+loss+dy',['vol','liq','loss','dy']),('vol+liq+loss+dy+bp+mom',['vol','liq','loss','dy','bp','mom'])]:
    xa=tr[cols].fillna(tr[cols].median()); xb=te[cols].fillna(tr[cols].median()); mu=xa.mean(); sd=xa.std()
    m=LogisticRegression(max_iter=2000).fit((xa-mu)/sd,tr.bigrel); pb=m.predict_proba((xb-mu)/sd)[:,1]
    print(name,'AUC test',round(roc_auc_score(te.bigrel,pb),3),'coef',dict(zip(cols,np.round(m.coef_[0],2))))
S.to_pickle('/tmp/claude-0/stkA/S.pkl')
