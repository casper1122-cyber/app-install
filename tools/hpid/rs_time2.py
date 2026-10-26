import pandas as pd,numpy as np
exec(open('/tmp/claude-0/hpid/rs_fit.py').read().split("rng=")[0].replace("rs_feat.pkl","rs_feat2.pkl"))
def fit(A,mode,fine=True):
    XA=X(A,mode=='prem',fine)
    if mode=='slope':   # res = yrs * (x·b)，用 res 本身（不除年數），加常數吸收單次成交的價差
        Z=np.c_[XA.values*A.yrs.values[:,None],np.ones(len(A))]; b=np.linalg.lstsq(Z,A.res.values,rcond=None)[0][:-1]
    else: b=np.linalg.lstsq(XA.values,A.ryr.values,rcond=None)[0]
    cf=pd.Series(b,XA.columns); return cf.drop('prem') if 'prem' in cf else cf
def pred(cf,B,fine=True):
    XB=X(B,False,fine).reindex(columns=cf.index,fill_value=0); return (XB.values@cf.values-cf['c'])*B.yrs.values
for cut,tst in [(2019,2017),(2021,2019),(2023,2021)]:
    A=O[O.tb<cut]; B=O[O.ta>=tst]; r0=B.res-B.res.mean(); s='%d→%d n=%d/%d base %.4f'%(cut,tst,len(A),len(B),np.median(abs(r0)))
    for mode in ('prem','noprem','slope'):
        for sh in (1,0.5):
            p=pred(fit(A,mode),B)*sh; r=B.res-p; r=r-r.mean(); s+=' | %s×%.1f %.4f'%(mode,sh,np.median(abs(r)))
    print(s)
# 全時段 OOS（隨機一半）也比
rng=np.random.default_rng(3)
for mode in ('prem','noprem','slope'):
    E=[]
    for _ in range(6):
        h=rng.random(len(O))<.5; A,B=O[h],O[~h]; p=pred(fit(A,mode),B); r=B.res-p; E.append((np.median(abs(B.res-B.res.mean())),np.median(abs(r-r.mean()))))
    print('random',mode,np.mean(E,0).round(4))
