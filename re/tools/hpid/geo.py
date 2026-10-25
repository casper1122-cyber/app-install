import pandas as pd, numpy as np, re, collections, pickle
fw=str.maketrans('０１２３４５６７８９－','0123456789-')
CN='零一二三四五六七八九十'
def nroad(r):
    r=str(r).translate(fw).replace('台','臺')
    return re.sub(r'(\d+)段',lambda m:(CN[int(m.group(1))] if int(m.group(1))<=10 else m.group(1))+'段',r)
def num(s):
    s=str(s).translate(fw); m=re.match(r'(\d+)',s); return int(m.group(1)) if m else None
def ln(s):
    s=str(s).translate(fw); m=re.match(r'(\d+)',s); return int(m.group(1)) if m else 0
frames=[]
for k,city,cols in [('tpe','臺北市',None),('ntpc','新北市',None)]:
    d=pd.read_csv(f'/tmp/claude-0/door/{k}.csv.gz',dtype=str,encoding='utf-8-sig')
    d.columns=['cc','ac','li','nb','road','area','lane','alley','no','x','y']
    d['city']=city
    frames.append(d)
D=pd.concat(frames)
D['road']=D.road.fillna('').map(nroad)
D['lane']=D.lane.fillna('').map(ln); D['alley']=D.alley.fillna('').map(ln); D['n']=D['no'].map(num)
D['x']=D.x.astype(float); D['y']=D.y.astype(float)
D=D[D.n.notna()&(D.road!='')]
G=D.groupby(['city','ac','road','lane','alley','n'])[['x','y']].mean().reset_index()
print('door keys',len(G))
G.to_pickle('/tmp/claude-0/door/doors.pkl')
