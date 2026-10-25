import pandas as pd, numpy as np, json
df=pd.read_pickle('res2.pkl'); df=df[~((df.y==2026)&(df.q>3))]
H=json.load(open('hpid.json')); q=H['q']; qi={x:i for i,x in enumerate(q)}
df['qi']=[qi.get(f"{y}/Q{qq}",-1) for y,qq in zip(df.y,df.q)]; df=df[df.qi>=0]
df['lu']=np.log(df.unit); df['lp']=np.log(df.ping)
QN=len(q)
def fit(d, ctrl):
    Q=pd.get_dummies(d.qi).astype(float); qs=list(Q.columns)
    cols=[Q.values, pd.get_dummies(d.dist,drop_first=True).astype(float).values, np.c_[d.lp, d.lp**2]]
    if 'age' in ctrl: a=d.age.fillna(d.age.median()).values; cols.append(np.c_[a, a**2/100, d.age.isna().astype(float)])
    if 'f1' in ctrl: cols.append(np.c_[d.f1, d.arcade])
    if 'zone' in ctrl: cols.append(pd.get_dummies(d.typ,drop_first=True).astype(float).values)
    X=np.hstack(cols); b,*_=np.linalg.lstsq(X,d.lu.values,rcond=None)
    return dict(zip(qs,b[:len(qs)]))
def series(d, ctrl, minq=15):
    med=d.groupby('dist').lu.transform('median'); d=d[(d.lu-med).abs()<1.5]
    c=fit(d,ctrl); cnt=d.groupby('qi').size().reindex(range(QN)).fillna(0).values
    s=pd.Series([c.get(i,np.nan) for i in range(QN)]); s[cnt<minq]=np.nan
    if s.notna().sum()<30: return None, int(cnt.sum())
    s=s.interpolate(limit_direction='both').values
    sm=s.copy(); sm[2:-2]=(s[:-4]+2*s[1:-3]+3*s[2:-2]+2*s[3:-1]+s[4:])/9
    return list(np.round(np.exp(sm-sm[-1])*100,2)), int(cnt.sum())
out={}; info={}
for kind,ctrl,filt in [('shop',['age','f1'],lambda d:d),('office',['age','f1'],lambda d:d),('factory',['age','f1'],lambda d:d),('land',['zone'],lambda d:d[d.typ.isin(['住','商'])])]:
    D=filt(df[df.kind==kind])
    for city,dc in D.groupby('city'):
        s,n=series(dc,ctrl)
        if s: out.setdefault(kind,{})[city]=s; info[kind+city]=n
    s,n=series(D.assign(dist=D.city),ctrl); out.setdefault(kind,{})['全國']=s; info[kind+'全國']=n
json.dump({"q":q,"idx":out,"n":info},open('hpid2.json','w'),ensure_ascii=False)
R=H['idx']
for kind in out:
    for city in ['臺北市','新北市','桃園市','臺中市','高雄市','全國']:
        s=out[kind].get(city)
        if not s: continue
        a=np.array(s); i14=q.index('2014/Q2'); i20=q.index('2020/Q1')
        res=R.get(city)
        print(kind,city,info.get(kind+city),'2012→now x%.2f'%(a[-1]/a[0]),'2014Q2→2020Q1 %+.0f%%'%((a[i20]/a[i14]-1)*100), '住宅同期 %+.0f%%'%((res[i20]/res[i14]-1)*100) if res else '')
# 驗證：成交隨機分兩半各算一次，年變化的相關（越高代表指數越不是雜訊）
rng=np.random.default_rng(1); print('--- split-half')
for kind,ctrl,filt in [('shop',['age','f1'],lambda d:d),('office',['age','f1'],lambda d:d),('factory',['age','f1'],lambda d:d),('land',['zone'],lambda d:d[d.typ.isin(['住','商'])])]:
    D=filt(df[df.kind==kind])
    for city in ['臺北市','新北市','桃園市','臺中市','高雄市']:
        dc=D[D.city==city]; 
        if len(dc)<2000: continue
        m=rng.random(len(dc))<0.5
        a,_=series(dc[m],ctrl,8); b,_=series(dc[~m],ctrl,8)
        if not a or not b: continue
        a=np.log(a); b=np.log(b); da=a[4:]-a[:-4]; db=b[4:]-b[:-4]
        print(kind,city,'corr(4季變化)=%.2f'%np.corrcoef(da,db)[0,1], '總變化 %.2f vs %.2f'%(np.exp(a[-1]-a[0]),np.exp(b[-1]-b[0])))
