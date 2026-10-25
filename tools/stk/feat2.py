import numpy as np, pandas as pd, json, warnings; warnings.filterwarnings('ignore')
P=pd.read_pickle('/tmp/claude-0/stkA/feat.pkl').sort_values(['c','mi'])
mk=P.groupby('mi').r.median().fillna(0); P['mr']=P.mi.map(mk)
g=P.groupby('c')
# 盈餘、淨值（從本益比、淨值比反推每股）
P['eps']=np.where(P.pe>0,P.px/P.pe,np.where(P.loss==1,-1.0,np.nan))   # 虧損時只知道是負的
P['bvps']=np.where(P.pb>0,P.px/P.pb,np.nan)
P['lossN']=g.loss.transform(lambda s:s.rolling(24,min_periods=12).mean())        # 過去 2 年有幾成時間在虧損
P['epsg']=g.eps.transform(lambda s:np.log(s.where(s>0)/s.shift(12).where(s.shift(12)>0)))   # 盈餘一年成長
P['bvg']=g.bvps.transform(lambda s:np.log(s/s.shift(12)))
P['divN']=g.dy.transform(lambda s:(s.fillna(0)>0).rolling(36,min_periods=12).mean())   # 過去 3 年有幾成時間有發股利
# 波動拆成：跟大盤一起動（beta）和自己的
def beta(d):
    r=d.r.values; m=d.mr.values; out=np.full(len(r),np.nan); res=np.full(len(r),np.nan)
    for i in range(len(r)):
        a=r[max(0,i-35):i+1]; b=m[max(0,i-35):i+1]; ok=~np.isnan(a)&~np.isnan(b)
        if ok.sum()>=24:
            bb=np.cov(a[ok],b[ok])[0,1]/np.var(b[ok]); out[i]=bb; res[i]=np.std(a[ok]-bb*b[ok])*np.sqrt(12)
    return pd.DataFrame({'beta':out,'ivol':res},index=d.index)
B=P.groupby('c',group_keys=False).apply(beta); P=P.join(B)
P['mdd3']=g.p.transform(lambda s:(s/s.rolling(36,min_periods=24).max()).rolling(1).min())   # 現在離 3 年高點多遠
P['skew']=g.r.transform(lambda s:s.rolling(36,min_periods=24).skew())
P['lpx']=np.log(P.px)
L={x['c']:x for x in json.load(open('/tmp/claude-0/stk/list.json'))}
def since(c):
    x=L.get(c); 
    if not x: return np.nan
    y=x['since'][:4]; return int(y) if y.isdigit() else np.nan
P['since']=P.c.map(since); P['lage']=P.m.str[:4].astype(int)-P.since
P.to_pickle('/tmp/claude-0/stkA/feat2.pkl'); print('ok',P.shape)
