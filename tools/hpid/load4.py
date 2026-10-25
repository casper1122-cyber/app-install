# 全部成交（含備註），給：急賣折價、店面辦公土地的重複交易
import gzip, csv, io, re, glob, pandas as pd, numpy as np
CITY = dict(A="臺北市",B="臺中市",C="基隆市",D="臺南市",E="高雄市",F="新北市",G="宜蘭縣",H="桃園市",I="嘉義市",J="新竹縣",K="苗栗縣",M="南投縣",N="彰化縣",O="新竹市",P="雲林縣",Q="嘉義縣",T="屏東縣",U="花蓮縣",V="臺東縣",W="金門縣",X="澎湖縣",Z="連江縣")
FLAG = ["急買急賣","親友","特殊關係","法拍","債權債務","瑕疵","凶宅","持分","毛胚","預售"]
rows=[]; seen=set()
for f in sorted(glob.glob('/tmp/claude-0/plvr57/*.csv.gz')):
    for x in csv.DictReader(io.StringIO(gzip.open(f,'rt',encoding='utf-8').read())):
        k=x.get("編號") or ""
        if k:
            if k in seen: continue
            seen.add(k)
        t=x["交易年月日"].strip()
        if not re.match(r"^\d{6,7}$",t): continue
        ty=int(t[:-4])+1911; tm=int(t[-4:-2])
        if ty<2012 or ty>2026 or not 1<=tm<=12: continue
        try: price=float(x["總價元"] or 0)
        except: continue
        if price<=0: continue
        note=x.get("備註") or ""; fl="|".join(b for b in FLAG if b in note)
        city=CITY.get(x["縣市代碼"],x["縣市代碼"]); dist=city+x["鄉鎮市區"]; loc=re.sub(r"\s","",x.get("土地位置建物門牌") or "")
        tgt=x["交易標的"]
        if tgt=="土地":
            try: la=float(x["土地移轉總面積平方公尺"] or 0)/3.30579
            except: continue
            if la<5 or la>3000: continue
            rows.append(("land",city,dist,ty,(tm-1)//3+1,(x.get("都市土地使用分區") or "")[:2],price/la,la,loc,fl,np.nan,note[:120],"","")); continue
        if not tgt.startswith("房地"): continue
        use=x.get("主要用途") or ""; bt=x["建物型態"].split("(")[0]
        kind="shop" if use=="商業用" else "office" if use=="辦公用" else "factory" if use=="工業用" else "res" if "住" in use else None
        if not kind: continue
        m=re.match(r"土地\d+建物(\d+)車位(\d+)",x["交易筆棟數"] or "")
        if not m or m.group(1)!="1": continue
        try:
            area=float(x["建物移轉總面積平方公尺"] or 0); pa=float(x.get("車位移轉總面積(平方公尺)") or x.get("車位移轉總面積平方公尺") or 0); pp=float(x["車位總價元"] or 0)
        except: continue
        b=(area-pa)/3.30579
        if b<5 or (x["車位類別"] and pp==0): continue
        by=x["建築完成年月"].strip(); age=np.nan
        if re.match(r"^\d{5,7}$",by): age=ty-(int(by[:-4])+1911)
        rows.append((kind,city,dist,ty,(tm-1)//3+1,bt,(price-pp)/b,b,loc,fl,age,note[:120],x.get("移轉層次") or "",x.get("總樓層數") or ""))
df=pd.DataFrame(rows,columns="kind city dist y q typ unit ping loc flag age note flr tot".split())
df.to_pickle('/tmp/claude-0/hpid/res4.pkl'); print(df.groupby('kind').size()); print(df.flag.str.contains('急買急賣').sum(),'急賣')
