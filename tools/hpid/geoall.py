# 門牌坐標（各縣市欄位順序一樣：縣市代碼、區代碼、村里、鄰、街路段、地區、巷、弄、號、X、Y，TWD97 TM2）
import pandas as pd, numpy as np, re, sys
fw=str.maketrans('０１２３４５６７８９－','0123456789-')
CN='零一二三四五六七八九十'
def nroad(r):
    r=str(r).translate(fw).replace('台','臺')
    return re.sub(r'(\d+)段',lambda m:(CN[int(m.group(1))] if int(m.group(1))<=10 else m.group(1))+'段',r)
def num(s):
    s=str(s).translate(fw); m=re.match(r'(\d+)',s); return int(m.group(1)) if m else None
def ln(s):
    s=str(s).translate(fw); m=re.match(r'(\d+)',s); return int(m.group(1)) if m else 0
FILES={'臺北市':'/tmp/claude-0/door/tpe.csv.gz','新北市':'/tmp/claude-0/door/ntpc.csv.gz','臺南市':'/tmp/claude-0/door2/door_tnn.csv.gz','高雄市':'/tmp/claude-0/door2/door_khh.csv.gz','桃園市':'/tmp/claude-0/door2/door_tyn.csv.gz','臺中市':'/tmp/claude-0/door2/door_txg.csv.gz'}
import os
fr=[]
for city,f in FILES.items():
    if not os.path.exists(f): continue
    d=pd.read_csv(f,dtype=str,encoding='utf-8-sig',header=0)
    if d.shape[1]<11: print('skip',city,d.shape); continue
    d=d.iloc[:,:11]; d.columns=['cc','ac','li','nb','road','area','lane','alley','no','x','y']; d['city']=city; fr.append(d); print(city,len(d))
D=pd.concat(fr)
D['road']=D.road.fillna('').map(nroad); D['lane']=D.lane.fillna('').map(ln); D['alley']=D.alley.fillna('').map(ln); D['n']=D['no'].map(num)
D['x']=pd.to_numeric(D.x,errors='coerce'); D['y']=pd.to_numeric(D.y,errors='coerce')
D=D[D.n.notna()&(D.road!='')&D.x.notna()]
G=D.groupby(['city','ac','road','lane','alley','n'])[['x','y']].mean().reset_index()
print('door keys',len(G),G.groupby('city').size().to_dict()); G.to_pickle('/tmp/claude-0/door/doors_all.pkl')
