const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const policy=require('../src/appearance-policy');
function setup(){
 const dom=new JSDOM('<body><div mod-id="zen-site-appearance-toggle"><div class="sineItemPreferenceDialogContent"></div></div></body>',{runScripts:'outside-only'}),w=dom.window;
 const prefs=new Map([['layout.css.prefers-color-scheme.content-override',0]]),observers=new Set();let writes=0;
 w.AppearancePolicy=policy;w.SAT_PREF='layout.css.prefers-color-scheme.content-override';w.SAT_PREFIX='mod.zensiteappearancetoggle.';w.__satHasWorkspaces=true;
 w.Services={appinfo:{name:'Zen'},prefs:{getIntPref:(k,d)=>prefs.get(k)??d,getStringPref:(k,d)=>prefs.get(k)??d,setIntPref:write,setStringPref:write,addObserver:(_,f)=>observers.add(f),removeObserver:(_,f)=>observers.delete(f)}};
 function write(k,v){prefs.set(k,v);writes++;for(const fn of observers)fn();}
 w.satRead=()=>policy.parseStore(prefs.get('state')||'',prefs.get('legacy')||'{}');
 w.satWrite=s=>{const r=policy.serialize(s);write('state',r.state);write('legacy',r.legacy)};
 w.ChromeUtils={importESModule:()=>({PrivateBrowsingUtils:{isContentWindowPrivate:()=>false}})};
 w.console=console;
 w.Services.eTLD={getBaseDomainFromHost:h=>h.split('.').slice(-2).join('.')};
 const file=path.join(__dirname,'../src/appearance-settings.js');if(fs.existsSync(file))w.eval(fs.readFileSync(file,'utf8'));
 return {w,prefs,get writes(){return writes},write,change:(id,value)=>{const e=w.document.getElementById(id);assert.ok(e,id+' exists');e.value=value;e.dispatchEvent(new w.Event('change',{bubbles:true}));},click:id=>w.document.getElementById(id).click(),close:()=>{w.__satSettings?.stop();w.close();}};
}
test('Configure opening preserves default and external native changes stay synchronised',()=>{
 const s=setup();assert.ok(s.w.document.getElementById('sat-browser-default'));assert.equal(s.writes,0);assert.equal(s.w.document.getElementById('sat-browser-default').value,'0');
 s.write('layout.css.prefers-color-scheme.content-override',1);assert.equal(s.w.document.getElementById('sat-browser-default').value,'1');
 s.change('sat-browser-default','2');assert.equal(s.prefs.get('layout.css.prefers-color-scheme.content-override'),2);s.close();
});

test('native System value and legacy Auto both display System without rewriting the preference',()=>{
 const s=setup(),key='layout.css.prefers-color-scheme.content-override';
 for(const value of [2,3]){
  s.write(key,value);const before=s.writes;
  assert.equal(s.w.document.getElementById('sat-browser-default').value,'2');
  assert.equal(s.prefs.get(key),value);assert.equal(s.writes,before);
 }
 s.close();
});
test('scope changes preserve saved choices and grouping changes use real policy',()=>{
 const s=setup();s.change('sat-scope','workspace-site');assert.equal(s.prefs.get('mod.zensiteappearancetoggle.scope'),'workspace-site');
 s.change('sat-group-host','shop.example.com');s.change('sat-group-target','independent');s.click('sat-group-apply');
 assert.equal(s.w.satRead().groups['shop.example.com'],'host:shop.example.com');
 s.change('sat-group-target','automatic');s.click('sat-group-apply');assert.deepEqual(s.w.satRead().groups,{});s.close();
});
test('bad grouping input reports error without writing or interpreting HTML',()=>{
 const s=setup();s.change('sat-group-host','<img src=x onerror=alert(1)>');s.change('sat-group-target','independent');s.click('sat-group-apply');
 assert.equal(s.writes,0);assert.match(s.w.document.getElementById('sat-settings-message').textContent,/hostname|Invalid/);assert.equal(s.w.document.querySelectorAll('img').length,0);s.close();
});
test('cleanup stops preference reactions and removes only SAT controls',()=>{
 const s=setup();assert.ok(s.w.__satSettings);s.w.__satSettings.stop();assert.equal(s.w.document.getElementById('sat-settings-panel'),null);assert.ok(s.w.document.querySelector('[mod-id]'));s.close();
});
test('group preview uses the selected scope and resolves independent and automatic destinations',()=>{
 const s=setup();let store=policy.emptyStore();
 store=policy.setChoice(store,{scope:'site',siteKey:'domain:example.com'},'dark');
 store=policy.setChoice(store,{scope:'workspace-site',workspaceId:'A',siteKey:'domain:example.com'},'light');
 s.w.satWrite(store);s.change('sat-scope','workspace-site');s.change('sat-group-host','shop.example.com');s.change('sat-group-target','domain:example.com');
 let text=s.w.document.getElementById('sat-group-preview').textContent;
 assert.match(text,/Light/i);assert.doesNotMatch(text,/Saved site choice: dark/);
 s.change('sat-scope','site');s.change('sat-group-target','automatic');
 assert.match(s.w.document.getElementById('sat-group-preview').textContent,/Dark/i);
 s.change('sat-group-target','independent');assert.match(s.w.document.getElementById('sat-group-preview').textContent,/browser default/i);s.close();
});
