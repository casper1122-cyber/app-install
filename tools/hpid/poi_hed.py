# 離嫌惡設施／生活設施多遠，房價差多少：舊房子（屋齡 5 年以上、2019 年起）跟同區同年同類型同屋齡比的溢價；
# 再扣掉「同一個 1 公里格子」的平均（只比附近的房子，排除整區好壞），看離設施近的比遠的貴或便宜多少
import pandas as pd,numpy as np,sys
from scipy.spatial import cKDTree
P=pd.read_pickle('/tmp/claude-0/poi/poi.pkl'); P=P[P.x.notna()]
d=pd.read_pickle('/tmp/claude-0/door/res_geo_all.pkl'); d=d[d.gx.notna()&(d.unit>0)&(d.y>=2019)&(d.age>5)&d.typ.isin(['住宅大樓','華廈','公寓','套房','透天厝'])].copy()
d['lu']=np.log(d.unit); d['ab']=pd.cut(d.age,[5,10,20,30,40,200]).astype(str)
g=d.groupby(['dist','y','typ','ab']).lu; d['res']=d.lu-g.transform('median'); d=d[g.transform('size')>=10]
d['k']=d.addr.str.replace(r'\s','',regex=True)
d['c1']=(d.gx//1000).astype(int).astype(str)+'_'+(d.gy//1000).astype(int).astype(str)
d['r1']=d.res-d.groupby('c1').res.transform('mean'); d=d[d.groupby('c1').res.transform('size')>=30]
d['c2']=(d.gx//2500).astype(int).astype(str)+'_'+(d.gy//2500).astype(int).astype(str); d['r2']=d.res-d.groupby('c2').res.transform('mean')
CATS={'funeral':(['funeral','crem'],['臺北市','新北市','基隆市']),'ossuary':(['ossuary'],['臺北市','新北市','基隆市']),'cemetery':(['cemetery'],['臺北市','新北市','基隆市']),'incin':(['incin'],['臺北市','新北市','高雄市']),'gas':(['gas'],None),'market':(['market'],None),'temple':(['temple'],['桃園市']),'park':(['park'],['臺北市']),'school_e':(['school_e'],['臺北市']),'school_j':(['school_j'],['臺北市'])}
B=[0,50,100,200,300,500,1000,1e9]
for name,(cs,cities) in CATS.items():
    Q=P[P.cat.isin(cs)]
    if cities is None: cities=['臺北市','新北市','桃園市','臺中市','臺南市','高雄市']
    Q=Q[Q.city.isin(cities)|True]
    D=d[d.city.isin(cities)].copy()
    if not len(D) or not len(Q): continue
    D['dm'],_=cKDTree(Q[['x','y']].values).query(D[['gx','gy']].values)
    D['b']=pd.cut(D.dm,B,right=False)
    # 一戶多筆成交只算一次（中位數），避免大社區主宰
    U=D.groupby('k').agg(b=('b','first'),res=('res','median'),r1=('r1','median'),r2=('r2','median'),c1=('c1','first'),dm=('dm','first'))
    far=U[U.dm>=1000]; ref=U[(U.dm>=300)&(U.dm<1000)]
    t=U.groupby('b',observed=True).agg(n=('res','size'),dist_prem=('res','median'),local2500=('r2','median'),local=('r1','median'))
    # bootstrap 信賴區間（同格子一起抽）：<100m 跟 300～1000m 比
    near=U[U.dm<100]; 
    def diff(A,Bb): return np.median(A.r1)-np.median(Bb.r1)
    rng=np.random.default_rng(0); cells=U.c1.unique(); bs=[]
    for i in range(200):
        cs_=set(rng.choice(cells,len(cells))); A=near[near.c1.isin(cs_)]; Bb=ref[ref.c1.isin(cs_)]
        if len(A)>10: bs.append(diff(A,Bb))
    print('==',name,'cities',cities,'pois',len(Q),'units',len(U))
    print((t*[1,100,100,100]).round(2).to_string())
    if len(near)>20: print('  <100m vs 300-1000m (同 1 公里格子比): %+.2f%%  95%% %.2f ~ %.2f  n=%d'%(100*diff(near,ref),100*np.percentile(bs,2.5),100*np.percentile(bs,97.5),len(near)))
