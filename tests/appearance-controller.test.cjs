const {test}=require('node:test');const assert=require('node:assert/strict');
const policy=require('../src/appearance-policy');
let createController;try{({createController}=require('../src/appearance-controller'))}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function setup({privateWindow=false,ownership}={}){
  let store=policy.emptyStore(),scope='site',current='A',dark=false,writes=0,changed=()=>{};
  const tabs=[{workspace:'A',url:'https://a.com',bc:{prefersColorSchemeOverride:'none'}},{workspace:'B',url:'https://b.com',bc:{prefersColorSchemeOverride:'none'}}];
  const env={ownership,tabs:()=>tabs,context:t=>({workspaceId:t.essential?current:t.workspace,site:policy.recogniseSite(t.url,{baseDomain:h=>h,userRules:store.groups})}),selected:()=>tabs[0],browsingContext:t=>t.bc,
    read:()=>JSON.parse(JSON.stringify(store)),write:s=>{store=s;writes++;},scope:()=>scope,systemDark:()=>dark,defaultDark:()=>false,privateWindow,
    listen:fn=>{changed=fn;return()=>{changed=()=>{}}},notify:()=>{},error:e=>{throw e}};
  const c=createController({environment:env,policy});c.start();
  return {c,tabs,env,change:()=>changed(),scope:v=>{scope=v;changed()},workspace:v=>{current=v;changed()},system:v=>{dark=v;changed()},get store(){return store},get writes(){return writes}};
}
test('a saved site affects relevant tabs only and survives a new controller',()=>{
  const s=setup();s.c.choose('dark');assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'dark');assert.equal(s.tabs[1].bc.prefersColorSchemeOverride,'none');
  s.c.stop();assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'none');
  s.c=createController({environment:s.env,policy});s.c.start();assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'dark');s.c.stop();
});
test('navigation and browsing-context replacement resolve the destination',()=>{
  const s=setup();s.c.choose('dark');s.tabs[0].url='https://b.com';s.change();assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'none');
  s.tabs[0].url='https://a.com';s.tabs[0].bc={prefersColorSchemeOverride:'none'};s.change();assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'dark');s.c.stop();
});
test('workspace choices apply to owning tabs, shared Essentials use active workspace',()=>{
  const s=setup();s.scope('workspace');s.c.choose('dark');assert.equal(s.tabs[1].bc.prefersColorSchemeOverride,'none');
  s.tabs[1].essential=true;s.change();assert.equal(s.tabs[1].bc.prefersColorSchemeOverride,'dark');
  s.workspace('B');assert.equal(s.tabs[1].bc.prefersColorSchemeOverride,'none');assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'dark');s.c.stop();
});
test('combined scope and mode switching preserve independent saved choices',()=>{
  const s=setup();s.c.choose('dark');s.scope('workspace-site');assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'none');
  s.c.choose('light');s.tabs[0].workspace='B';s.change();assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'none');
  s.scope('site');assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'dark');s.c.stop();
});
test('explicit System responds to system changes while reset restores inheritance',()=>{
  const s=setup();s.c.choose('system');assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'light');s.system(true);assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'dark');
  s.c.choose('inherit');assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'none');s.c.stop();
});
test('private choices do not write persisted settings',()=>{
  const s=setup({privateWindow:true});s.c.choose('dark');assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'dark');assert.equal(s.writes,0);s.change();assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'dark');s.c.stop();
});
test('cleanup preserves a later override from another owner',()=>{
  const s=setup();s.c.choose('dark');s.tabs[0].bc.prefersColorSchemeOverride='light';s.change();assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'light');s.c.stop();assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'light');
});
test('start is idempotent and stopping removes reactions',()=>{
  const s=setup();s.c.start();s.c.choose('dark');assert.equal(s.writes,1);s.c.stop();s.change();assert.equal(s.tabs[0].bc.prefersColorSchemeOverride,'none');
});
test('changing one site must not reclaim another site from Developer Tools',()=>{
 const s=setup();s.c.choose('dark');s.env.selected=()=>s.tabs[1];s.c.choose('dark');
 s.tabs[1].bc.prefersColorSchemeOverride='light';s.change();
 s.env.selected=()=>s.tabs[0];s.c.choose('light');
 assert.equal(s.tabs[1].bc.prefersColorSchemeOverride,'light');s.c.stop();
});
for(const destination of ['dark','light','inherit'])for(const receiverFirst of [true,false])test(`tab handoff retains ${destination}, receiver first ${receiverFirst}`,()=>{
 const ownership=new WeakMap(),a=setup({ownership}),b=setup({ownership});a.c.choose('dark');
 if(destination!=='inherit')b.c.choose(destination);
 const moved=a.tabs.shift();b.tabs.unshift(moved);
 if(receiverFirst){b.change();a.change();}else{a.change();b.change();}
 b.change();assert.equal(moved.bc.prefersColorSchemeOverride,destination==='inherit'?'none':destination);
 a.c.stop();b.c.stop();assert.equal(moved.bc.prefersColorSchemeOverride,'none');
});
