# 都更、危老估算用：路段新大樓單價、路段溢價、舊公寓樓層效用比、新大樓樓層比
# 輸入 res_road.pkl（road.py 產生），合併進 hpid_app.json 的 newUnit
import pandas as pd, numpy as np, re, json, sys
J=sys.argv[1] if len(sys.argv)>1 else '/tmp/claude-0/hpid/hpid_app.json'
d=pd.read_pickle('/tmp/claude-0/hpid/res_road.pkl'); d=d[d.unit>0].copy(); d['lu']=np.log(d.unit)
CN='零一二三四五六七八九十'
d['road']=d.road.map(lambda r: re.sub(r'(\d+)段',lambda m: (CN[int(m.group(1))] if int(m.group(1))<=10 else m.group(1))+'段',r) if isinstance(r,str) else r)
fw=str.maketrans('０１２３４５６７８９','0123456789')
d['proj']=[re.sub(r'[一二三四五六七八九十百]+樓.*$|\d+樓.*$','',str(x).translate(fw)) for x in d.addr]
n=d[(d.typ.isin(['住宅大樓','華廈']))&(d.age<=3)&(d.y>=2024)&(d.fl>=2)&d.road.notna()]
g=n.groupby(['dist','road']).agg(m=('unit','median'),c=('unit','size'),pj=('proj','nunique'))
g=g[(g.c>=5)&(g.pj>=2)]
road={f'{a}|{b}':[int(round(r.m)),int(r.c),int(r.pj)] for (a,b),r in g.iterrows()}
o=d[(d.y>=2019)&(d.typ.isin(['住宅大樓','華廈','公寓','套房']))&d.road.notna()].copy()
o['ab']=pd.cut(o.age,[-1,5,10,20,30,40,200]).astype(str)
o['res']=o.lu-o.groupby(['dist','y','typ','ab']).lu.transform('median')
p=o.groupby(['dist','road']).res.agg(['median','count']); p=p[p['count']>=10]
prem={f'{a}|{b}':round(float(r['median']*r['count']/(r['count']+20)),4) for (a,b),r in p.iterrows()}
# 舊公寓樓層（同區、同年、同屋齡段、同路段比）
q=d[(d.y>=2019)].copy(); q['ab']=pd.cut(q.age,[-1,5,10,20,30,40,200]).astype(str)
key=['dist','y','typ','ab','road']; q['res']=q.lu-q.groupby(key).lu.transform('median'); q['cnt']=q.groupby(key).lu.transform('size')
a=q[(q.typ=='公寓')&(q.tot.isin([4,5]))&(~q.elev)&(q.cnt>=8)]
def tab(b):
  out={}
  for t in [4,5]:
    r=[float(np.exp(b[(b.tot==t)&(b.fl==f)].res.median())) for f in range(1,t+1)]
    avg=sum(r)/t; out[str(t)]=[round(x/avg,3) for x in r]   # 對整棟平均
  return out
oldFl={'tpe':tab(a[a.city.isin(['臺北市','新北市'])]),'all':tab(a)}
nb=q[(q.typ.isin(['住宅大樓','華廈']))&(q.age<=3)&(q.tot>=8)].copy()
nb['proj']=[re.sub(r'[一二三四五六七八九十百]+樓.*$|\d+樓.*$','',str(x).translate(fw)) for x in nb.addr]
nb['r2']=nb.lu-nb.groupby('proj').lu.transform('median'); nb=nb[nb.groupby('proj').lu.transform('size')>=10]
edges=[0,0.2,0.4,0.6,0.8,0.95,1.0001]; nb['b']=pd.cut(nb.fl/nb.tot,edges,labels=False)
newFl=[round(float(np.exp(nb[nb.b==i].r2.median())),3) for i in range(6)]
j=json.load(open(J)); N=j['newUnit']
N.update({'road':road,'roadPrem':prem,'oldFl':oldFl,'newFl':{'edges':edges[1:-1]+[1],'r':newFl},
  'roadSrc':'實價登錄 2024 年起、屋齡 3 年內的大樓華廈在同一條路（段）的每坪中位數（至少 5 筆、2 個建案）；沒有的話用行政區新大樓單價 × 這條路 2019 年起跟同區同屋齡比的溢價',
  'roadCheck':'整個建案拿掉驗證（1 萬個建案）：只用行政區誤差中位數 8.8%，加路段 6.4%',
  'flSrc':'實價登錄 2019 年起、無電梯 4～5 樓公寓，跟同區、同年、同屋齡、同路段比，對整棟平均的比例'})
json.dump(j,open(J,'w'),ensure_ascii=False,separators=(',',':'))
print(len(road),len(prem),oldFl,newFl)
