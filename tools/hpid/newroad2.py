import pandas as pd, numpy as np, re
d=pd.read_pickle('/tmp/claude-0/hpid/res_road.pkl')
d=d[d.unit>0].copy(); d['lu']=np.log(d.unit)
fw=str.maketrans('０１２３４５６７８９','0123456789')
d['proj']=[re.sub(r'(\d+樓|[一二三四五六七八九十百]+樓|地下.*|之\d+)$','',str(a).translate(fw)) for a in d.addr]
d['proj']=[re.sub(r'[一二三四五六七八九十百]+樓.*$|\d+樓.*$','',p) for p in d.proj]
n=d[(d.typ.isin(['住宅大樓','華廈']))&(d.age<=3)&(d.y>=2024)&(d.fl>=2)].copy()
print('projects',n.proj.nunique(),'rows',len(n))
# road premium from all residential (2019+), relative to dist-year-typ-agebucket median
o=d[(d.y>=2019)&(d.typ.isin(['住宅大樓','華廈','公寓','套房']))].copy()
o['ab']=pd.cut(o.age,[-1,5,10,20,30,40,200]).astype(str)
o['res']=o.lu-o.groupby(['dist','y','typ','ab']).lu.transform('median')
rng=np.random.default_rng(2)
projs=n.proj.unique(); E={k:[] for k in ['dist','roadNew5','roadPrem','combo']}
for rep in range(5):
  test=set(rng.choice(projs,len(projs)//2,replace=False))
  A=n[~n.proj.isin(test)]; B=n[n.proj.isin(test)]
  dm=A.groupby('dist').lu.median()
  # road new median with >=2 other projects and >=5 rows
  g=A.groupby(['dist','road']).agg(m=('lu','median'),c=('lu','size'),pj=('proj','nunique'))
  key=list(zip(B.dist,B.road)); gm=g.reindex(key)
  base=B.dist.map(dm).values; ok=~np.isnan(base)
  rn=np.where((gm.c.values>=5)&(gm.pj.values>=2),gm.m.values,base)
  # road premium excluding test projects
  oo=o[~o.proj.isin(test)]
  pr=oo.groupby(['dist','road']).res.agg(['median','count']).reindex(key)
  w=(pr['count']/(pr['count']+20)).fillna(0).values
  prem=np.nan_to_num(pr['median'].values)*w
  rp=base+prem
  combo=np.where((gm.c.values>=5)&(gm.pj.values>=2),gm.m.values,rp)
  y=B.lu.values
  for k,p in [('dist',base),('roadNew5',rn),('roadPrem',rp),('combo',combo)]:
    E[k].append(np.abs(y-p)[ok])
print({k:round(float(np.median(np.concatenate(v)))*100,2) for k,v in E.items()})
print({k:round(float(np.mean(np.concatenate(v)))*100,2) for k,v in E.items()})
# Fuhe road premium
yh=o[(o.dist=='新北市永和區')].groupby('road').res.agg(['median','count']).sort_values('count',ascending=False).head(20)
print((np.exp(yh['median'])-1).round(3).to_frame('prem').join(yh['count']))
