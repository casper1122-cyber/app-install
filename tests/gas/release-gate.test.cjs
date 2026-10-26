const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
const source = fs.readFileSync(process.argv[2], 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
function setup() {
  const props = new Map([['HUB_SCRIPT_ID','project'],['HUB_DEPLOY_ID','deployment']]);
  const manifest={name:'appsscript',type:'JSON',source:JSON.stringify({webapp:{executeAs:'USER_ACCESSING',access:'ANYONE'}})};
  const base=[manifest,{name:'核心',type:'SERVER_JS',source:'var LIB_VERSION_ = "2026.10.54l"; // production'}];
  const state={head:[clone(manifest),{name:'核心',type:'SERVER_JS',source:'var LIB_VERSION_ = "2026.10.54n"; // tested candidate'}],versions:{1:clone(base)},current:1,created:0,deployed:0,locks:0,unlocks:0,logs:[]};
  const p={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>{props.set(k,String(v));return p;},deleteProperty:k=>{props.delete(k);return p;}};
  const c=vm.createContext({console,PropertiesService:{getScriptProperties:()=>p},Utilities:{formatDate:()=> '2026-10-26 18:00',DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],base64Encode:a=>Buffer.from(a).toString('base64')},LockService:{getScriptLock:()=>({waitLock:()=>{state.locks++;},releaseLock:()=>{state.unlocks++;}})}});
  vm.runInContext(source,c);
  c.log_=(...a)=>state.logs.push(a);
  c.gapi_=(method,path,body)=>{
    if(method==='get'&&path==='/content')return {files:clone(state.head)};
    if(method==='get'&&path.startsWith('/content?versionNumber='))return {files:clone(state.versions[Number(path.split('=').pop())])};
    if(method==='get'&&path==='/deployments/deployment')return {deploymentConfig:{versionNumber:state.current}};
    if(method==='put'&&path==='/content'){state.head=clone(body.files);return {};}
    if(method==='post'&&path==='/versions'){state.created++;const n=state.created+10;if(state.beforeSnapshot)state.beforeSnapshot();state.versions[n]=clone(state.head);return {versionNumber:n};}
    if(method==='put'&&path==='/deployments/deployment'){state.deployed++;state.current=body.deploymentConfig.versionNumber;return {deploymentConfig:clone(body.deploymentConfig)};}
    throw Error('Unexpected API operation '+method+' '+path);
  };
  return {c,state,props};
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
const blocked=x=>{x.c.autoPromote();assert.equal(x.state.deployed,0);assert.match(x.props.get('AUTO_LAST'),/失敗|沒有/);assert.equal(x.state.locks,x.state.unlocks);};
test('default automatic release requires approval',()=>{const x=setup();blocked(x);assert.equal(x.state.created,0);});
test('approval alone does not deploy; exact approved version can release once',()=>{const x=setup();x.c.approveTestRelease();assert.equal(x.state.created,0);assert.equal(x.state.deployed,0);x.c.autoPromote();assert.equal(x.state.deployed,1);assert.equal(x.props.has('RELEASE_APPROVAL_V1'),false);assert.equal(x.state.locks,2);assert.equal(x.state.unlocks,2);x.c.autoPromote();assert.equal(x.state.deployed,1);});
test('manual revocation blocks release',()=>{const x=setup();x.c.approveTestRelease();x.c.revokeTestRelease();blocked(x);});
test('direct editor content change invalidates approval',()=>{const x=setup();x.c.approveTestRelease();x.state.head[1].source+='\n// later untested change';blocked(x);});
test('test upload revokes prior approval without publishing',()=>{const x=setup();x.c.approveTestRelease();x.c.upload_({files:[{target:'核心',source:'var LIB_VERSION_ = "2026.10.54n"; // different candidate'}]});assert.equal(x.props.has('RELEASE_APPROVAL_V1'),false);blocked(x);});
test('production base version change invalidates approval',()=>{const x=setup();x.c.approveTestRelease();x.state.versions[2]=clone(x.state.versions[1]);x.state.current=2;blocked(x);});
test('project change invalidates approval',()=>{const x=setup();x.c.approveTestRelease();x.props.set('HUB_SCRIPT_ID','different-project');blocked(x);});
test('unknown production fingerprint cannot be approved or promoted',()=>{const x=setup();x.state.current=99;assert.throws(()=>x.c.approveTestRelease(),/待發布/);blocked(x);});
test('immutable snapshot mismatch blocks production even if HEAD raced',()=>{const x=setup();x.c.approveTestRelease();x.state.beforeSnapshot=()=>{x.state.head[1].source+='\n// unexpected concurrent edit';};blocked(x);assert.equal(x.state.created,1);});
test('malformed approval fails closed',()=>{const x=setup();x.props.set('RELEASE_APPROVAL_V1','not json');blocked(x);});
test('wrong central access setting rejects approval without rewriting source',()=>{const x=setup();x.state.head[0].source='{"webapp":{"access":"ANYONE_ANONYMOUS"}}';const before=clone(x.state.head);assert.throws(()=>x.c.approveTestRelease(),/存取設定/);assert.deepEqual(x.state.head,before);assert.equal(x.state.deployed,0);});
test('existing explicit manual deployment still works',()=>{const x=setup();x.c.deploy_({desc:'manual approved by operator'});assert.equal(x.state.deployed,1);assert.equal(x.state.locks,x.state.unlocks);});
test('hotfix preserves test HEAD and releases only production-based patch',()=>{const x=setup(),head=clone(x.state.head);x.c.approveTestRelease();x.c.hotfix_({files:[{target:'核心',source:'var LIB_VERSION_ = "2026.10.54m"; // production hotfix'}]});assert.deepEqual(x.state.head,head);assert.match(x.state.versions[x.state.current][1].source,/production hotfix/);assert.equal(x.props.has('RELEASE_APPROVAL_V1'),false);assert.equal(x.state.locks,x.state.unlocks);});
test('rollback remains explicit and revokes stale approval',()=>{const x=setup();x.c.approveTestRelease();x.c.rollback_({version:1});assert.equal(x.state.deployed,1);assert.equal(x.props.has('RELEASE_APPROVAL_V1'),false);});
console.log(count+' offline backend integration tests passed; no live deployment performed.');
