import pandas as pd, numpy as np, json
df=pd.read_pickle('/tmp/claude-0/hpid/res.pkl'); df=df[(df.y<=2026)]
df=df[~((df.y==2026)&(df.q>3))]
df["qi"]=(df.y-2012)*4+df.q-1
df["lu"]=np.log(df.unit); df["lp"]=np.log(df.ping)
df["fr"]=np.where(df.typ=="透天厝",0,df.fl/df.tot.clip(lower=1)); df["top"]=((df.fl==df.tot)&(df.typ!="透天厝")).astype(float); df["g1"]=((df.fl==1)&(df.typ!="透天厝")).astype(float)
# 去掉離群：每個行政區 log 單價距中位數超過 1.2 的
med=df.groupby(['dist','typ']).lu.transform('median'); df=df[(df.lu-med).abs()<1.2]
QN=int(df.qi.max())+1
def fit(d, qcol='qi', fe=None):
    X=[]; names=[]
    Q=pd.get_dummies(d[qcol]).astype(float); qs=list(Q.columns)
    cols=[Q.values]
    T=pd.get_dummies(d.typ,drop_first=True).astype(float); cols.append(T.values)
    a=d.age.values; cols.append(np.c_[a,a**2/100,np.maximum(a-30,0)])
    cols.append(np.c_[d.lp.values,d.lp.values**2,d.fr.values,d.top.values,d.g1.values])
    if fe is not None:
        F=pd.get_dummies(d[fe],drop_first=True).astype(float); cols.append(F.values)
    X=np.hstack(cols); y=d.lu.values
    b,*_=np.linalg.lstsq(X,y,rcond=None)
    res=y-X@b
    return dict(zip(qs,b[:len(qs)])), b, res
out={"q":[f"{2012+i//4}/Q{i%4+1}" for i in range(QN)]}
stat={}
age_coef={}; typd={}
for city,dc in df.groupby('city'):
    if len(dc)<3000: continue
    qc,b,res=fit(dc,fe='dist')
    base=qc.get(QN-1) or list(qc.values())[-1]
    ci=np.array([qc.get(i,np.nan) for i in range(QN)])
    # 少的季（<30 筆）用前後補
    cnt=dc.groupby('qi').size().reindex(range(QN)).fillna(0).values
    s=pd.Series(ci); s[cnt<30]=np.nan; s=s.interpolate(limit_direction='both')
    ci=s.values.copy(); cs=ci.copy(); cs[1:-1]=(ci[:-2]+2*ci[1:-1]+ci[2:])/4; ci=cs
    out[city]=list(np.round(np.exp(ci-ci[-1])*100,2))
    # 同一個縣市裡不同房型（大樓、華廈、公寓、透天）的漲跌：跟縣市整體比
    for typ,dt in dc.groupby('typ'):
        if len(dt)<3000 or dt.dist.nunique()<1: continue
        dt2=dt.copy(); dt2['typ']='x'
        qt,_,_=fit(dt2,fe='dist')
        ti=np.array([qt.get(i,np.nan) for i in range(QN)]); tc=dt.groupby('qi').size().reindex(range(QN)).fillna(0).values
        dev=pd.Series(ti-ci); dev[tc<30]=np.nan; dev=dev.interpolate(limit_direction='both').values
        dsm=dev.copy(); dsm[2:-2]=(dev[:-4]+2*dev[1:-3]+3*dev[2:-2]+2*dev[3:-1]+dev[4:])/9
        typd.setdefault(city,{})[typ]=list(np.round(np.exp(dsm-dsm[-1])*1000).astype(int).tolist())
    # 年紀係數（城市）：age, age^2/100, max(age-30,0) 在 T 之後
    nt=dc.typ.nunique()-1; k=len(qc)+nt
    age_coef[city]=[float(b[k]),float(b[k+1]),float(b[k+2])]
    # 行政區
    for dist,dd in dc.groupby('dist'):
        n=len(dd)
        if n<300: stat[dist]=('city',n); continue
        qd,_,_=fit(dd)
        di=np.array([qd.get(i,np.nan) for i in range(QN)])
        dcnt=dd.groupby('qi').size().reindex(range(QN)).fillna(0).values
        dev=di-ci
        # 用筆數加權的 5 季移動平均（季資料雜訊大）
        w=dcnt.astype(float); dv=np.nan_to_num(dev)*w
        ker=np.array([1,2,3,2,1.])
        num=np.convolve(dv,ker,'same'); den=np.convolve(w,ker,'same')
        sm=np.where(den>0,num/np.maximum(den,1e-9),np.nan)
        sm=pd.Series(sm).interpolate(limit_direction='both').values
        # 往城市縮：每季附近筆數少就多靠城市
        shr=den/(den+60)
        dlog=ci+(sm-sm[-1])*shr
        out[dist]=list(np.round(np.exp(dlog-dlog[-1])*100,2))
        stat[dist]=('own',n)
    print(city,len(dc),'dists',sum(1 for k,v in stat.items() if k.startswith(city) and v[0]=='own'),'/',dc.dist.nunique(), 'age',np.round(age_coef[city],4))
S0=int(np.argmax(df.groupby('qi').size().reindex(range(QN)).fillna(0).values>=2000))
cut=lambda a:a[S0:]
out={k:(cut(v) if isinstance(v,list) else v) for k,v in out.items()}
for c in typd:
    for t in typd[c]: typd[c][t]=cut(typd[c][t])
json.dump({"v":1,"src":"內政部實價登錄（2012 年 8 月起，住家用、一棟一戶、排除親友特殊交易）","q":out.pop("q"),"idx":out,"type":typd,"age":{k:[round(x,5) for x in v] for k,v in age_coef.items()},"n":{k:v[1] for k,v in stat.items()}},open('/tmp/claude-0/hpid/hpid.json','w'),ensure_ascii=False)
