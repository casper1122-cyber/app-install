import numpy as np, pandas as pd, warnings; warnings.filterwarnings('ignore')
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, brier_score_loss
exec(open('/tmp/claude-0/stkA/cv.py').read().split("SETS=")[0])
S['pbv']=np.where(S.pb>0,S.pb,np.nan)
def feats(d):
    f=pd.DataFrame(index=d.index)
    f['ivol']=d.ivol.fillna(d.vol).clip(0,1.2)
    pass   # 股價高低本身不放（只是面額效果；驗證拿掉只差 0.002）
    f['mom_dn']=np.maximum(0,-d.mom.fillna(0)-0.15); f['mom_up']=np.maximum(0,d.mom.fillna(0)-0.3)
    f['pb_hi']=np.log(np.maximum(d.pbv.fillna(1.5),2)/2)
    f['loss']=d.loss; f['nodiv']=(d.dy0<=0.01).astype(int); f['dy']=d.dy0.clip(0,10)
    return f
folds=[(2012,2013),(2014,2015),(2016,2017),(2018,2019),(2020,2021),(2022,2023)]
Y=[];Pp=[];co=[]
for a,b in folds:
    te=S[(S.y>=a)&(S.y<=b)]; tr=S[S.y<=a-3]
    xa=feats(tr); xb=feats(te); mu=xa.mean(); sd=xa.std().replace(0,1)
    m=LogisticRegression(C=0.5,max_iter=3000).fit((xa-mu)/sd,tr.bigrel); p=m.predict_proba((xb-mu)/sd)[:,1]
    Y.append(te.bigrel.values);Pp.append(p);co.append(np.round(m.coef_[0]/sd.values,2))
yy=np.concatenate(Y);pp=np.concatenate(Pp)
print('lrB AUC',round(roc_auc_score(yy,pp),3),[round(roc_auc_score(a,b),3) for a,b in zip(Y,Pp)],'Brier',round(brier_score_loss(yy,pp),4),'mean p',round(pp.mean(),3),'act',round(yy.mean(),3))
print('raw coef by fold',dict(zip(feats(S).columns,[list(c) for c in np.array(co).T])))
t=pd.DataFrame({'y':yy,'p':pp}); t['q']=pd.qcut(t.p,10,labels=False); print(t.groupby('q').agg(p=('p','mean'),a=('y','mean')).round(3).T)
# 用全部資料（到 2023 年）訓練最後的模型
xa=feats(S); m=LogisticRegression(C=0.5,max_iter=3000).fit(xa,S.bigrel)
print('FINAL intercept',round(m.intercept_[0],3),dict(zip(xa.columns,np.round(m.coef_[0],3))))
import json; json.dump({'b0':float(m.intercept_[0]),'w':dict(zip(xa.columns,[float(v) for v in m.coef_[0]]))},open('/tmp/claude-0/stkA/model_final.json','w'))
# 上櫃用（沒有本益比、殖利率、淨值比）：只用價格算得出來的
def feats2(d): f=feats(d); return f[['ivol','mom_dn','mom_up']]
Y=[];Pp=[]
for a,b in folds:
    te=S[(S.y>=a)&(S.y<=b)]; tr=S[S.y<=a-3]; xa=feats2(tr); xb=feats2(te)
    m2=LogisticRegression(C=0.5,max_iter=3000).fit(xa,tr.bigrel); Y.append(te.bigrel.values); Pp.append(m2.predict_proba(xb)[:,1])
print('price-only AUC',round(roc_auc_score(np.concatenate(Y),np.concatenate(Pp)),3))
m2=LogisticRegression(C=0.5,max_iter=3000).fit(feats2(S),S.bigrel)
J=json.load(open('/tmp/claude-0/stkA/model_final.json')); J['px']={'b0':float(m2.intercept_[0]),'w':dict(zip(feats2(S).columns,[float(v) for v in m2.coef_[0]]))}
json.dump(J,open('/tmp/claude-0/stkA/model_final.json','w'),ensure_ascii=False)
# 現在的例子
L=P[P.m=='2026-09'].copy(); L['pbv']=np.where(L.pb>0,L.pb,np.nan); L['dy0']=L.dy.fillna(0); L['loss']=((L.hasq==1)&~(L.pe>0)).astype(int)
L=L[L.vol.notna()]; fx=feats(L).fillna(0); L['p']=m.predict_proba(fx)[:,1]
print(L[L.c.isin(['2330','2884','2548','1101','2409','3481','1216','2603','2317','2454','2412','6505'])][['c','n','px','ivol','mom','pb','dy','loss','p']].round(3).to_string())
print(L.p.describe().round(3))
