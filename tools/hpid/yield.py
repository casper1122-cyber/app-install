# 租金報酬率（毛）：同區、同房型、同屋齡段的「每坪月租中位數 × 12 ÷ 每坪成交價中位數」
import pandas as pd, numpy as np, glob, gzip, csv, io, re, json
CITY = dict(A="臺北市",B="臺中市",C="基隆市",D="臺南市",E="高雄市",F="新北市",G="宜蘭縣",H="桃園市",I="嘉義市",J="新竹縣",K="苗栗縣",M="南投縣",N="彰化縣",O="新竹市",P="雲林縣",Q="嘉義縣",T="屏東縣",U="花蓮縣",V="臺東縣",W="金門縣",X="澎湖縣",Z="連江縣")
TYP={'住宅大樓':'住宅大樓','華廈':'華廈','公寓':'公寓','透天厝':'透天厝','套房':'套房'}
rows=[]; seen=set()
for f in sorted(glob.glob('/tmp/claude-0/rent/*.csv.gz')):
    for x in csv.DictReader(io.StringIO(gzip.open(f,'rt',encoding='utf-8').read())):
        k=x.get('編號') or ''
        if k in seen: continue
        seen.add(k)
        if '住' not in (x.get('主要用途') or ''): continue
        if (x.get('出租型態') or '') and '整' not in x['出租型態']: continue   # 只看整層（戶）出租，分租、雅房另外看
        t=(x.get('租賃年月日') or '').strip()
        if not re.match(r'^\d{6,7}$',t): continue
        ty=int(t[:-4])+1911
        try: rent=float(x['總額元'] or 0); a=float(x['建物總面積平方公尺'] or 0); pr=float(x.get('車位總額元') or 0); pa=float(x.get('車位面積平方公尺') or 0)
        except ValueError: continue
        b=(a-pa)/3.30579
        if rent<=0 or b<5: continue
        bt=x['建物型態'].split('(')[0]; bt=TYP.get(bt)
        if not bt: continue
        by=(x.get('建築完成年月') or '').strip(); age=np.nan
        if re.match(r'^\d{5,7}$',by): age=ty-(int(by[:-4])+1911)
        note=x.get('備註') or ''
        if re.search('親友|特殊關係|員工',note): continue
        rows.append((CITY.get(x['縣市代碼'],x['縣市代碼']),CITY.get(x['縣市代碼'],'')+x['鄉鎮市區'],ty,bt,(rent-pr)/b,b,age,1 if (x.get('有無附傢俱') or '')=='有' else 0))
R=pd.DataFrame(rows,columns='city dist y typ rpp ping age furn'.split())
R=R[(R.rpp>100)&(R.rpp<20000)]
print('rentals',len(R),R.y.value_counts().sort_index().to_dict())
R.to_pickle('/tmp/claude-0/rent/rent.pkl')
