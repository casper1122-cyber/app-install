# 地段（附近 300 公尺的房子比同區貴多少）跟之後漲幅、起伏的關係：同一戶賣兩次
import pandas as pd,numpy as np,json
from scipy.spatial import cKDTree
d=pd.read_pickle('/tmp/claude-0/door/res_geo_all.pkl'); d=d[d.gx.notna()&(d.unit>0)&(d.y<=2026)].copy()
d['t']=d.y+(d.q-1)/4; d['k']=d.addr.str.replace(r'\s','',regex=True); d['lu']=np.log(d.unit)
d['ab']=pd.cut(d.age,[-1,5,10,20,30,40,200]).astype(str)
g=d.groupby(['dist','y','typ','ab']).lu; d['prem']=d.lu-g.transform('median'); d.loc[g.transform('size')<10,'prem']=np.nan
d=d[d.prem.notna()].reset_index(drop=True)
T=cKDTree(d[['gx','gy']].values); kid=pd.factorize(d.k)[0]
H=json.load(open('/tmp/claude-0/hpid/hpid_app.json')); qi={q:i for i,q in enumerate(H['q'])}
RS=json.load(open('/tmp/claude-0/hpid/rs_coef.json'))
ds=d.sort_values('t'); out=[]
for k,gg in ds.groupby('k'):
    if len(gg)<2: continue
    a=gg.iloc[0]; b=gg.iloc[-1]
    if b.t-a.t<3 or abs(a.ping-b.ping)/a.ping>0.05: continue
    I=H['idx'].get(a.dist); qa,qb='%d/Q%d'%(a.y,a.q),'%d/Q%d'%(b.y,b.q)
    if not I or qa not in qi or qb not in qi: continue
    res=np.log(b.unit/a.unit)-np.log(I[qi[qb]]/I[qi[qa]])
    if abs(res)>=1: continue
    nb=T.query_ball_point([a.gx,a.gy],300); nb=[j for j in nb if kid[j]!=kid[a.name] and abs(d.t[j]-a.t)<=2]
    if len(nb)<8: continue
    out.append((a.city,a.typ,a.age,a.ping,b.t-a.t,res,a.prem,float(np.median(d.prem.values[nb])),len(nb),a.t))
O=pd.DataFrame(out,columns='city typ age ping yrs res own loc nn ta'.split()); O.to_pickle('/tmp/claude-0/door/loc_rs.pkl'); print(len(O))
