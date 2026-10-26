"""Independent deterministic quadrature vs App kernel. No market-performance claims."""
import argparse,itertools,json,math,subprocess,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('app',type=Path);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2]
cases=[dict(mu=mu,sig=sig,ltv=ltv) for mu,sig,ltv in itertools.product([-.05,0,.01,.03],[.05,.1,.2,.4],[0,.5,.9])]
cases += [dict(mu=.01,sig=.2,ltv=l,amort=am,jumps=j) for l,am,j in itertools.product([0,.8],[0,.5,1],[[],[{'p':.3,'s':.12}],[{'p':.2,'s':1}],[{'p':.3,'s':.25},{'p':.1,'s':.4}]])]
js="""const fs=require('fs');const {load}=require('./tests/gas/load-app.cjs');const {context}=load(process.argv[1]);const inputs=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(inputs.map(p=>context.elCalc(p))));"""
r=subprocess.run(['node','-e',js,str(a.app.resolve())],cwd=root,input=json.dumps(cases),text=True,capture_output=True,check=True)
actual=json.loads(r.stdout)
def reference(p):
 t=p.get('yrs',10);mu=p.get('mu',0);sig=max(.0001,p.get('sig',0));ltv=min(.95,max(0,p.get('ltv',0)));am=max(0,min(1,p.get('amort',1)))
 loan=ltv*am*.98**t;invested=(1-ltv)+ltv*(1-am)*.98**(t/2)
 combos=[(1.,1.)]
 for j in p.get('jumps',[]):
  combos=[v for prob,f in combos for v in [(prob*(1-j['p']),f),(prob*j['p'],f*(1-j['s']))]]
 # Simpson integration of the original bounded payoff under N(0,1), independent of the CDF implementation.
 n=20000;lo=-10.;h=20/n;m=(mu-sig*sig/2)*t;s=sig*math.sqrt(t);total=0.
 for i in range(n+1):
  z=lo+i*h;g=math.exp(m+s*z)
  payoff=0.
  for prob,f in combos:
   eq=(g*f-loan)/invested if ltv>0 else g*f
   payoff += prob*max(0,1-max(0,eq))
  value=payoff*math.exp(-z*z/2)/math.sqrt(2*math.pi)
  total += value*(1 if i in (0,n) else 4 if i%2 else 2)
 return total*h/3
results=[]
for params,value in zip(cases,actual):
 expected=reference(params)
 results.append({'parameters':params,'actual':value,'independent_quadrature':expected,'absolute_error':abs(value-expected)})
worst=max(results,key=lambda x:x['absolute_error'])
# Engineering tolerance: 0.001 percentage point, tighter than the UI's displayed 0.1 percentage point.
tolerance=1e-5
passed=all(isinstance(x['actual'],(float,int)) and math.isfinite(x['actual']) and 0<=x['actual']<=1 and x['absolute_error']<=tolerance for x in results)
a.report.parent.mkdir(parents=True,exist_ok=True)
a.report.write_text(json.dumps({'tested_app_sha256':hashlib.sha256(a.app.read_bytes()).hexdigest(),'test_harness_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'scope':'mathematical correctness only, synthetic parameters, not historical backtesting','cases':len(results),'passed':passed,'tolerance':tolerance,'worst':worst,'results':results},ensure_ascii=False,indent=2)+'\n')
print(f'{len(results)} deterministic math cases; max absolute error {worst["absolute_error"]:.10g}; '+('PASS' if passed else 'FAIL'))
raise SystemExit(0 if passed else 1)
