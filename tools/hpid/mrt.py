import pandas as pd,numpy as np,gzip,csv,io,json
from scipy.spatial import cKDTree
src=open('/tmp/claude-0/door/build.py').read(); exec(src[src.index('import math'):src.index('J=sys.argv[1]')])
r=list(csv.reader(io.StringIO(gzip.open('/tmp/claude-0/door2/mrt_tpe.csv.gz').read().decode('big5','replace'))))[1:]
lng=np.array([float(x[3]) for x in r]); lat=np.array([float(x[4]) for x in r])
# 經緯度 → TM2（用反算的反函數：數值解，夠準）
def ll2tm(lat,lng):
    from scipy.optimize import least_squares
    out=[]
    for a,b in zip(lat,lng):
        f=lambda p: np.array(tm2_to_ll(np.array([p[0]]),np.array([p[1]]))).ravel()-np.array([b,a])
        s=least_squares(f,[250000+(b-121)*101000,a*110700-0]); out.append(s.x)
    return np.array(out)
XY=ll2tm(lat,lng); T=cKDTree(XY)
d=pd.read_pickle('/tmp/claude-0/door/res_geo_all.pkl'); d=d[d.city.isin(['臺北市','新北市'])&d.gx.notna()&(d.unit>0)].copy()
d['dm'],_=T.query(d[['gx','gy']].values)
d['lu']=np.log(d.unit); d['ab']=pd.cut(d.age,[-1,5,10,20,30,40,200]).astype(str)
d=d[d.y>=2019]
g=d.groupby(['dist','y','typ','ab']).lu; d['res']=d.lu-g.transform('median'); d=d[g.transform('size')>=10]
bins=[0,200,300,400,600,800,1200,2000,1e9]
d['b']=pd.cut(d.dm,bins)
t=d.groupby('b').res.agg(['median','size']); t['prem']=np.exp(t['median'])-1; print(t.round(4))
for ty in ['住宅大樓','公寓','華廈']:
    s=d[d.typ==ty].groupby('b').res.median(); print(ty,(np.exp(s)-1).round(3).tolist())
d[['dist','y','typ','ab','dm','res','gx','gy','addr']].to_pickle('/tmp/claude-0/door/mrt_res.pkl')
np.save('/tmp/claude-0/door/mrt_xy.npy',XY)
