import numpy as np, pandas as pd, warnings; warnings.filterwarnings('ignore')
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, brier_score_loss
exec(open('/tmp/claude-0/stkA/cv.py').read().split("SETS=")[0])
S['ivol2']=S.ivol**2; S['lowpx']=(S.px<10).astype(int)
folds=[(2012,2013),(2014,2015),(2016,2017),(2018,2019),(2020,2021),(2022,2023)]
CAND={'lr8':['ivol','lpx','bp','ep','dy0','loss','bvg','mom'],'lr8q':['ivol','ivol2','lpx','bp','ep','dy0','loss','bvg','mom'],'lr6':['ivol','lpx','bp','dy0','loss','mom'],'base':['vol','loss','dy0']}
for nm,cols in CAND.items():
    Y=[];Pp=[];co=[]
    for a,b in folds:
        te=S[(S.y>=a)&(S.y<=b)]; tr=S[S.y<=a-3]
        med=tr[cols].median(); xa=tr[cols].fillna(med); xb=te[cols].fillna(med); mu=xa.mean(); sd=xa.std().replace(0,1)
        m=LogisticRegression(C=0.5,max_iter=3000).fit(((xa-mu)/sd).clip(-4,4),tr.bigrel); p=m.predict_proba(((xb-mu)/sd).clip(-4,4))[:,1]
        Y.append(te.bigrel.values);Pp.append(p);co.append(np.round(m.coef_[0],2))
    yy=np.concatenate(Y);pp=np.concatenate(Pp)
    print(nm,'AUC',round(roc_auc_score(yy,pp),3),[round(roc_auc_score(a,b),3) for a,b in zip(Y,Pp)],'Brier',round(brier_score_loss(yy,pp),4))
    print('   coef by fold',dict(zip(cols,[list(c) for c in np.array(co).T])))
