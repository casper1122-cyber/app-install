import pandas as pd,numpy as np,json
O=pd.read_pickle('/tmp/claude-0/hpid/rs_feat.pkl').copy()
O['prem']=O.prem.fillna(0)
AB=[-1,2,5,10,15,20,25,30,35,40,200]; PB=[0,15,25,35,50,1e4]
O['ab']=pd.cut(O.age,AB).astype(str); O['pb']=pd.cut(O.ping,PB).astype(str)
O['top']=((O.fl>=O.tot)&(O.tot>1)).astype(float)
def X(D,prem=True,fine=True):
    P=[pd.Series(1.0,index=D.index,name='c')]
    if prem: P.append(D.prem)
    P.append(pd.get_dummies(D.ab if fine else pd.cut(D.age,[-1,5,15,30,45,200]).astype(str),prefix='a'))
    P+=[pd.get_dummies(D.pb,prefix='p'),pd.get_dummies(D.typ,prefix='t'),D.elev.astype(float).rename('elev'),D.mgmt.astype(float).rename('mgmt'),D.top.rename('top')]
    return pd.concat(P,axis=1).astype(float)
rng=np.random.default_rng(7)
for fine in (False,True):
  E=[]
  for r in range(10):
    h=rng.random(len(O))<.5; A,B=O[h],O[~h]
    XA=X(A,True,fine); b=np.linalg.lstsq(XA.values,A.ryr.values,rcond=None)[0]; cf=pd.Series(b,XA.columns).drop('prem')
    XB=X(B,False,fine).reindex(columns=cf.index,fill_value=0); p=XB.values@cf.values*B.yrs.values
    E.append((np.median(abs(B.res)),np.median(abs(B.res-p))))
  print('fine' if fine else 'coarse',np.mean(E,0).round(4))
# 全樣本最後係數（相對全樣本平均，行政區指數＝平均）
XA=X(O); b=np.linalg.lstsq(XA.values,O.ryr.values,rcond=None)[0]; cf=pd.Series(b,XA.columns)
# HC0 se
res=O.ryr.values-XA.values@b; XtXi=np.linalg.pinv(XA.values.T@XA.values); S=(XA.values*res[:,None]).T@(XA.values*res[:,None]); se=np.sqrt(np.diag(XtXi@S@XtXi))
T=pd.DataFrame({'b':cf,'se':se}); print((T*100).round(3))
# 各屋齡段的漂移（其他欄位取樣本平均），減掉全樣本平均預測 → 相對行政區指數
Xm=XA.mean(); base=Xm@cf
out={}
for g in sorted(O.ab.unique(),key=lambda s:float(s.split(',')[0][1:])):
    xm=Xm.copy(); 
    for c in [c for c in XA.columns if c.startswith('a_')]: xm[c]=0
    xm['a_'+g]=1; out[g]=round(float(xm@cf-base),4)
print('age drift rel',out)
for g in sorted(O.pb.unique(),key=lambda s:float(s.split(',')[0][1:])):
    xm=Xm.copy()
    for c in [c for c in XA.columns if c.startswith('p_')]: xm[c]=0
    xm['p_'+g]=1; print('ping',g,round(float(xm@cf-base),4))
# 個別起伏：res 去掉預測後，平方 = s2*yrs + tx 以群組分別估
O['e']=O.res-(XA.drop(columns='prem')@cf.drop('prem')).values*O.yrs
def slope(D):
    Z=np.c_[D.yrs,np.ones(len(D))]; e2=np.minimum(D.e**2,np.quantile(D.e**2,.99)); return np.linalg.lstsq(Z,e2,rcond=None)[0]
s0=slope(O); print('all s2/yr %.5f tx %.4f sig/yr %.4f'%(s0[0],s0[1],np.sqrt(max(s0[0],0))))
for col,grp in [('ab',None),('pb',None),('typ',None),('elev',None),('mgmt',None),('top',None)]:
    for g,D in O.groupby(col):
        if len(D)<300: continue
        s=slope(D); print(col,g,len(D),'sig ratio %.2f  tx %.4f'%(np.sqrt(max(s[0],1e-9)/s0[0]),s[1]))
