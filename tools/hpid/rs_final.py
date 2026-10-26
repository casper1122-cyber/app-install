exec(open('/tmp/claude-0/hpid/rs_time2.py').read().split("for cut,tst")[0])
import numpy as np,json
cf=fit(O,'slope'); SH=0.5
def rel(prefix,col):
    ks=[c for c in cf.index if c.startswith(prefix)]; w=O[col].value_counts(normalize=True)
    v={k[len(prefix):]:cf[k] for k in ks}; m=sum(v[g]*w.get(g,0) for g in v); return {g:round(SH*(v[g]-m),4) for g in v}
age=rel('a_','ab'); ping=rel('p_','pb'); typ=rel('t_','typ')
el=round(SH*cf['elev']*(1),4); mg=round(SH*cf['mgmt'],4); top=round(SH*cf['top'],4)
print('age',age);print('ping',ping);print('typ',typ);print('elev',el,'mgmt',mg,'top',top)
# 個別起伏倍數（時段外也看看穩不穩）
O['e']=O.res-pred(cf,O)
def slope(D):
    Z=np.c_[D.yrs,np.ones(len(D))]; e2=np.minimum(D.e**2,np.quantile(O.e**2,.99)); return np.linalg.lstsq(Z,e2,rcond=None)[0]
s0=slope(O)[0]; O['a4']=pd.cut(O.age,[-1,10,25,35,200]).astype(str)
for per,D0 in [('all',O),('early',O[O.tb<2021]),('late',O[O.ta>=2019])]:
    b0=slope(D0)[0]; print(per,{g:round(float(np.sqrt(max(slope(D)[0],1e-9)/b0)),2) for g,D in D0.groupby('a4')},{('mg',g):round(float(np.sqrt(max(slope(D)[0],1e-9)/b0)),2) for g,D in D0.groupby('mgmt')})
json.dump({'age':age,'ping':ping,'typ':typ,'elev':el,'mgmt':mg,'top':top},open('/tmp/claude-0/hpid/rs_coef.json','w'),ensure_ascii=False)
