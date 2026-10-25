import pandas as pd, numpy as np, re
from scipy.spatial import cKDTree
d=pd.read_pickle('/tmp/claude-0/door/res_geo.pkl')
print('unmapped',set(d.dist.unique())-set(d.dropna(subset=['ac']).dist.unique()))
d=d[d.gx.notna()&(d.unit>0)].copy(); d['lu']=np.log(d.unit)
d['x']=d.gx; d['yy']=d.gy
import json as _j, os as _o
Y0=int(_o.environ.get('Y0','2019'))
_H=_j.load(open('/tmp/claude-0/hpid/hpid_app.json')); _q={q:i for i,q in enumerate(_H['q'])}
n=d[(d.typ.isin(['住宅大樓','華廈']))&(d.age<=3)&(d.y>=Y0)&(d.fl>=2)].copy()
# 換算成現在的價格：用這個行政區的房價指數（實價登錄重複交易驗證過的那套）
def _adj(ds,y,q):
    s=_H['idx'].get(ds) or _H['idx'].get(ds[:3]); i=_q.get('%d/Q%d'%(y,q))
    return s[-1]/s[i] if s and i is not None and s[i] else np.nan
n['f']=[_adj(a,b,c) for a,b,c in zip(n.dist,n.y,n.q)]; n=n[n.f.notna()]; n['unit']=n.unit*n.f; n['lu']=np.log(n.unit)
n['by']=(n.y+(n.q-1)/4-n.age).round()   # 完工年
# 同一個建案：80 公尺內、完工年差 1 年內的連在一起（一棟有好幾個門牌、一個建案有好幾棟）
from scipy.sparse.csgraph import connected_components
from scipy.sparse import coo_matrix
pts=n.groupby(['x','yy','by']).size().reset_index()[['x','yy','by']]
t=cKDTree(pts[['x','yy']].values); pr=np.array(list(t.query_pairs(80)))
keep=np.abs(pts.by.values[pr[:,0]]-pts.by.values[pr[:,1]])<=1; pr=pr[keep]
M=coo_matrix((np.ones(len(pr)),(pr[:,0],pr[:,1])),shape=(len(pts),len(pts)))
nc,lab=connected_components(M,directed=False); pts['proj']=lab
n=n.merge(pts,on=['x','yy','by']); n['proj']=n.proj.astype(str)
# 建案層級：每個建案一個中位數（避免大建案主宰）
P=n.groupby('proj').agg(x=('x','mean'),yy=('yy','mean'),lu=('lu','median'),c=('lu','size'),dist=('dist','first'),road=('road2','first')).reset_index()
print('projects',len(P),'rows',len(n)); print(P.c.describe())
import sys
MINC=int(sys.argv[1]) if len(sys.argv)>1 else 1
P=P[P.c>=MINC].reset_index(drop=True); print('MINC',MINC,'projects',len(P))
rng=np.random.default_rng(3); res={}
# 舊房子（屋齡 5 年以上，2019 年起）跟同區、同年、同類型、同屋齡段比的溢價：拿來看「這個位置」貴不貴，不會用到要猜的新建案本身
o=d[(d.y>=2019)&(d.age>5)&(d.typ.isin(['住宅大樓','華廈','公寓','套房']))].copy()
o['ab']=pd.cut(o.age,[5,10,20,30,40,200]).astype(str)
o['res']=o.lu-o.groupby(['dist','y','typ','ab']).lu.transform('median')
o=o[o.groupby(['dist','y','typ','ab']).lu.transform('size')>=10]
rpo=o.groupby(['dist','road2']).res.agg(['median','count'])
otree=cKDTree(o[['x','yy']].values); ores=o.res.values
print('old rows',len(o))
CS=int(_o.environ.get('CS','150'))
o['cx']=(o.x//CS).astype(int); o['cy']=(o.yy//CS).astype(int)
o['rc']=o.res.clip(-0.5,0.5)
cell=o.groupby(['cx','cy']).rc.agg(['sum','count'])
cs_={k:(v['sum'],v['count']) for k,v in cell.iterrows()}
print('cells',len(cs_))
def gridp(x,y,K=20):
    cx,cy=int(x//CS),int(y//CS); s=0;c=0
    for i in (-1,0,1):
        for j in (-1,0,1):
            v=cs_.get((cx+i,cy+j))
            if v: s+=v[0]; c+=v[1]
    return (s/c)*c/(c+K) if c else 0
def evals(pred,B): return np.abs(B.lu.values-pred)
E={}
for rep in range(5):
    test=rng.random(len(P))<0.5; A=P[~test]; B=P[test]
    tree=cKDTree(A[['x','yy']].values); dm=A.groupby('dist').lu.median()
    base=B.dist.map(dm).values; ok=~np.isnan(base)
    def put(k,p): E.setdefault(k,[]).append(np.abs(B.lu.values-p)[ok])
    put('district',base)
    rm=A.groupby(['dist','road']).lu.median(); rc=A.groupby(['dist','road']).size()
    k2=list(zip(B.dist,B.road)); rv=rm.reindex(k2).values; rcv=rc.reindex(k2).fillna(0).values
    put('road(>=2proj)',np.where(rcv>=2,rv,base))
    RP=_H['newUnit']['roadPrem']; pr=np.array([RP.get(a+'|'+str(b),0.0) for a,b in zip(B.dist,B.road)])
    put('roadPrem(leaky)',base+pr)
    ro=rpo.reindex(k2); w=(ro['count']/(ro['count']+20)).fillna(0).values; pro=np.nan_to_num(ro['median'].values)*w
    put('roadPremOld',base+pro)
    XY=B[['x','yy']].values
    for R in [200,300,500,800]:
        L=otree.query_ball_point(XY,R); pn=np.array([np.median(ores[l])*len(l)/(len(l)+20) if len(l) else 0 for l in L])
        put(f'nearOld{R}',base+pn); E.setdefault(f'_pn{R}',[]).append(pn)
    dd5,ii5=tree.query(XY,k=5); w5=1/np.maximum(dd5,100); kw5=(A.lu.values[ii5]*w5).sum(1)/w5.sum(1)
    L3=otree.query_ball_point(XY,300); pn3=np.array([np.median(ores[l])*len(l)/(len(l)+20) if len(l) else 0 for l in L3])
    put('blend_knnw5_nearOld300',(kw5+base+pn3)/2)
    gp=np.array([gridp(a,b) for a,b in XY]); put('gridOld',base+gp); put('blend_knnw5_gridOld',(kw5+base+gp)/2)
    dd3,ii3=tree.query(XY,k=3); w3=1/np.maximum(dd3,100); kw3=(A.lu.values[ii3]*w3).sum(1)/w3.sum(1); put('blend_knnw3_gridOld',(kw3+base+gp)/2)
    NUd=_H['newUnit']['dist']; b2=np.array([np.log(NUd[x][0]) if x in NUd else np.nan for x in B.dist]); b2=np.where(np.isnan(b2),base,b2)
    put('APP_district',b2); put('APP_roadPremOld',b2+pro); put('APP_blend',(kw5+b2+gp)/2)
    An=n[n.proj.astype(str).isin(set(A.proj.astype(str)))]; rowm=An.groupby('dist').lu.median(); b3=B.dist.map(rowm).values; b3=np.where(np.isnan(b3),base,b3)
    put('rowbase_district',b3); put('rowbase_blend',(kw5+b3+gp)/2); put('rowbase_roadPremOld',b3+pro)
    for R in [300,500,800,1000,1500]:
        for K in [2,3,5]:
            L=tree.query_ball_point(B[['x','yy']].values,R)
            p=np.array([np.median(A.lu.values[l]) if len(l)>=K else b for l,b in zip(L,base)])
            put(f'ring{R}_min{K}',p)
    for K in [3,5,8,12]:
        dd,ii=tree.query(B[['x','yy']].values,k=K)
        put(f'knn{K}',np.median(A.lu.values[ii],axis=1))
        w=1/np.maximum(dd,100); put(f'knnw{K}',(A.lu.values[ii]*w).sum(1)/w.sum(1))
    dd,ii=tree.query(B[['x','yy']].values,k=3); road_or=np.where(rcv>=2,rv,base)
    for cap in [800,1500,3000]:
        far=dd[:,2]>cap; pk=np.median(A.lu.values[ii],axis=1); put(f'knn3cap{cap}',np.where(far,road_or,pk))
        w=1/np.maximum(dd,100); pw=(A.lu.values[ii]*w).sum(1)/w.sum(1); put(f'knnw3cap{cap}',np.where(far,road_or,pw))
    E.setdefault('_d3',[]).append(dd[:,2])
    # 一圈一圈：300 夠就用、不夠 500、800、1500，再不夠用行政區
    L3={R:tree.query_ball_point(B[['x','yy']].values,R) for R in [300,500,800,1500]}
    p=[]
    for i,b in enumerate(base):
        v=b
        for R in [300,500,800,1500]:
            if len(L3[R][i])>=3: v=np.median(A.lu.values[L3[R][i]]); break
        p.append(v)
    put('rings300-1500_min3',np.array(p))
[E.pop(k) for k in list(E) if k.startswith('_pn')]; d3=np.concatenate(E.pop('_d3')); print('3rd neighbor dist pct',np.percentile(d3,[25,50,75,90]).round())
out={k:(round(float(np.median(np.concatenate(v)))*100,2),round(float(np.mean(np.concatenate(v)))*100,2)) for k,v in E.items()}
for k,v in sorted(out.items(),key=lambda z:z[1][0]): print(k,v)
