import pandas as pd,numpy as np,json
O=pd.read_pickle('/tmp/claude-0/door/loc_rs.pkl'); print(len(O))
RS=json.load(open('/tmp/claude-0/hpid/rs_coef.json'))
# 已經有的屋齡/坪數/類型調整先扣掉
def tb(D,col,edges):
    ks=list(D.keys()); return None
ab=pd.cut(O.age,[-1,2,5,10,15,20,25,30,35,40,200]).astype(str); pb=pd.cut(O.ping,[0,15,25,35,50,1e4]).astype(str)
tm={'大樓':'住宅大樓','透天':'透天厝'}; inv={v:k for k,v in tm.items()}
adj=ab.map(RS['age']).fillna(0)+pb.map(RS['ping']).fillna(0)+O.typ.map(RS['typ']).fillna(0)
O['e']=O.res-adj*O.yrs; O['ryr']=O.e/O.yrs
O['lb']=pd.cut(O['loc'],[-1,-0.2,-0.1,-0.03,0.03,0.1,0.2,1])
t=O.groupby('lb').agg(n=('ryr','size'),drift=('ryr','mean'),se=('ryr',lambda s:s.std()/np.sqrt(len(s))))
t[['drift','se']]*=100; print(t.round(3))
# 斜率法：res = yrs*(a + b*loc + c*own) + k
Z=np.c_[O.yrs,O.yrs*O['loc'],O.yrs*O.own,np.ones(len(O))]; b=np.linalg.lstsq(Z,O.e,rcond=None)[0]; print('slope loc %.4f own %.4f /yr per 1.0 log'%(b[1],b[2]))
Z=np.c_[O.yrs,O.yrs*O['loc'],np.ones(len(O))]; b2=np.linalg.lstsq(Z,O.e,rcond=None)[0]; print('loc only %.4f'%b2[1])
# 起伏
pred=Z@b2; O['u']=O.e-pred
def s2(D): Z=np.c_[D.yrs,np.ones(len(D))]; e2=np.minimum(D.u**2,np.quantile(O.u**2,.99)); return np.linalg.lstsq(Z,e2,rcond=None)[0][0]
s0=s2(O); print({str(g):round(float(np.sqrt(max(s2(D),1e-9)/s0)),2) for g,D in O.groupby('lb')})
# 時段外
for cut,tst in [(2019,2017),(2021,2019),(2023,2021)]:
    A=O[O.ta+O.yrs<cut]; B=O[O.ta>=tst]
    Z=np.c_[A.yrs,A.yrs*A['loc'],np.ones(len(A))]; bb=np.linalg.lstsq(Z,A.e,rcond=None)[0]
    for sh in (0,0.5,1):
        p=sh*bb[1]*B['loc']*B.yrs; r=B.e-p; print(cut,len(A),len(B),'coef %.4f sh %.1f err %.4f'%(bb[1],sh,np.median(abs(r-r.mean()))))
