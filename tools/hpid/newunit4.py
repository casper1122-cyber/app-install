# 新大樓行情（都更估算用），2026-10 第 3 版：整個建案拿掉驗證後的做法
#  全國：行政區新大樓單價（2016 年起、屋齡 3 年內、2 樓以上，用行政區房價指數換算成現在的價格，取中位數）
#        × 這條路的位置溢價（屋齡 5 年以上的舊房子 2019 年起跟同區、同年、同類型、同屋齡段比，中位數，n/(n+20) 縮小）
#  臺北、新北（有門牌坐標）：上面那個 跟「離家最近 5 個新建案（越近越重）」各一半；位置溢價改用家附近 450 公尺見方的舊房子
import pandas as pd, numpy as np, re, json, sys, math
from scipy.spatial import cKDTree
from scipy.sparse.csgraph import connected_components
from scipy.sparse import coo_matrix
J=sys.argv[1]; Y0=2016; CS=150
H=json.load(open(J)); QI={q:i for i,q in enumerate(H['q'])}
def adj(ds,y,q):
    s=H['idx'].get(ds) or H['idx'].get(ds[:3]); i=QI.get('%d/Q%d'%(y,q))
    return s[-1]/s[i] if s and i is not None and s[i] else np.nan
CN='零一二三四五六七八九十'
# ---- 全國 ----
d=pd.read_pickle('/tmp/claude-0/hpid/res_road.pkl'); d=d[d.unit>0].copy()
d['road']=d.road.map(lambda r: re.sub(r'(\d+)段',lambda m:(CN[int(m.group(1))] if int(m.group(1))<=10 else m.group(1))+'段',r) if isinstance(r,str) else r)
n=d[(d.typ.isin(['住宅大樓','華廈']))&(d.age<=3)&(d.y>=Y0)&(d.fl>=2)].copy()
n['f']=[adj(a,b,c) for a,b,c in zip(n.dist,n.y,n.q)]; n=n[n.f.notna()]; n['u']=n.unit*n.f
dist={k:[int(round(v.u.median())),int(len(v))] for k,v in n.groupby('dist')}
city={k:[int(round(v.u.median())),int(len(v))] for k,v in n.groupby('city')}
o=d[(d.y>=2019)&(d.age>5)&(d.typ.isin(['住宅大樓','華廈','公寓','套房']))].copy(); o['lu']=np.log(o.unit)
o['ab']=pd.cut(o.age,[5,10,20,30,40,200]).astype(str)
g=o.groupby(['dist','y','typ','ab']).lu; o['res']=o.lu-g.transform('median'); o=o[g.transform('size')>=10]
p=o[o.road.notna()].groupby(['dist','road']).res.agg(['median','count'])
prem={f'{a}|{b}':round(float(r['median']*r['count']/(r['count']+20)),4) for (a,b),r in p.iterrows() if abs(r['median']*r['count']/(r['count']+20))>=0.003}
# ---- 臺北、新北：建案位置、舊房子格子 ----
G=pd.read_pickle('/tmp/claude-0/door/res_geo_all.pkl'); G=G[G.gx.notna()&(G.unit>0)].copy(); G['lu']=np.log(G.unit)
m=G[(G.typ.isin(['住宅大樓','華廈']))&(G.age<=3)&(G.y>=Y0)&(G.fl>=2)].copy()
m['f']=[adj(a,b,c) for a,b,c in zip(m.dist,m.y,m.q)]; m=m[m.f.notna()]; m['u']=m.unit*m.f
m['by']=(m.y+(m.q-1)/4-m.age).round()
pts=m.groupby(['gx','gy','by']).size().reset_index()[['gx','gy','by']]
t=cKDTree(pts[['gx','gy']].values); pr=np.array(list(t.query_pairs(80))); pr=pr[np.abs(pts.by.values[pr[:,0]]-pts.by.values[pr[:,1]])<=1]
_,lab=connected_components(coo_matrix((np.ones(len(pr)),(pr[:,0],pr[:,1])),shape=(len(pts),len(pts))),directed=False); pts['proj']=lab
m=m.merge(pts,on=['gx','gy','by'])
P=m.groupby('proj').agg(x=('gx','mean'),y=('gy','mean'),u=('u','median'),c=('u','size'),by=('by','median'),city=('city','first'))
P=P[P.c>=5]
og=G[(G.y>=2019)&(G.age>5)&(G.typ.isin(['住宅大樓','華廈','公寓','套房']))].copy()
og['ab']=pd.cut(og.age,[5,10,20,30,40,200]).astype(str)
gg=og.groupby(['dist','y','typ','ab']).lu; og['res']=og.lu-gg.transform('median'); og=og[gg.transform('size')>=10]
og['cx']=(og.gx//CS).astype(int); og['cy']=(og.gy//CS).astype(int); og['rc']=og.res.clip(-0.5,0.5)
cells={f'{a}_{b}':[int(round(v.rc.sum()*1000)),int(len(v))] for (a,b),v in og.groupby(['cx','cy'])}
N=H['newUnit']
if N.get('roadCities'): prem={k:v for k,v in prem.items() if k[:3] in N['roadCities']}   # 路段溢價只用驗證過有改善的縣市（roadold.py）
for k in ['road','roadSrc','roadCheck']: N.pop(k,None)
N.update({'dist':dist,'city':city,'roadPrem':prem,
 'src':'實價登錄 2016 年起、屋齡 3 年內的大樓華廈（2 樓以上、扣車位），用行政區房價指數換算成現在的價格，每坪中位數',
 'premSrc':'這條路的房子（屋齡 5 年以上，2019 年起）跟同區、同年、同類型、同屋齡的比，貴或便宜多少（成交少的會往 0 縮）',
 'near':{'p':{c:[[int(round(a*1e0)),int(round(b)),int(round(u)),int(k),int(y)] for a,b,u,k,y in zip(g2.x,g2.y,g2.u,g2.c,g2.by)] for c,g2 in P.groupby('city')},
   'k':5,'cs':CS,'cells':cells,'K':20,'xy':'TWD97 TM2（公尺）',
   'src':'實價登錄 2016 年起、屋齡 3 年內的大樓華廈，用行政區房價指數換算成現在的價格；地址對到臺北、新北、桃園、臺中、臺南、高雄市政府的門牌坐標，80 公尺內、完工年差 1 年內的算同一個建案（至少 5 筆）',
   'check':'整個建案拿掉驗證 5 次（誤差中位數）：臺北、新北 1,435 個建案，只看行政區 9.3%、這個方法 7.0%；臺南 324 個建案 9.6%→9.3%；高雄 656 個建案 8.4%→7.6%；臺中 572 個建案 11.4%→9.2%；桃園 985 個建案 11.6%→9.1%'}})
for k in ['newSrc']: N.pop(k,None)
json.dump(H,open(J,'w'),ensure_ascii=False,separators=(',',':'))
print('dist',len(dist),'prem',len(prem),'proj',{c:len(v) for c,v in N['near']['p'].items()},'cells',len(cells))
