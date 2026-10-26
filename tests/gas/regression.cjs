const assert = require('node:assert/strict');
const {load} = require('./load-app.cjs');
const path = process.argv[2];
if (!path) throw Error('Usage: node regression.cjs /path/to/generated/App.html');
const app = load(path);
const {run} = app;
let passed=0;
function check(name, code) {
  try {assert.equal(run(code), true); console.log('PASS '+name); passed++;}
  catch (e) {console.error('FAIL '+name); throw e;}
}
check('all seven original presets evaluate with embedded data', `RATE_PRESETS.length===7 && RATE_PRESETS.every(p=>{var e=rateEval(rateWeights(p));return e && Number.isFinite(e.m.cagr) && Number.isFinite(e.g.score);})`);
check('unknown requested asset cannot silently disappear', `rateRun(RATE_DATA,{UNKNOWN:50,TWDCASH:50})===null`);
check('null monthly return cannot become observed zero', `(()=>{var d=JSON.parse(JSON.stringify(RATE_DATA));d.a.TWDCASH.r[d.a.TWDCASH.r.length-1]=null;return rateRun(d,{TWDCASH:100})===null;})()`);
check('short monthly return series rejects incomplete backtest', `(()=>{var d=JSON.parse(JSON.stringify(RATE_DATA));d.a.TWDCASH.r.pop();return rateRun(d,{TWDCASH:100})===null;})()`);
check('null CPI cannot become zero inflation', `(()=>{var d=JSON.parse(JSON.stringify(RATE_DATA));d.cpi[d.cpi.length-1]=null;return rateRun(d,{TWDCASH:100})===null;})()`);
check('USD backtest rejects null FX and foreign CPI', `(()=>{return ['fxr','cpi'].every(k=>{var d=JSON.parse(JSON.stringify(RATE_DATA));var a=k==='fxr'?d.fxr:d.L.cpi;a[a.length-1]=null;return rateRun(d,{TWDCASH:100},{base:'USD'})===null;});})()`);
check('missing preset comparison does not abort other rows', `(()=>{var original=rateEval;rateEval=()=>null;var result;try{result=rateCompareRows({trend:false,base:'TWD',g:{grade:'A',risk:2},m:{cagr:0,mdd:0},L:{mdd:0}});}finally{rateEval=original;}return result.includes('資料不足');})()`);
check('missing age does not produce personalized recommendation', `(()=>{D={retire:{retireAge:65}};return recoYears()===null && recoCompute({})===null;})()`);
check('future birth year rejected', `(()=>{D={retire:{birth:new Date().getFullYear()+1,age:40,retireAge:65}};return recoYears()===null;})()`);
check('known birth year preserves existing retirement interval', `(()=>{D={retire:{birth:new Date().getFullYear()-40,retireAge:65}};return recoYears()===25;})()`);
check('recommendation opens age step when age absent', `(()=>{D={retire:{retireAge:65}};var old=recoStep,called=false;recoStep=()=>{called=true;};try{openReco();return called && RECO.step===-1;}finally{recoStep=old;}})()`);
check('50 percent cash can reflect declared expenses, not an age default', `(()=>{var f=rateLastEnsure,m=assetMonthNeed;D={retire:{age:40,retireAge:65}};rateLastEnsure=()=>({cur:{total:1000000}});assetMonthNeed=()=>({v:50000});try{var c=recoCompute({big:200000});return c.resv===50 && c.emerg===300000 && Object.values(c.w).reduce((a,b)=>a+b,0)===100;}finally{rateLastEnsure=f;assetMonthNeed=m;}})()`);
check('different cards do not receive fabricated CCC or loss', `(()=>{D={};return ['新人卡','棒球卡','名人堂棒球卡'].every((category,i)=>{var a=assetAlt({category,name:'fixture'+i,value:1000+i*500,cost:800,date:'2025-01-01'});return a.R.grade===null && a.R.el===null && a.R.risk===null && a.R.unverified===true;});})()`);
check('unknown card detail retains value without synthetic quality labels', `(()=>{var a=assetAlt({category:'棒球卡',name:'fixture',value:1234,cost:800,date:'2025-01-01'});var s=assetSheetHtml(a);return s.includes('資料不足') && s.includes('1,234') && !s.includes('>CCC<') && !s.includes('風險很高') && !s.includes('Rnull');})()`);
check('unknown grade never described as very poor', `rateWord(null)==='資料不足' && rateGW(null).includes('資料不足') && !assetBand(null).includes('風險很高')`);
check('unknown loss never rendered as zero loss', `elBlockHtml({el:null},1000)===''`);
// Keep account orchestration real; replace only data acquisition and optional financial-health view.
run(`D={altItems:[{category:'棒球卡',name:'fixture',value:1000,cost:800,date:'2025-01-01'}],accounts:[]}; RATE_LAST=null; rateLastEnsure=()=>null; assetCash=()=>null; assetHealth=()=>({items:[]});`);
check('all-card account preserves total and suspends aggregate rating', `(()=>{var x=assetAll();return x.total===1000 && x.grade===null && x.el===null && x.risk===null && x.coverage===0;})()`);
check('unknown account history performs no write', `(()=>{var calls=0;D.rateHist={};RATE_SNAP_DONE=false;call=()=>{calls++;throw Error('Unexpected write');};rateHistSave();return calls===0 && RATE_SNAP_DONE===false;})()`);
check('mixed account retains financial value and exposes coverage', `(()=>{rateLastEnsure=()=>({cur:{total:100000},R:{g:{score:70,grade:'A',risk:2,el:.02}}});var x=assetAll();return x.total===101000 && x.grade===null && x.el===null && Math.abs(x.coverage-100000/101000)<1e-10;})()`);
check('full aggregate view handles unknown risk and shows coverage', `(()=>{rateLastEnsure=()=>null;D.rateHist={};var shown='';closeSheet=()=>{};openSheet=s=>{shown=s;};allBacktest=()=>null;allBacktestHtml=()=>'';openAssetAll();return (shown.includes('已有評級的資產占') || shown.includes('已有模型結果的資產占')) && !shown.includes('Rnull') && !shown.includes('NaN') && !shown.includes('平均可能少掉 0.0%');})()`);
check('compact home view does not show null risk or zero expected loss', `(()=>{var shown={innerHTML:''};$=()=>shown;rateCurrent=()=>({total:1000,w:{TWDCASH:100}});rateEval=()=>({g:{score:70,grade:'A',risk:2}});setTimeout=()=>{};rateTopDraw();return (shown.innerHTML.includes('資料不足') || shown.innerHTML.includes('已有結果的資產分析')) && !shown.innerHTML.includes('Rnull') && !shown.innerHTML.includes('10 年預期損失 0.0%');})()`);
app.context.testLabRun=app.nested('openRateLab','run');
check('failed configuration evaluation clears stale result and gives missing code', `(()=>{var out={innerHTML:'old result <button>save</button>'};$=id=>id==='labTrend'?{checked:false}:out;LAB={cash:50};sum=()=>true;labRowsToWeights=()=>({w:{MISSING:50}});base='TWD';rateEval=()=>null;testLabRun();return out.innerHTML.includes('MISSING') && out.innerHTML.includes('資料不足') && !out.innerHTML.includes('old result') && !out.innerHTML.includes('<button>');})()`);
console.log(`${passed} offline integration regressions passed; no live GAS, user data or market validation performed.`);
