import pandas as pd, numpy as np, re
d=pd.read_pickle('/tmp/claude-0/hpid/res.pkl')
fw=str.maketrans('０１２３４５６７８９','0123456789')
def road(a,dist):
    a=str(a).translate(fw); a=a.replace('台','臺')
    c=dist[:3]; dn=dist[3:]
    a=re.sub('^'+c,'',a); a=re.sub('^'+dn,'',a)
    m=re.match(r'^(?:(\S{1,4}?里))?(?:\d+鄰)?(\S{1,8}?(?:路|街|大道))((?:[一二三四五六七八九十\d]+段))?',a)
    if not m: return None,None
    li=m.group(1); r=m.group(2)+(m.group(3) or '')
    return r,li
rr=[road(a,ds) for a,ds in zip(d.addr,d.dist)]
d['road']=[x[0] for x in rr]; d['li']=[x[1] for x in rr]
print('road parsed',d.road.notna().mean(), 'li parsed', d.li.notna().mean())
d.to_pickle('/tmp/claude-0/hpid/res_road.pkl')
