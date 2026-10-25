# 重複交易驗證：同一個門牌（同一戶）賣過兩次以上，看實際漲幅 vs App 的路徑
import pandas as pd, numpy as np, json, re, sys
df=pd.read_pickle('res.pkl'); df=df[df.y<=2026]
df['by']=(df.y+(df.q-0.5)/4-df.age).round()
df['t']=df.y+(df.q-1)/4
df['k']=df.addr.str.replace(r'\s','',regex=True)
H=json.load(open('hpid.json')); q=H['q']; qi={x:i for i,x in enumerate(q)}
COH=[(1900,1974),(1975,1984),(1985,1994),(1995,2004),(2005,2014),(2015,2030)]
MODE=sys.argv[1] if len(sys.argv)>1 else 'coh'
def P(city,dist,typ,by):
    I=H['idx'].get(dist) or H['idx'].get(city)
    if I is None: return None
    if MODE=='coh':
        C=H['coh'].get(city,{}); band=[f"{lo}-{hi}" for lo,hi in COH if lo<=by<=hi]
        A=(C.get(band[0]+"|"+typ) or C.get(band[0])) if band else None
        return [I[i]*(A[i]/1000 if A else 1) for i in range(len(q))]
    if MODE=='dist': return I
    if MODE=='age':
        T=H['type'].get(city,{}).get(typ); B=H['age'][city]; f=lambda a: B[0]*a+B[1]*a*a/100+B[2]*max(a-30,0)
        out=[]
        for i,x in enumerate(q):
            tt=int(x[:4])+(int(x[-1])-0.5)/4; a=max(0,tt-by-0.5)
            out.append(I[i]*(T[i]/1000 if T else 1)*np.exp(f(a)))
        return out
g=df.sort_values('t').groupby('k')
res=[]
for k,d in g:
    if len(d)<2: continue
    a=d.iloc[0]; b=d.iloc[-1]
    if b.t-a.t<3 or abs(a.ping-b.ping)/a.ping>0.05: continue
    qa=f"{int(a.y)}/Q{int(a.q)}"; qb=f"{int(b.y)}/Q{int(b.q)}"
    if qa not in qi or qb not in qi: continue
    p=P(a.city,a.dist,a.typ,a.by)
    if p is None: continue
    act=np.log(b.unit/a.unit); pred=np.log(p[qi[qb]]/p[qi[qa]])
    res.append((a.city,a.typ,a.by,b.t-a.t,act,pred))
r=pd.DataFrame(res,columns='city typ by yrs act pred'.split())
r=r[(r.act.abs()<1.0)]
r['err']=r.act-r.pred
print(MODE,'pairs',len(r),'mean err (actual-app) per yr %.2f%%'%(100*(r.err/r.yrs).mean()),'median abs err %.1f%%'%(100*r.err.abs().median()))
r['band']=pd.cut(r.by,[1900,1974,1984,1994,2004,2014,2030])
print((r.groupby(['band','typ']).apply(lambda x: pd.Series({'n':len(x),'act_yr':100*(x.act/x.yrs).mean(),'app_yr':100*(x.pred/x.yrs).mean()}))).query('n>=100').round(2).to_string())
print(r.groupby('city').apply(lambda x: pd.Series({'n':len(x),'bias_yr':100*(x.err/x.yrs).mean()})).query('n>=200').round(2).to_string())
