import pandas as pd, numpy as np, re, collections
fw=str.maketrans('０１２３４５６７８９','0123456789')
CN='零一二三四五六七八九十'
def nroad(r): return re.sub(r'(\d+)段',lambda m:(CN[int(m.group(1))] if int(m.group(1))<=10 else m.group(1))+'段',r)
d=pd.read_pickle('/tmp/claude-0/hpid/res.pkl'); d=d[d.city.isin(['臺北市','新北市'])].copy()
def parse(a,dist):
    a=str(a).translate(fw).replace('台','臺'); dn=dist[3:]
    a=re.sub('^'+dist[:3],'',a); a=re.sub('^'+dn,'',a); a=re.sub(r'^\S{1,4}?里(?=\S)','',a) if re.match(r'^\S{1,4}?里\S*?(路|街|大道)',a) else a
    a=re.sub(r'^\d+鄰','',a)
    m=re.match(r'^(.+?(?:路|街|大道)(?:[一二三四五六七八九十\d]+段)?)(?:(\d+)巷)?(?:(\d+)弄)?(\d+)(?:[~～](\d+))?號',a)
    if not m: return None
    n=int(m.group(4)); n2=int(m.group(5)) if m.group(5) else n
    return nroad(m.group(1)), int(m.group(2) or 0), int(m.group(3) or 0), n, n2
P=[parse(a,ds) for a,ds in zip(d.addr,d.dist)]
d['ok']=[p is not None for p in P]; print('parsed',np.mean(d.ok))
d=d[d.ok].copy(); d['road2']=[p[0] for p in P if p]; d['lane']=[p[1] for p in P if p]; d['alley']=[p[2] for p in P if p]; d['n']=[(p[3]+p[4])//2 for p in P if p]; d['rng']=[p[4]-p[3] for p in P if p]
G=pd.read_pickle('/tmp/claude-0/door/doors.pkl')
# 行政區 ↔ 鄉鎮市區代碼：用「這條路只在一個區」的投票
roads=G.groupby(['city','road']).ac.agg(lambda s:set(s))
vote=collections.Counter()
for (c,ds,r),k in d.groupby(['city','dist','road2']).size().items():
    acs=roads.get((c,r))
    if acs and len(acs)==1: vote[(ds,next(iter(acs)))]+=k
m={}
for (ds,ac),k in sorted(vote.items(),key=lambda z:-z[1]):
    if ds not in m and ac not in m.values(): m[ds]=ac
print('dists mapped',len(m),'of',d.dist.nunique())
d['ac']=d.dist.map(m)
# 對門牌：同區同路同巷同弄，找號碼最近的一個
idx={}
for (ac,r,l,al),g in G.groupby(['ac','road','lane','alley']): idx[(ac,r,l,al)]=(g.n.values.astype(int),g.x.values,g.y.values)
X=np.full(len(d),np.nan);Y=X.copy();E=np.full(len(d),-1)
for i,(ac,r,l,al,n) in enumerate(zip(d.ac,d.road2,d.lane,d.alley,d.n)):
    t=idx.get((ac,r,l,al)) or (idx.get((ac,r,0,0)) if l else None)
    if t is None: continue
    j=np.argmin(np.abs(t[0]-n)); X[i]=t[1][j];Y[i]=t[2][j];E[i]=abs(int(t[0][j])-n) if (ac,r,l,al) in idx else 999
d['gx']=X;d['gy']=Y;d['nerr']=E
print('geocoded',np.mean(~np.isnan(X)),'exact',np.mean(E==0),'within10',np.mean((E>=0)&(E<=10)))
d.to_pickle('/tmp/claude-0/door/res_geo.pkl')
