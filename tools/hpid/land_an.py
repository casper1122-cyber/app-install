import pandas as pd,numpy as np,json
O=pd.read_pickle('land_rs.pkl'); O=O[O.typ.isin(['住宅大樓','公寓','華廈','套房','透天厝'])&O.age.notna()].copy()
RS=json.load(open('rs_coef.json'))
ab=pd.cut(O.age,[-1,2,5,10,15,20,25,30,35,40,200]).astype(str); pb=pd.cut(O.ping,[0,15,25,35,50,1e4]).astype(str)
O['e']=O.res-(ab.map(RS['age']).fillna(0)+pb.map(RS['ping']).fillna(0)+O.typ.map(RS['typ']).fillna(0))*O.yrs
O['ab6']=pd.cut(O.age,[-1,5,10,20,30,40,200]).astype(str)
m=O.groupby(['dist','typ','ab6']).lr.transform('median'); n=O.groupby(['dist','typ','ab6']).lr.transform('size')
O=O[n>=10]; O['rr']=np.log(O.lr/m[n>=10]); O=O[np.isfinite(O.rr)]
O['b']=pd.cut(O.rr,[-9,np.log(.5),np.log(.75),np.log(.9),np.log(1.1),np.log(1.4),np.log(2),9])
def slope(G): Z=np.c_[G.yrs,np.ones(len(G))]; return np.linalg.lstsq(Z,G.e,rcond=None)[0][0]
base=slope(O)
for tp,D in [('all',O),('公寓華廈透天',O[O.typ.isin(['公寓','華廈','透天厝'])]),('大樓套房',O[O.typ.isin(['住宅大樓','套房'])])]:
    print(tp,len(D),{str(k):(len(G),round(100*(slope(G)-slope(D)),2)) for k,G in D.groupby('b')})
Z=np.c_[O.yrs,O.yrs*O.rr,np.ones(len(O))]; bb=np.linalg.lstsq(Z,O.e,rcond=None)[0]; print('slope per log ratio %.4f'%bb[1])
u=O.e-Z@bb; O['u']=u
def s2(G): Z=np.c_[G.yrs,np.ones(len(G))]; e2=np.minimum(G.u**2,np.quantile(O.u**2,.99)); return np.linalg.lstsq(Z,e2,rcond=None)[0][0]
s0=s2(O); print('idio',{str(k):round(float(np.sqrt(max(s2(G),1e-9)/s0)),2) for k,G in O.groupby('b')})
for cut,tst in [(2019,2017),(2021,2019),(2023,2021)]:
    A=O[O.ta+O.yrs<cut]; B=O[O.ta>=tst]; Z=np.c_[A.yrs,A.yrs*A.rr,np.ones(len(A))]; c=np.linalg.lstsq(Z,A.e,rcond=None)[0]
    print(cut,len(A),len(B),'coef %.4f'%c[1],' '.join('sh%.1f:%.4f'%(s,np.median(abs((B.e-s*c[1]*B.rr*B.yrs)-(B.e-s*c[1]*B.rr*B.yrs).mean()))) for s in (0,.5,1)))
