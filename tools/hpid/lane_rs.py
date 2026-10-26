import pandas as pd,numpy as np,json
d=pd.read_pickle('/tmp/claude-0/door/res_geo_all.pkl'); d=d[(d.unit>0)&(d.y<=2026)&d.ok].copy()
d['t']=d.y+(d.q-1)/4; d['k']=d.addr.str.replace(r'\s','',regex=True); d=d.sort_values('t')
g=d.groupby('k'); a=g.head(1).set_index('k'); b=g.tail(1).set_index('k'); a=a[a.index.isin(b.index)]; b=b.loc[a.index]
H=json.load(open('/tmp/claude-0/hpid/hpid_app.json')); qi={q:i for i,q in enumerate(H['q'])}
ok=(b.t-a.t>=3)&(abs(a.ping-b.ping)/a.ping<=0.05); a=a[ok]; b=b[ok]
def ix(r,y,q): I=H['idx'].get(r); k='%d/Q%d'%(y,q); return I[qi[k]] if I and k in qi else np.nan
ia=np.array([ix(r,y,q) for r,y,q in zip(a.dist,a.y,a.q)]); ib=np.array([ix(r,y,q) for r,y,q in zip(a.dist,b.y,b.q)])
O=pd.DataFrame({'typ':a.typ,'age':a.age,'ping':a.ping,'yrs':(b.t-a.t).values,'res':np.log(b.unit.values/a.unit.values)-np.log(ib/ia),'lane':a.lane,'alley':a.alley,'ta':a.t,'city':a.city})
O=O[O.res.abs()<1].dropna(subset=['res']); RS=json.load(open('/tmp/claude-0/hpid/rs_coef.json'))
ab=pd.cut(O.age,[-1,2,5,10,15,20,25,30,35,40,200]).astype(str); pb=pd.cut(O.ping,[0,15,25,35,50,1e4]).astype(str)
O['e']=O.res-(ab.map(RS['age']).fillna(0)+pb.map(RS['ping']).fillna(0)+O.typ.map(RS['typ']).fillna(0))*O.yrs
O['rd']=np.where(O.alley>0,'弄',np.where(O.lane>0,'巷','路街'))
for tp,D in [('all',O),('公寓華廈',O[O.typ.isin(['公寓','華廈'])]),('大樓',O[O.typ=='住宅大樓']),('透天',O[O.typ=='透天厝'])]:
    print(tp,len(D))
    for r,G in D.groupby('rd'):
        Z=np.c_[G.yrs,np.ones(len(G))]; bb=np.linalg.lstsq(Z,G.e,rcond=None)[0]
        u=G.e-Z@bb; e2=np.minimum(u**2,np.quantile(u**2,.99)); s=np.linalg.lstsq(Z,e2,rcond=None)[0][0]
        print('  ',r,len(G),'drift %.3f%%/yr'%(100*bb[0]),'idio/yr %.4f'%np.sqrt(max(s,0)))
O.to_pickle('/tmp/claude-0/door/lane_rs.pkl')
