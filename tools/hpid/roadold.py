# 全國：路段溢價只用舊房子（屋齡 5 年以上）算，驗證能不能猜準新建案（新建案本身不會用到）
import pandas as pd, numpy as np, re, json
d=pd.read_pickle('/tmp/claude-0/hpid/res_road.pkl'); d=d[d.unit>0].copy(); d['lu']=np.log(d.unit)
CN='零一二三四五六七八九十'
d['road']=d.road.map(lambda r: re.sub(r'(\d+)段',lambda m:(CN[int(m.group(1))] if int(m.group(1))<=10 else m.group(1))+'段',r) if isinstance(r,str) else r)
H=json.load(open('/tmp/claude-0/hpid/hpid_app.json')); qi={q:i for i,q in enumerate(H['q'])}
fw=str.maketrans('０１２３４５６７８９','0123456789')
n=d[(d.typ.isin(['住宅大樓','華廈']))&(d.age<=3)&(d.y>=2016)&(d.fl>=2)&d.road.notna()].copy()
def adj(ds,y,q):
    s=H['idx'].get(ds) or H['idx'].get(ds[:3]); i=qi.get('%d/Q%d'%(y,q)); return s[-1]/s[i] if s and i is not None and s[i] else np.nan
n['f']=[adj(a,b,c) for a,b,c in zip(n.dist,n.y,n.q)]; n=n[n.f.notna()]; n['lu']=np.log(n.unit*n.f)
n['by']=(n.y+(n.q-1)/4-n.age).round()
n['proj']=n.dist+'|'+n.road+'|'+n.by.astype(int).astype(str)   # 同區同路同完工年＝一個建案（保守：寧可併太多）
P=n.groupby('proj').agg(lu=('lu','median'),c=('lu','size'),dist=('dist','first'),road=('road','first'),city=('city','first')).reset_index()
P=P[P.c>=5]; print('projects',len(P))
o=d[(d.y>=2019)&(d.age>5)&(d.typ.isin(['住宅大樓','華廈','公寓','套房']))&d.road.notna()].copy()
o['ab']=pd.cut(o.age,[5,10,20,30,40,200]).astype(str)
o['res']=o.lu-o.groupby(['dist','y','typ','ab']).lu.transform('median'); o=o[o.groupby(['dist','y','typ','ab']).lu.transform('size')>=10]
rp=o.groupby(['dist','road']).res.agg(['median','count'])
rng=np.random.default_rng(5); E={'district':[],'roadPremOld':[]}; EC={}
for rep in range(5):
    t=rng.random(len(P))<0.5; A=P[~t]; B=P[t]
    base=B.dist.map(A.groupby('dist').lu.median()).values; ok=~np.isnan(base)
    r=rp.reindex(list(zip(B.dist,B.road))); w=(r['count']/(r['count']+20)).fillna(0).values; pr=np.nan_to_num(r['median'].values)*w
    for k,p in [('district',base),('roadPremOld',base+pr)]:
        e=np.abs(B.lu.values-p); E[k].append(e[ok])
        for c in B.city.unique():
            mm=ok&(B.city.values==c); EC.setdefault((c,k),[]).append(e[mm])
print({k:(round(float(np.median(np.concatenate(v)))*100,2),round(float(np.mean(np.concatenate(v)))*100,2)) for k,v in E.items()})
for c in sorted(P.city.unique()):
    a=np.concatenate(EC[(c,'district')]); b=np.concatenate(EC[(c,'roadPremOld')])
    print(c,len(a)//5,round(np.median(a)*100,1),round(np.median(b)*100,1))
pd.to_pickle(rp,'/tmp/claude-0/hpid/roadprem_old.pkl')

# 結果：路段溢價只用在驗證有變準的縣市（newunit3.py 存檔後再照這裡的城市篩選）
