import gzip, csv, io, re, glob, sys, pandas as pd, numpy as np
CITY = dict(A="臺北市",B="臺中市",C="基隆市",D="臺南市",E="高雄市",F="新北市",G="宜蘭縣",H="桃園市",I="嘉義市",J="新竹縣",K="苗栗縣",M="南投縣",N="彰化縣",O="新竹市",P="雲林縣",Q="嘉義縣",T="屏東縣",U="花蓮縣",V="臺東縣",W="金門縣",X="澎湖縣",Z="連江縣")
CN = {c:i for i,c in enumerate("〇一二三四五六七八九")}
def cnum(s):
    s=str(s).replace("層","").strip()
    if not s: return None
    if s.isdigit(): return int(s)
    t=0;cur=0
    for ch in s:
        if ch=="十": cur=(cur or 1)*10; t+=cur; cur=0
        elif ch=="百": cur=(cur or 1)*100; t+=cur; cur=0
        elif ch in CN: cur=CN[ch]
        else: return None
    return t+cur
BAD = ["親友","特殊關係","毛胚","未登記建物","預售當時價格","瑕疵","凶宅","急買急賣","債權債務","法拍","受債權","政府機關","畸零","含增建","陽台外推","頂樓加蓋","夾層"]
rows=[]; seen=set()
for f in sorted(glob.glob('/tmp/claude-0/plvr57/*.csv.gz')):
    rd=csv.DictReader(io.StringIO(gzip.open(f,'rt',encoding='utf-8').read()))
    for x in rd:
        k=x.get("編號") or ""
        if k:
            if k in seen: continue
            seen.add(k)
        if not x["交易標的"].startswith("房地"): continue
        if x.get("主要用途")!="住家用": continue
        m=re.match(r"土地\d+建物(\d+)車位(\d+)",x["交易筆棟數"] or "")
        if not m or m.group(1)!="1" or int(m.group(2))>1: continue
        note=x.get("備註") or ""
        if any(b in note for b in BAD): continue
        typ=x["建物型態"].split("(")[0]
        if typ not in ("住宅大樓","華廈","公寓","透天厝","套房"): continue
        t=x["交易年月日"].strip()
        if not re.match(r"^\d{6,7}$",t): continue
        ty=int(t[:-4])+1911; tm=int(t[-4:-2])
        if ty<2012 or tm<1 or tm>12: continue
        by=x["建築完成年月"].strip()
        if not re.match(r"^\d{5,7}$",by): continue
        byear=int(by[:-4])+1911 if len(by)>=6 else None
        if not byear or byear<1900: continue
        age=ty+(tm-0.5)/12-byear-0.5
        if age<-1 or age>70: continue
        try:
            area=float(x["建物移轉總面積平方公尺"] or 0); price=float(x["總價元"] or 0)
            pa=float(x.get("車位移轉總面積(平方公尺)") or x.get("車位移轉總面積平方公尺") or 0); pp=float(x["車位總價元"] or 0)
        except ValueError: continue
        hasp=bool(x["車位類別"])
        if hasp and pp==0: continue   # 車位價格含在總價裡、拆不開：不用
        barea=area-pa
        if barea<=10 or price<=0: continue
        unit=(price-pp)/(barea/3.30579)
        if unit<20000 or unit>4e6: continue
        tot=cnum(x["總樓層數"]); fl=None
        mm=re.match(r"^([一二三四五六七八九十]+)層$",x["移轉層次"].strip())
        if mm: fl=cnum(mm.group(1))
        if typ!="透天厝" and (not tot or not fl or fl>tot): continue
        rows.append((CITY.get(x["縣市代碼"],x["縣市代碼"]), x["鄉鎮市區"], ty, (tm-1)//3+1, typ, age, barea/3.30579, unit, fl or 1, tot or 1, x.get("電梯")=="有", x.get("有無管理組織")=="有", x["土地位置建物門牌"].strip()))
    print(f.split('/')[-1], len(rows), flush=True, file=sys.stderr)
df=pd.DataFrame(rows,columns="city dist y q typ age ping unit fl tot elev mgmt addr".split())
df["dist"]=df.city+df.dist
df.to_pickle('/tmp/claude-0/hpid/res.pkl'); print(df.shape); print(df.groupby('y').size())
