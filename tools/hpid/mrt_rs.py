import pandas as pd,numpy as np,json
from scipy.spatial import cKDTree
XY=np.load('/tmp/claude-0/door/mrt_xy.npy'); T=cKDTree(XY)
d=pd.read_pickle('/tmp/claude-0/door/res_geo_all.pkl'); d=d[d.city.isin(['臺北市','新北市'])&d.gx.notna()&(d.unit>0)].copy()
d['t']=d.y+(d.q-1)/4; d['k']=d.addr.str.replace(r'\s','',regex=True)
H=json.load(open('/tmp/claude-0/hpid/hpid_app.json')); qi={q:i for i,q in enumerate(H['q'])}
d=d.sort_values('t'); out=[]
for k,g in d.groupby('k'):
    if len(g)<2: continue
    a=g.iloc[0]; b=g.iloc[-1]
    if b.t-a.t<3 or abs(a.ping-b.ping)/a.ping>0.05: continue
    I=H['idx'].get(a.dist); qa,qb='%d/Q%d'%(a.y,a.q),'%d/Q%d'%(b.y,b.q)
    if not I or qa not in qi or qb not in qi: continue
    res=np.log(b.unit/a.unit)-np.log(I[qi[qb]]/I[qi[qa]])
    if abs(res)<1: out.append((a.gx,a.gy,b.t-a.t,res,a.typ,a.age))
O=pd.DataFrame(out,columns=['x','y','yrs','res','typ','age']); O['dm'],_=T.query(O[['x','y']].values)
O['b']=pd.cut(O.dm,[0,300,600,1200,1e9]); O['ryr']=O.res/O.yrs
t=O.groupby('b').agg(n=('ryr','size'),drift=('ryr','mean'),se=('ryr',lambda x:x.std()/np.sqrt(len(x)))); print((t*[1,100,100]).round(3)); O['r10']=O.res/np.sqrt(O.yrs); print(O.groupby('b').r10.std().round(4))
