# 地點資料（殯葬、市場、加油站、焚化廠、寺廟、學校、公園）→ TWD97 TM2 座標；有經緯度的直接換，只有地址的對門牌
import gzip,io,json,re,math,pandas as pd,numpy as np
R='/tmp/claude-0/poi/raw/'
def rd(n): 
    b=gzip.decompress(open(R+n+'.gz','rb').read())
    for e in ('utf-8-sig','cp950','big5'):
        try: return b.decode(e)
        except: pass
def tm2(lat,lng):
    a=6378137;f=1/298.257222101;e2=f*(2-f);k0=0.9999;ep2=e2/(1-e2);p=math.radians(lat);L=math.radians(lng-121)
    N=a/math.sqrt(1-e2*math.sin(p)**2);T=math.tan(p)**2;C=ep2*math.cos(p)**2;A=L*math.cos(p)
    M=a*((1-e2/4-3*e2*e2/64-5*e2**3/256)*p-(3*e2/8+3*e2*e2/32+45*e2**3/1024)*math.sin(2*p)+(15*e2*e2/256+45*e2**3/1024)*math.sin(4*p)-(35*e2**3/3072)*math.sin(6*p))
    x=k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120)+250000
    y=k0*(M+N*math.tan(p)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720)); return x,y
fw=str.maketrans('０１２３４５６７８９－','0123456789-'); CN='零一二三四五六七八九十'
def cnum(s):   # 四○八 → 408
    m={'○':'0','〇':'0','零':'0','一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9'}
    def rep(mm):
        t=mm.group(1)
        if '十' in t:
            a,b=t.split('十',1); return str((int(m.get(a,'1')) if a else 1)*10+(int(m.get(b,'0')) if b else 0))
        return ''.join(m.get(c,c) for c in t)
    return re.sub(r'([○〇零一二三四五六七八九十]+)(?=[巷弄號之])',rep,s)
def nroad(r): return re.sub(r'(\d+)段',lambda m:(CN[int(m.group(1))] if int(m.group(1))<=10 else m.group(1))+'段',r)
rows=[]
def add(cat,city,name,x=None,y=None,addr=None,dist=None,src=''): rows.append(dict(cat=cat,city=(city or '').replace('台','臺'),name=name,x=x,y=y,addr=addr,dist=dist,src=src))
# 殯葬（北北基有經緯度）
d=pd.read_csv(io.StringIO(rd('poi_funeral2')))
for r in d.itertuples():
    cat={'公墓':'cemetery','骨灰(骸)存放設施':'ossuary','火化場':'crem','殯儀館':'funeral'}.get(r.類別,'cemetery')
    if pd.notna(r.緯度): x,y=tm2(r.緯度,r.經度); add(cat,r.縣市,r.名稱,x,y,src='內政部殯葬設施（北北基）')
    else: add(cat,r.縣市,r.名稱,addr=str(r.地址),dist=str(r.縣市)+str(r.鄉鎮市區),src='內政部殯葬設施（北北基）')
d=pd.read_csv(io.StringIO(rd('poi_funeral')),sep='\t')
for r in d.itertuples():
    c=str(r.管轄所屬縣市).replace('台','臺')
    if c in ('臺北市','新北市','基隆市'): continue
    cat={'公墓':'cemetery','骨灰(骸)存放設施':'ossuary','火化場':'crem','殯儀館':'funeral'}.get(r.類別,'cemetery')
    add(cat,c,r.名稱,addr=str(r.地址) if pd.notna(r.地址) else None,src='內政部殯葬設施（全國）')
d=pd.read_csv(io.StringIO(rd('poi_tpe_funeral')))
for r in d.itertuples(): x,y=tm2(r.latitude,r.longitude); add('funeral' if '館' in r.name else 'ossuary','臺北市',r.name,x,y,src='臺北市殯葬管理處')
# 市場
d=pd.read_csv(io.StringIO(rd('poi_market_all')))
for r in d.itertuples(): add('market',r.縣市,r.市集名稱,addr=str(r.市集地址),src='經濟部零售市場基本資料')
for k,f1,f2 in (('poi_tnn_market','StreetDoorPlate','AreaCode'),('poi_tnn_market2','地點','區域')):
    for r in json.loads(rd(k))['data']: add('market','臺南市',r.get('市集名稱') or r.get('市場名稱'),addr=r[f1],dist='AC'+str(r[f2]),src='臺南市市場名冊')
# 加油站（中油，經緯度）
for r in json.loads(rd('poi_cpc_gas')):
    if r.get('緯度') and str(r.get('營業中'))=='1': x,y=tm2(float(r['緯度']),float(r['經度'])); add('gas',r['縣市'],r['站名'],x,y,src='台灣中油加油站')
# 焚化廠
d=pd.read_csv(io.StringIO(rd('poi_tpe_incin')))
for r in d.itertuples(): x,y=tm2(r.緯度,r.經度); add('incin','臺北市',r.名稱,x,y,src='臺北市環保局')
for k,col,nm in (('poi_ntpc_incin','address','chinese_name'),('poi_khh_incin','住址','名稱')):
    d=pd.read_csv(io.StringIO(rd(k)))
    for r in d.to_dict('records'): add('incin',r[col][:3],r[nm],addr=r[col],src=k)
# 寺廟
d=pd.read_csv(io.StringIO(rd('poi_tyn_temple')))
for r in d.itertuples(): add('temple','桃園市',r.寺廟名稱,addr='桃園市'+str(r.住址),src='桃園市寺廟名冊')
# 學校（臺北）
d=pd.read_csv(io.StringIO(rd('poi_tpe_school')))
for r in d.itertuples(): add('school_'+{'國小':'e','國中':'j'}.get(r.school,'h'),'臺北市',r.schoolname,addr=str(r.address),src='臺北市各級學校分布')
# 公園（臺北無障礙出入口 → 每個公園取出入口平均）
d=pd.read_csv(io.StringIO(rd('poi_tpe_park_gate')))
for (ds,nm),g in d.groupby(['行政區','公園名稱']): add('park','臺北市',nm,float(g.TW97座標X.mean()),float(g.TW97座標Y.mean()),src='臺北市公園無障礙出入口（公園中心）')
P=pd.DataFrame(rows)
# ---- 對門牌 ----
G=pd.read_pickle('/tmp/claude-0/door/doors_all.pkl'); RG=pd.read_pickle('/tmp/claude-0/door/res_geo_all.pkl')
d2ac=RG.dropna(subset=['ac']).groupby('dist').ac.agg(lambda s:s.mode().iloc[0]).to_dict(); ac2d={v:k for k,v in d2ac.items()}
idx={}
for (ac,r,l,al),g in G.groupby(['ac','road','lane','alley']): idx[(ac,r,l,al)]=(g.n.values.astype(int),g.x.values,g.y.values)
roadac=G.groupby(['city','road']).ac.agg(lambda s:set(s)).to_dict()
DN=sorted(set(d2ac),key=len,reverse=True)
ACXY={k:(v.gx.median(),v.gy.median()) for k,v in RG.dropna(subset=['ac','gx']).groupby('ac')}
def geo(city,addr,dist):
    if not addr or addr=='nan': return None
    a=cnum(str(addr).translate(fw).replace('台','臺')); a=re.sub(r'^\d{3,6}','',a)
    ac=None
    if not isinstance(dist,str) or dist.startswith('AC'): dist=None
    for dn in DN:
        if dn in a[:10] or (dist and dist==dn): ac=ac or d2ac[dn]; a=a.split(dn[3:],1)[-1] if dn[3:] in a[:10] else a; break
    a=re.sub('^'+(city or '')+r'?','',a); a=re.sub(r'^\S{1,4}?[里村](?=\S)','',a) if re.match(r'^\S{1,4}?[里村]\d*鄰?\S*?(路|街|大道)',a) else a
    a=re.sub(r'^\d+鄰','',a)
    m=re.match(r'^(.+?(?:路|街|大道)(?:[一二三四五六七八九十\d]+段)?)(?:(\d+)巷)?(?:(\d+)弄)?(\d+)(?:之\d+)?號',a)
    if not m: return None
    road=nroad(m.group(1)); 
    if ac is None:
        acs=roadac.get((city,road)); 
        if acs and len(acs)==1: ac=next(iter(acs))
    if ac is None: return None
    l=int(m.group(2) or 0); al=int(m.group(3) or 0); n=int(m.group(4))
    t=idx.get((ac,road,l,al)) or idx.get((ac,road,l,0)) or idx.get((ac,road,0,0))
    if t is None: return None
    j=np.argmin(np.abs(t[0]-n)); ne=abs(int(t[0][j])-n)
    if ne>60: return None
    c0=ACXY.get(ac)
    if c0 is not None and math.hypot(t[1][j]-c0[0],t[2][j]-c0[1])>15000: return None   # 離這個區的中心太遠：區對錯了
    return t[1][j],t[2][j],ne
X=[];Y=[];E=[]
for r in P.itertuples():
    if pd.notna(r.x): X.append(r.x);Y.append(r.y);E.append(-1); continue
    g=geo(r.city,r.addr,r.dist)
    if g: X.append(g[0]);Y.append(g[1]);E.append(g[2])
    else: X.append(np.nan);Y.append(np.nan);E.append(-2)
P['x']=X;P['y']=Y;P['nerr']=E
print(P.groupby(['cat']).apply(lambda g:pd.Series({'n':len(g),'xy':g.x.notna().sum()})))
print(P[P.x.notna()].groupby('city').size())
# 驗證：中油加油站有經緯度也有地址 → 對門牌的誤差
chk=[]
for r in json.loads(rd('poi_cpc_gas')):
    c=r['縣市'].replace('台','臺')
    if c not in ('臺北市','新北市','桃園市','臺中市','臺南市','高雄市') or not r.get('緯度'): continue
    g=geo(c,c+r['鄉鎮區']+r['地址'],c+r['鄉鎮區']); x,y=tm2(float(r['緯度']),float(r['經度'])); chk.append((c,None if not g else math.hypot(g[0]-x,g[1]-y)))
C=pd.DataFrame(chk,columns=['c','e']); print('geocode check n',len(C),'matched %.3f'%C.e.notna().mean()); print(C.groupby('c').e.agg(['count','median',lambda s:(s<100).mean(),lambda s:(s<300).mean(),'max']).round(3))
P.to_pickle('/tmp/claude-0/poi/poi.pkl')
