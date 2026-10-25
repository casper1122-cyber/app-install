import pandas as pd,numpy as np,re,warnings;warnings.filterwarnings('ignore')
d=pd.read_pickle('/tmp/claude-0/hpid/res4.pkl'); d=d[(d.kind=='res')&(d.unit>1000)&(d.y>=2014)].copy()
d['note']=d.note.fillna('').str.replace(r'(除|如：|例如|包括).{0,12}(非自然身故|輻射|海砂|凶宅)[^。；]*','',regex=True); d['lu']=np.log(d.unit)
d['pb']=pd.cut(d.ping,[0,15,25,35,50,80,1e5],labels=False); d['ab']=pd.cut(d.age,[-1,3,10,20,30,40,200],labels=False).fillna(-1)
CN={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
def cn(s):
    s=str(s).strip(); m=re.match(r'^([一二三四五六七八九十]+)層',s)
    if not m: return np.nan
    t=m.group(1); v=0
    if '十' in t: a,b=t.split('十'); v=(CN.get(a,1) if a else 1)*10+(CN.get(b,0) if b else 0)
    else: v=CN.get(t,np.nan)
    return v
d['fl']=d.flr.map(cn); d['tt']=d.tot.map(cn); d['top']=(d.fl==d.tt).astype(int)
OTHER='親友|特殊關係|急買急賣|法拍|債權|持分|預售'
d['clean']=~d.note.str.contains(OTHER)
NEG=r'(非|無|不是|沒有|未|並非|排除|否|檢測合格|合格)'
KW={'凶宅（民情風俗）':'受民情風俗因素影響|屬凶宅|是凶宅|凶宅交易|為凶宅|自殺|非自然(身故|死亡)(?!、輻射)','海砂屋':'(為|屬|是)海砂屋|海砂屋交易|氯離子.{0,8}(超標|過高|不合格|超過)','輻射屋':'(為|屬|是)輻射屋|輻射屋交易|輻射.{0,4}(超標|偏高)','毛胚':'毛胚','含裝潢':'含.{0,4}裝潢|裝潢費|裝潢款','含家具':'家具','含家電':'家電','頂樓加蓋（頂樓戶）':'頂樓?加蓋|頂加','增建':'增建|違建','夾層':'夾層','地上權':'地上權','都更危老':'都更|危老','漏水壁癌':'漏水|壁癌','瑕疵物件':'瑕疵物件'}
key=['dist','y','typ','pb','ab','top']
base=d[d.clean & ~d.note.str.contains('|'.join(KW.values()))]
ref=base.groupby(key).lu.agg(['median','size']).rename(columns={'median':'m','size':'n'})
out=[]
for k,p in KW.items():
    pos=d.note.str.contains(p); neg=d.note.str.contains(NEG+'.{0,3}('+p+')')
    g=d[d.clean & pos & ~neg]
    if k in ('毛胚',): g=g[g.ab>=2]   # 老房子要全部重做的毛胚（新成屋的毛胚交屋另外看）
    print(k,'negated',int((pos&neg).sum()),'kept',len(g))
    if k.startswith('頂樓'): g=g[g.top==1]
    g=g.join(ref,on=key); g=g[g.n>=8]
    if len(g)<15: out.append((k,len(g),None,None,None)); continue
    r=g.lu-g.m; lo,hi=np.percentile([np.median(np.random.default_rng(i).choice(r.values,len(r))) for i in range(300)],[2.5,97.5])
    out.append((k,len(g),round(np.exp(r.median())-1,3),round(np.exp(lo)-1,3),round(np.exp(hi)-1,3)))
for o in out: print(o)
