const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');
function load(path) {
  const html = fs.readFileSync(path, 'utf8');
  const context = vm.createContext({console, Date, D: {}, localStorage: {getItem:()=>null}});
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi)].map(x=>x[1].replace(/<\?[\s\S]*?\?>/g, 'null'));
  const vars = [], funcs = [], parsed = [];
  for (const js of scripts) {
    const ast = acorn.parse(js, {ecmaVersion: 'latest'}); parsed.push({js,ast});
    for (const n of ast.body) {
      if (n.type === 'FunctionDeclaration') funcs.push(js.slice(n.start,n.end));
      if (n.type === 'VariableDeclaration') for (const d of n.declarations) {
        if (d.id.type === 'Identifier' && /^(RATE_|ASSET_ITEMS$|EL_GH$|RECO_|COST_)/.test(d.id.name)) vars.push('var '+js.slice(d.start,d.end)+';');
      }
    }
  }
  vm.runInContext(funcs.join('\n'),context);
  for (const v of vars) vm.runInContext(v,context);
  return {context,html,run:code=>vm.runInContext(code,context), nested:(parent,name)=>{
    for(const {js,ast} of parsed) {
      const p=ast.body.find(n=>n.type==='FunctionDeclaration' && n.id.name===parent);
      if(!p) continue;
      for(const n of p.body.body) if(n.type==='VariableDeclaration') {
        const d=n.declarations.find(d=>d.id.name===name && d.init?.type==='FunctionExpression');
        if(d)return vm.runInContext('('+js.slice(d.init.start,d.init.end)+')',context);
      }
    }
    throw Error('Nested function not found: '+parent+'/'+name);
  }};
}
module.exports={load};
if(require.main===module){const {run}=load(process.argv[2]);console.log(run('RATE_PRESETS.map(p=>({name:p.k,ok:!!rateEval(rateWeights(p))}))'));}
