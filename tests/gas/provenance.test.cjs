const assert=require('node:assert/strict');const {load}=require('./load-app.cjs');const {run}=load(process.argv[2]);let n=0;
function test(name,s){assert.equal(run(s),true,name);console.log('PASS '+name);n++;}
run(`STK_HIST={a:{}};`);
test('missing own stock history cannot be rated from benchmark',`(()=>{var d=rateDataWith([{code:'9999'}],{ownOnly:true});return !d.a['STK:9999'] && assetFin('9999','fixture',1000).R===null;})()`);
test('missing ETF history cannot be rated from benchmark',`(()=>{var d=rateDataWith([{code:'009999'}],{ownOnly:true});return !d.a['ETF:009999'] && assetFin('009999','fixture',1000).R===null;})()`);
test('scenario-only benchmark data is explicitly identified',`(()=>{var d=rateDataWith([{code:'9999'}]);var a=d.a['STK:9999'];return a.real===false && a.provenance.kind==='benchmark-proxy' && a.provenance.observedMonths===0 && a.provenance.proxyMonths===a.r.length;})()`);
run(`var histStart=rateYm_(RATE_DATA.base,rateIdx_(RATE_DATA.base,RATE_DATA.last)-35);STK_HIST={a:{'9999':{s:histStart,r:Array(36).fill(100),n:'fixture'}}};`);
test('own history begins at actual stock start, not benchmark inception',`(()=>{var a=rateDataWith([{code:'9999'}],{ownOnly:true}).a['STK:9999'];return a.s===histStart && a.r.length===36 && a.provenance.proxyMonths===0 && a.real===true;})()`);
test('true zero monthly return remains an observation',`(()=>{STK_HIST.a['9999'].r[1]=0;var a=rateDataWith([{code:'9999'}],{ownOnly:true}).a['STK:9999'];return a.r[1]===0 && a.own_n===36;})()`);
test('interior missing month stays missing and cannot yield grade',`(()=>{STK_HIST.a['9999'].r[2]=null;var d=rateDataWith([{code:'9999'}],{ownOnly:true}),a=d.a['STK:9999'];return a.r[2]===null && a.provenance.missingMonths===1 && a.provenance.proxyMonths===0 && rateEval({'STK:9999':100},{data:d})===null;})()`);
test('mixed default portfolio history is not claimed to be all real',`(()=>{var a=rateDataWith([{code:'9999'}]).a['STK:9999'];return a.real===false && a.provenance.kind==='mixed' && a.provenance.proxyMonths>0;})()`);
test('stale source ending before global cutoff cannot be silently padded',`(()=>{STK_HIST.a['9999'].r=Array(35).fill(100);var d=rateDataWith([{code:'9999'}],{ownOnly:true}),a=d.a['STK:9999'];return a.r.length===35 && a.provenance.missingMonths===1 && rateEval({'STK:9999':100},{data:d})===null;})()`);
console.log(n+' own-history provenance tests passed; synthetic fixtures only, no market-performance validation.');
