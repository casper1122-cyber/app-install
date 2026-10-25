import numpy as np, pandas as pd, json
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
P=pd.read_pickle('/tmp/claude-0/stkA/panel.pkl')
P['mi']=P.m.map({m:i for i,m in enumerate(sorted(P.m.unique()))})
P['p']=P.adj.where(P.adj.notna()&(P.adj>0),P.px)
P=P.sort_values(['c','mi'])
g=P.groupby('c')
P['r']=np.log(P.p/g.p.shift(1)); P.loc[(g.mi.diff()!=1),'r']=np.nan
P['r']=P.r.clip(-1.5,1.5)
P['vol']=g.r.transform(lambda s:s.rolling(36,min_periods=24).std())*np.sqrt(12)
P['mom']=g.p.transform(lambda s:np.log(s/s.shift(12)))
P['liq']=g.val.transform(lambda s:np.log1p(s).rolling(12,min_periods=6).median())
P['first']=g.mi.transform('min'); P['age']=(P.mi-P['first'])/12
P['loss']=((P.hasq==1)&~(P.pe>0)).astype(int)
P['ep']=np.where(P.pe>0,1/P.pe,0)
P['bp']=np.where(P.pb>0,1/P.pb,np.nan)
# 結果：未來 36 個月最低價比起點跌超過 50%（含之後下市）
mins=[];last=[]
H=36
arr={c:(d.mi.values,d.p.values) for c,d in P.groupby('c')}
out=np.full(len(P),np.nan); ret3=np.full(len(P),np.nan)
for k,(c,mi,p) in enumerate(zip(P.c.values,P.mi.values,P.p.values)):
    a,b=arr[c]; j=np.searchsorted(a,mi); seg=b[j+1:j+1+H]; segm=a[j+1:j+1+H]
    if mi+H>P.mi.max(): continue
    if len(seg)==0: out[k]=np.nan; continue
    out[k]=1.0 if np.nanmin(seg)/p<=0.5 else 0.0
P['big']=out
P.to_pickle('/tmp/claude-0/stkA/feat.pkl')
S=P[(P.m.str.endswith('-01'))&P.vol.notna()&P.big.notna()&(P.m>='2006-01')].copy()
S['indg']=S.ind.replace('', '未知')
print('samples',len(S),'rate',S.big.mean().round(3))
print(S.groupby(S.m.str[:4]).big.mean().round(2).to_dict())
tr=S[S.m<'2016-01']; te=S[S.m>='2016-01']
def X(d,cols,ind):
    x=d[cols].copy()
    for cc in cols: x[cc]=x[cc].fillna(tr[cc].median())
    if ind:
        top=tr.indg.value_counts().index[:20]
        for i in top: x['i_'+i]=(d.indg==i).astype(int)
    return x
for name,cols,ind in [('vol',['vol'],False),('vol+mom+liq',['vol','mom','liq'],False),('+val',['vol','mom','liq','ep','bp','dy','loss','age'],False),('+val+ind',['vol','mom','liq','ep','bp','dy','loss','age'],True)]:
    xa=X(tr,cols,ind); xb=X(te,cols,ind); mu=xa.mean(); sd=xa.std().replace(0,1)
    m=LogisticRegression(C=1.0,max_iter=2000).fit((xa-mu)/sd,tr.big); pb=m.predict_proba((xb-mu)/sd)[:,1]
    print(name,'AUC test',round(roc_auc_score(te.big,pb),3),'train',round(roc_auc_score(tr.big,m.predict_proba((xa-mu)/sd)[:,1]),3))
    if name=='+val+ind':
        te=te.assign(pb=pb); te['dec']=pd.qcut(te.pb,10,labels=False)
        print(te.groupby('dec').agg(pred=('pb','mean'),act=('big','mean'),n=('big','size')).round(3).T)
        print(dict(zip(xa.columns,np.round(m.coef_[0],2))))
