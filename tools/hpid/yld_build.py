import pandas as pd,numpy as np,json,sys
J=sys.argv[1]
R=pd.read_pickle('/tmp/claude-0/rent/rent.pkl'); R=R[R.y>=2024]
S=pd.read_pickle('/tmp/claude-0/hpid/res.pkl'); S=S[(S.y>=2024)&(S.unit>0)]
for d in (R,S): d['ab']=pd.cut(d.age,[-1,5,15,30,200],labels=['0-5','5-15','15-30','30+']).astype(str)
def tab(key,mn):
    a=R.groupby(key).rpp.agg(['median','size']); b=S.groupby(key).unit.agg(['median','size']); j=a.join(b,lsuffix='_r',rsuffix='_s').dropna(); j=j[(j.size_r>=mn)&(j.size_s>=mn)]
    return {'|'.join(map(str,k)):[round(float(v.median_r*12/v.median_s),4),int(v.size_r),int(v.size_s)] for k,v in j.iterrows()}
H=json.load(open(J))
H['yld']={'cell':tab(['dist','typ','ab'],20),'dt':tab(['dist','typ'],20),'ct':tab(['city','typ'],20),
 'src':'實價登錄 2024 年起：整層（戶）出租的住家每坪月租中位數 × 12 ÷ 同區、同房型、同屋齡段的每坪成交價中位數（毛租金報酬率，還沒扣稅費）',
 'check':'把租屋和成交各隨機分一半驗證：用行政區＋房型＋屋齡猜另一半，誤差中位數 5.2%；只用縣市＋房型 12.7%；全部用 2% 是 20.2%'}
json.dump(H,open(J,'w'),ensure_ascii=False,separators=(',',':'))
print({k:len(v) for k,v in H['yld'].items() if isinstance(v,dict)})
