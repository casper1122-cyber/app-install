import pandas as pd,numpy as np
exec(open('/tmp/claude-0/hpid/rs_fit.py').read().split("rng=")[0].replace("rs_feat.pkl","rs_feat2.pkl"))
for cut,tst in [(2021,2019),(2019,2017),(2023,2021)]:
    A=O[O.tb<cut]; B=O[O.ta>=tst]
    for fine in (False,True):
        XA=X(A,True,fine); b=np.linalg.lstsq(XA.values,A.ryr.values,rcond=None)[0]; cf=pd.Series(b,XA.columns).drop('prem')
        XB=X(B,False,fine).reindex(columns=cf.index,fill_value=0); p=(XB.values@cf.values-cf['c'])*B.yrs.values  # 不帶常數：只用相對
        r0=B.res-B.res.mean(); r1=B.res-p; r1=r1-r1.mean()
        print(cut,tst,len(A),len(B),'fine' if fine else 'coarse','median|e| %.4f -> %.4f'%(np.median(abs(r0)),np.median(abs(r1))))
    B=B.assign(p=p); print(B.groupby('ab').apply(lambda g:pd.Series({'n':len(g),'before':100*(g.res/g.yrs).mean(),'after':100*((g.res-g.p)/g.yrs).mean()})).round(2).T)
