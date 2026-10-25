# 用重複交易（同一戶賣兩次）估「同一戶跟行政區指數比，每年多漲或少漲多少」：照屋齡世代、房型、縣市分
import pandas as pd, numpy as np, json
df=pd.read_pickle('res.pkl'); df=df[df.y<=2026]
df['by']=(df.y+(df.q-0.5)/4-df.age).round(); df['t']=df.y+(df.q-1)/4
df['k']=df.addr.str.replace(r'\s','',regex=True)
H=json.load(open('hpid.json')); q=H['q']; qi={x:i for i,x in enumerate(q)}
rows=[]
for k,d in df.sort_values('t').groupby('k'):
    if len(d)<2: continue
    a=d.iloc[0]; b=d.iloc[-1]
    if b.t-a.t<2 or abs(a.ping-b.ping)/a.ping>0.05: continue
    qa=f"{int(a.y)}/Q{int(a.q)}"; qb=f"{int(b.y)}/Q{int(b.q)}"
    I=H['idx'].get(a.dist) or H['idx'].get(a.city)
    if I is None or qa not in qi or qb not in qi: continue
    act=np.log(b.unit/a.unit); pred=np.log(I[qi[qb]]/I[qi[qa]])
    if abs(act)>1: continue
    rows.append((a.city,a.dist,a.typ,a.by,(a.age+b.age)/2,b.t-a.t,act-pred))
r=pd.DataFrame(rows,columns='city dist typ by age yrs res'.split())
r.to_pickle('rs_pairs.pkl')
r['ab']=pd.cut(r.age,[-1,5,10,20,30,40,80],labels=['0-5','5-10','10-20','20-30','30-40','40+'])
# 每年殘差：迴歸 res = drift*yrs（加權最小平方，權重 yrs）→ drift = sum(res)/sum(yrs)
g=r.groupby(['ab','typ']).apply(lambda x: pd.Series({'n':len(x),'drift_yr_%':100*x.res.sum()/x.yrs.sum(),'se':100*x.res.std()/np.sqrt(len(x))/x.yrs.mean()}))
print(g.query('n>=150').round(2).to_string())
print(r.groupby('ab').apply(lambda x: pd.Series({'n':len(x),'drift_yr_%':100*x.res.sum()/x.yrs.sum()})).round(2).to_string())
