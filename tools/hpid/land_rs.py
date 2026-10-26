# 土地持分（每坪建物分到幾坪土地）跟之後漲幅、起伏：同一戶賣兩次
import gzip,csv,io,re,glob,pandas as pd,numpy as np,json
CITY=dict(A="臺北市",B="臺中市",C="基隆市",D="臺南市",E="高雄市",F="新北市",G="宜蘭縣",H="桃園市",I="嘉義市",J="新竹縣",K="苗栗縣",M="南投縣",N="彰化縣",O="新竹市",P="雲林縣",Q="嘉義縣",T="屏東縣",U="花蓮縣",V="臺東縣",W="金門縣",X="澎湖縣",Z="連江縣")
rows=[];seen=set()
for f in sorted(glob.glob('/tmp/claude-0/plvr57/*.csv.gz')):
    for x in csv.DictReader(io.StringIO(gzip.open(f,'rt',encoding='utf-8').read())):
        k=x.get("編號") or ""
        if k in seen: continue
        seen.add(k); t=x["交易年月日"].strip()
        if not re.match(r"^\d{6,7}$",t) or not x["交易標的"].startswith("房地") or "住" not in (x.get("主要用途") or ""): continue
        if (x.get("備註") or "") and re.search('親友|特殊關係|急買急賣|法拍|債權|持分|預售',x["備註"]): continue
        m=re.match(r"土地\d+建物(\d+)車位(\d+)",x["交易筆棟數"] or "")
        if not m or m.group(1)!="1": continue
        ty=int(t[:-4])+1911; tm=int(t[-4:-2])
        if ty<2012 or ty>2026 or not 1<=tm<=12: continue
        try:
            price=float(x["總價元"]);area=float(x["建物移轉總面積平方公尺"] or 0); pa=float(x.get("車位移轉總面積(平方公尺)") or x.get("車位移轉總面積平方公尺") or 0); pp=float(x["車位總價元"] or 0); la=float(x["土地移轉總面積平方公尺"] or 0)
        except: continue
        b=(area-pa)/3.30579
        if b<5 or la<=0 or (x["車位類別"] and pp==0): continue
        by=x["建築完成年月"].strip(); age=ty-(int(by[:-4])+1911) if re.match(r"^\d{5,7}$",by) else np.nan
        city=CITY.get(x["縣市代碼"],x["縣市代碼"])
        rows.append((city,city+x["鄉鎮市區"],ty,(tm-1)//3+1,x["建物型態"].split("(")[0],(price-pp)/b,b,la/3.30579/(area/3.30579),age,re.sub(r"\s","",x.get("土地位置建物門牌") or "")))
d=pd.DataFrame(rows,columns='city dist y q typ unit ping lr age k'.split()); d=d[d.unit>0]; d['t']=d.y+(d.q-1)/4; d=d.sort_values('t')
g=d.groupby('k'); a=g.head(1).set_index('k'); b=g.tail(1).set_index('k'); a=a[a.index.isin(b.index)]; b=b.loc[a.index]
ok=(b.t-a.t>=3)&(abs(a.ping-b.ping)/a.ping<=0.05); a=a[ok]; b=b[ok]
H=json.load(open('/tmp/claude-0/hpid/hpid_app.json')); qi={q:i for i,q in enumerate(H['q'])}
def ix(r,y,q): I=H['idx'].get(r); k='%d/Q%d'%(y,q); return I[qi[k]] if I and k in qi else np.nan
ia=np.array([ix(r,y,q) for r,y,q in zip(a.dist,a.y,a.q)]); ib=np.array([ix(r,y,q) for r,y,q in zip(a.dist,b.y,b.q)])
O=pd.DataFrame({'city':a.city.values,'dist':a.dist.values,'typ':a.typ.values,'age':a.age.values,'ping':a.ping.values,'lr':a.lr.values,'yrs':(b.t-a.t).values,'ta':a.t.values,'res':np.log(b.unit.values/a.unit.values)-np.log(ib/ia)})
O=O[O.res.abs()<1].dropna(subset=['res']); O.to_pickle('/tmp/claude-0/hpid/land_rs.pkl'); print(len(O)); print(O.groupby('typ').lr.median())
