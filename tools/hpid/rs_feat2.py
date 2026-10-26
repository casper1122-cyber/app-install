# 同一戶賣兩次：哪些條件跟「之後漲得比同區多或少」「單一一間的起伏」有關
import pandas as pd,numpy as np,json
d=pd.read_pickle('/tmp/claude-0/hpid/res.pkl'); d=d[(d.unit>0)&(d.y<=2026)].copy()
d['t']=d.y+(d.q-1)/4; d['k']=d.addr.str.replace(r'\s','',regex=True); d['lu']=np.log(d.unit)
d['ab']=pd.cut(d.age,[-1,5,10,20,30,40,200]).astype(str)
g=d.groupby(['dist','y','typ','ab']).lu; d['prem']=d.lu-g.transform('median'); d.loc[g.transform('size')<10,'prem']=np.nan
d['total']=d.unit*d.ping
H=json.load(open('/tmp/claude-0/hpid/hpid_app.json')); qi={q:i for i,q in enumerate(H['q'])}
d=d.sort_values('t'); rows=[]
for k,gg in d.groupby('k'):
    if len(gg)<2: continue
    a=gg.iloc[0]; b=gg.iloc[-1]
    if b.t-a.t<3 or abs(a.ping-b.ping)/a.ping>0.05: continue
    I=H['idx'].get(a.dist); qa,qb='%d/Q%d'%(a.y,a.q),'%d/Q%d'%(b.y,b.q)
    if not I or qa not in qi or qb not in qi: continue
    res=np.log(b.unit/a.unit)-np.log(I[qi[qb]]/I[qi[qa]])
    if abs(res)<1: rows.append((a.t,b.t,a.city,a.typ,b.t-a.t,res,a.prem,a.mgmt,a.elev,a.fl,a.tot,a.total,a.age,a.ping))
O=pd.DataFrame(rows,columns='ta tb city typ yrs res prem mgmt elev fl tot total age ping'.split())
O['ryr']=O.res/O.yrs; O['r10']=O.res/np.sqrt(O.yrs)
O.to_pickle('/tmp/claude-0/hpid/rs_feat2.pkl')
