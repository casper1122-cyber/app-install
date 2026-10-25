import numpy as np, pandas as pd, warnings; warnings.filterwarnings('ignore')
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score, brier_score_loss
P=pd.read_pickle('/tmp/claude-0/stkA/feat2.pkl'); S0=pd.read_pickle('/tmp/claude-0/stkA/S.pkl')[['c','m','bigrel']]
S=P.merge(S0,on=['c','m']); S=S[S.vol.notna()]
S['y']=S.m.str[:4].astype(int); S['indg']=S.ind.replace('','其他')
S['ep']=np.where(S.pe>0,1/S.pe,0); S['bp']=np.where(S.pb>0,1/S.pb,np.nan); S['dy0']=S.dy.fillna(0)
print('n',len(S))
SETS={'base':['vol','loss','dy0'],
 'fin':['vol','loss','dy0','lossN','divN','epsg','bvg','ep','bp'],
 'risk':['vol','ivol','beta','mdd3','skew','lpx','mom'],
 'all':['vol','ivol','beta','mdd3','skew','lpx','mom','loss','dy0','lossN','divN','epsg','bvg','ep','bp'],'core':['ivol','lpx','bp','ep','dy0','mom','vol']}
folds=[(2012,2013),(2014,2015),(2016,2017),(2018,2019),(2020,2021),(2022,2023)]
res={}
for a,b in folds:
    te=S[(S.y>=a)&(S.y<=b)]; tr=S[S.y<=a-3]   # 訓練的結果（3 年）要在測試開始前就結束
    if len(tr)<1000: continue
    for nm,cols in SETS.items():
        for mdl in ['lr','gb']:
            xa=tr[cols]; xb=te[cols]
            if mdl=='lr':
                med=xa.median(); xa=xa.fillna(med); xb=xb.fillna(med); mu=xa.mean(); sd=xa.std().replace(0,1)
                xa=((xa-mu)/sd).clip(-4,4); xb=((xb-mu)/sd).clip(-4,4)
                m=LogisticRegression(C=0.5,max_iter=3000).fit(xa,tr.bigrel)
            else:
                m=HistGradientBoostingClassifier(max_depth=3,learning_rate=0.05,max_iter=200,min_samples_leaf=80,l2_regularization=1.0).fit(xa,tr.bigrel)
            p=m.predict_proba(xb)[:,1]
            res.setdefault((nm,mdl),[]).append((te.bigrel.values,p))
print('folds used',[f for f in folds if len(S[S.y<=f[0]-3])>=1000])
for k,v in sorted(res.items(),key=lambda z:-roc_auc_score(np.concatenate([a for a,b in z[1]]),np.concatenate([b for a,b in z[1]]))):
    yy=np.concatenate([a for a,b in v]); pp=np.concatenate([b for a,b in v])
    per=[round(roc_auc_score(a,b),3) for a,b in v]
    print(k,'AUC',round(roc_auc_score(yy,pp),3),'per-fold',per,'Brier',round(brier_score_loss(yy,pp),4),'mean p',round(pp.mean(),3),'act',round(yy.mean(),3))
# 哪些條件最重要（排列重要性：把一欄打亂，看準確度掉多少）
from sklearn.inspection import permutation_importance
cols=SETS['all']; tr=S[S.y<=2017]; te=S[S.y>=2020]
m=HistGradientBoostingClassifier(max_depth=3,learning_rate=0.05,max_iter=200,min_samples_leaf=80,l2_regularization=1.0).fit(tr[cols],tr.bigrel)
pi=permutation_importance(m,te[cols],te.bigrel,scoring='roc_auc',n_repeats=10,random_state=0)
print(sorted(zip(cols,np.round(pi.importances_mean,4)),key=lambda z:-z[1]))
