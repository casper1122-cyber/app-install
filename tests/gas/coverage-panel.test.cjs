const assert=require('node:assert/strict'),fs=require('node:fs');
const {load}=require('./load-app.cjs');
const {run}=load(process.argv[2]);
let count=0;
function test(name,code){assert.equal(run(code),true,name);count++;console.log('PASS '+name);}
run(`var fixture={total:10000,list:[{name:'測試住宅',kind:'房地產',value:9000,R:{score:70,grade:'A',risk:2}},{name:'測試球員卡',kind:'棒球卡',value:1000,R:{score:null,grade:null,risk:null,unverified:true}}],unratedNotice:'pending',finTiny:0};`);
test('existing house result stays visible beside pending card',`(()=>{var s=assetCoverageHtml(fixture);return s.includes('測試住宅') && s.includes('>A<') && s.includes('R2') && s.includes('90.0%') && s.includes('測試球員卡') && !s.includes('Rnull');})()`);
test('coverage includes complete total and shows evaluated amount',`(()=>{var s=assetCoverageHtml(fixture);return s.includes('$9,000／總資產 $10,000') && s.includes('不代表全部資產綜合等級');})()`);
test('pending card does not dilute the existing house grade',`(()=>{var before=JSON.stringify(fixture);assetCoverageHtml(fixture);return JSON.stringify(fixture)===before && fixture.list[0].R.grade==='A';})()`);
test('small unknown value cannot round coverage to 100 percent',`(()=>{var x=JSON.parse(JSON.stringify(fixture));x.total=9001;x.list[1].value=1;var s=assetCoverageHtml(x);return s.includes('超過99.9%') && !s.includes('占 100.0%');})()`);
test('tiny financial balance stays in denominator without double counting',`(()=>{var x=JSON.parse(JSON.stringify(fixture));x.total=11000;x.finTiny=1000;var s=assetCoverageHtml(x);return s.includes('81.8%') && s.includes('小額規則') && s.includes('仍包含在總資產');})()`);
test('all-pending assets retain value without manufactured grade',`(()=>{var x={total:1000,list:[fixture.list[1]]};var s=assetCoverageHtml(x);return s.includes('0.0%') && s.includes('總資產 $1,000') && s.includes('尚無可呈現的個別評級') && !s.includes('>CCC<');})()`);
test('asset names are escaped',`(()=>{var x=JSON.parse(JSON.stringify(fixture));x.list[0].name='<img src=x onerror=alert(1)>';var s=assetCoverageHtml(x);return !s.includes('<img') && s.includes('&lt;img');})()`);
run(`var display={innerHTML:''};$=()=>display;D={realEstate:{list:[{}]},altItems:[]};assetAll=()=>JSON.parse(JSON.stringify(fixture));allBacktest=()=>({});allBacktestHtml=()=>'<div>EXISTING-CHART</div>';rateHistLine=()=>'';setTimeout=()=>{};fixture.H={items:[]};fixture.cash=null;fixture.loans=0;fixture.grade=null;fixture.risk=null;fixture.el=null;`);
test('compact home preserves real estate result and existing chart',`(()=>{rateCurrent=()=>({total:1000,w:{TWDCASH:100}});rateEval=()=>({g:{score:70,grade:'A',risk:2}});rateTopDraw();return display.innerHTML.includes('測試住宅') && display.innerHTML.includes('>A<') && display.innerHTML.includes('EXISTING-CHART') && !display.innerHTML.includes('無法量化風險');})()`);
test('absent financial backtest does not hide other asset results',`(()=>{rateCurrent=()=>null;rateTopDraw();return display.innerHTML.includes('測試住宅') && display.innerHTML.includes('90.0%') && display.innerHTML.includes('EXISTING-CHART') && !display.innerHTML.includes('先登記資產');})()`);
test('full account view retains scoped results and existing chart',`(()=>{fixture.total=10000;fixture.list.forEach(x=>{x.hk='fixture:'+x.name;});fixture.sub=[];fixture.qGrade=null;fixture.H={items:[]};closeSheet=()=>{};openSheet=s=>{display.innerHTML=s;};assetAlerts=()=>[];openAssetAll();return display.innerHTML.includes('測試住宅') && display.innerHTML.includes('>A<') && display.innerHTML.includes('EXISTING-CHART') && !display.innerHTML.includes('Rnull');})()`);
console.log(count+' coverage/UI integration checks passed; fixtures only.');
if(process.argv[3]){
 run(`fixture.total=9001381;fixture.list[0].value=9000000;fixture.list[1].value=381;fixture.finTiny=1000;fixture.list[0].name='住宅（測試資料）';fixture.list[1].name='球員卡（測試資料）';`);
 const html=fs.readFileSync(process.argv[2],'utf8'),styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(x=>x[1]).join('\n');
 const panel=run('assetCoverageHtml(fixture)');
 fs.writeFileSync(process.argv[3],'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'</style><body><main style="max-width:540px;margin:20px auto;padding:12px"><div class="card"><h3>我的資產分析</h3>'+panel+'</div></main></body></html>');
}
