import pandas as pd, numpy as np, re
d=pd.read_pickle('/tmp/claude-0/hpid/res_road.pkl'); d=d[d.unit>0].copy(); d['lu']=np.log(d.unit)
d=d[d.y>=2019]
d['ab']=pd.cut(d.age,[-1,5,10,20,30,40,200]).astype(str)
d['res']=d.lu-d.groupby(['dist','y','typ','ab','road']).lu.transform('median')
d['cnt']=d.groupby(['dist','y','typ','ab','road']).lu.transform('size')
a=d[(d.typ=='公寓')&(d.tot.isin([4,5]))&(~d.elev)&(d.cnt>=8)]
for big in [['臺北市','新北市'],None]:
  b=a if big is None else a[a.city.isin(big)]
  t=b.groupby(['tot','fl']).res.agg(['median','count']); t['ratio']=np.exp(t['median']).round(3)
  print('公寓 within dist-year-age-road', big); print(t)
# new buildings: within project
fw=str.maketrans('０１２３４５６７８９','0123456789')
n=d[(d.typ.isin(['住宅大樓','華廈']))&(d.age<=3)&(d.tot>=8)].copy()
n['proj']=[re.sub(r'[一二三四五六七八九十百]+樓.*$|\d+樓.*$','',str(x).translate(fw)) for x in n.addr]
n['r2']=n.lu-n.groupby('proj').lu.transform('median'); n['pc']=n.groupby('proj').lu.transform('size'); n=n[n.pc>=10]
n['rel']=pd.cut(n.fl/n.tot,[0,0.2,0.4,0.6,0.8,0.95,1.0])
t=n.groupby('rel').r2.agg(['median','count']); t['ratio']=np.exp(t['median']).round(3); print('new bldg floor', t)
