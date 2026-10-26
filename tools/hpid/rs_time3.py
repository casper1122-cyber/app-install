exec(open('/tmp/claude-0/hpid/rs_time2.py').read().split("for cut,tst")[0])
import numpy as np
S=[0,.2,.3,.4,.5,.6,.7,.8,1]
for mode in ('slope','noprem'):
  for cut,tst in [(2019,2017),(2020,2018),(2021,2019),(2022,2020),(2023,2021)]:
    A=O[O.tb<cut]; B=O[O.ta>=tst]; p=pred(fit(A,mode),B)
    print(mode,cut,' '.join('%.1f:%.4f'%(s,np.median(abs((B.res-s*p)-(B.res-s*p).mean()))) for s in S))
# 只有屋齡 vs 全部欄位
