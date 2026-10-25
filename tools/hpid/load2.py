# 店面、辦公、土地的成交（給商用不動產和土地的指數用）
import gzip, csv, io, re, glob, sys, pandas as pd, numpy as np
CITY = dict(A="臺北市",B="臺中市",C="基隆市",D="臺南市",E="高雄市",F="新北市",G="宜蘭縣",H="桃園市",I="嘉義市",J="新竹縣",K="苗栗縣",M="南投縣",N="彰化縣",O="新竹市",P="雲林縣",Q="嘉義縣",T="屏東縣",U="花蓮縣",V="臺東縣",W="金門縣",X="澎湖縣",Z="連江縣")
BAD = ["親友","特殊關係","毛胚","預售當時價格","瑕疵","凶宅","急買急賣","債權債務","法拍","受債權","政府機關","畸零","持分","共有","道路用地","公共設施保留地","地上權"]
rows=[]; seen=set()
for f in sorted(glob.glob('/tmp/claude-0/plvr57/*.csv.gz')):
    for x in csv.DictReader(io.StringIO(gzip.open(f,'rt',encoding='utf-8').read())):
        k=x.get("編號") or ""
        if k:
            if k in seen: continue
            seen.add(k)
        note=x.get("備註") or ""
        if any(b in note for b in BAD): continue
        t=x["交易年月日"].strip()
        if not re.match(r"^\d{6,7}$",t): continue
        ty=int(t[:-4])+1911; tm=int(t[-4:-2])
        if ty<2012 or ty>2026 or not 1<=tm<=12: continue
        try: price=float(x["總價元"] or 0)
        except: continue
        if price<=0: continue
        city=CITY.get(x["縣市代碼"],x["縣市代碼"]); dist=city+x["鄉鎮市區"]
        if x["交易標的"]=="土地":
            try: la=float(x["土地移轉總面積平方公尺"] or 0)/3.30579
            except: continue
            zone=x.get("都市土地使用分區") or ""
            if la<5 or la>3000: continue
            u=price/la
            if u<5000 or u>2e7: continue
            rows.append(("land",city,dist,ty,(tm-1)//3+1,zone[:2],u,la,0,0,0))
            continue
        if not x["交易標的"].startswith("房地"): continue
        use=x.get("主要用途") or ""
        kind="shop" if use=="商業用" else "office" if use=="辦公用" else "factory" if use=="工業用" else None
        if not kind: continue
        m=re.match(r"土地\d+建物(\d+)車位(\d+)",x["交易筆棟數"] or "")
        if not m or m.group(1)!="1": continue
        try:
            area=float(x["建物移轉總面積平方公尺"] or 0); pa=float(x.get("車位移轉總面積(平方公尺)") or x.get("車位移轉總面積平方公尺") or 0); pp=float(x["車位總價元"] or 0)
        except: continue
        b=(area-pa)/3.30579
        if b<5 or (x["車位類別"] and pp==0): continue
        u=(price-pp)/b
        if u<20000 or u>1e7: continue
        fl=x["移轉層次"]; f1=1 if re.match(r"^一層",fl) else 0
        by=x["建築完成年月"].strip(); age=np.nan
        if re.match(r"^\d{5,7}$",by): age=ty-(int(by[:-4])+1911)
        rows.append((kind,city,dist,ty,(tm-1)//3+1,x["建物型態"].split("(")[0],u,b,f1,age,1 if "騎樓" in fl else 0))
df=pd.DataFrame(rows,columns="kind city dist y q typ unit ping f1 age arcade".split())
df.to_pickle('/tmp/claude-0/hpid/res2.pkl'); print(df.groupby(['kind']).size()); print(df[df.kind=='land'].groupby('typ').size().sort_values().tail(8))
