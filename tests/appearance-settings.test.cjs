const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const policy=require('../src/appearance-policy');
function setup({legacy='{}',state='',scope,privateWindow=false,zen=true,browserWindows=[]}={}){
 const dom=new JSDOM('<body><div mod-id="zen-site-appearance-toggle"><div class="sineItemPreferenceDialogContent"></div></div></body>',{runScripts:'outside-only'}),w=dom.window;
 const prefs=new Map([['layout.css.prefers-color-scheme.content-override',0],['legacy',legacy],['state',state]]),observers=new Set();let writes=0;
 if(scope)prefs.set('mod.zensiteappearancetoggle.scope',scope);
 w.AppearancePolicy=policy;w.SAT_PREF='layout.css.prefers-color-scheme.content-override';w.SAT_PREFIX='mod.zensiteappearancetoggle.';w.__satHasWorkspaces=true;
 w.Services={appinfo:{name:zen?'Zen':'Firefox'},wm:{getEnumerator:()=>browserWindows},prefs:{getIntPref:(k,d)=>prefs.get(k)??d,getStringPref:(k,d)=>prefs.get(k)??d,setIntPref:write,setStringPref:write,addObserver:(_,f)=>observers.add(f),removeObserver:(_,f)=>observers.delete(f)}};
 function write(k,v){prefs.set(k,v);writes++;for(const fn of observers)fn();}
 w.satRead=()=>policy.parseStore(prefs.get('state')||'',prefs.get('legacy')||'{}');
 w.satWrite=s=>{const r=policy.serialize(s);write('state',r.state);write('legacy',r.legacy)};
 w.ChromeUtils={importESModule:()=>({PrivateBrowsingUtils:{isContentWindowPrivate:()=>privateWindow,isWindowPrivate:w=>!!w.private}})};
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

test('website remembering defaults replace legacy workspace mode without changing retained records',()=>{
 for(const [scope,want] of [[undefined,'site'],['workspace','workspace-site'],['invalid','site'],['site','site'],['workspace-site','workspace-site']]){
  const s=setup({scope,legacy:'{"old-workspace":2}'});
  assert.deepEqual([...s.w.document.getElementById('sat-scope').options].map(o=>o.value),['workspace-site','site']);
  assert.equal(s.w.document.getElementById('sat-scope').value,want);
  assert.equal(s.prefs.get('legacy'),'{"old-workspace":2}');assert.equal(s.writes,0);
  const old=s.w.document.querySelector('[data-sat-scope="workspace"]');assert.ok(old,'inactive legacy workspace record visible');assert.match(old.textContent,/inactive|legacy/i);
  assert.equal(old.querySelector('select'),null,'inactive legacy record has only remove action');old.querySelector('button').click();
  assert.deepEqual(s.w.satRead().workspaces,{});s.close();
 }
});

test('Firefox displays website sharing despite a stored workspace scope and performs no migration writes',()=>{
 const s=setup({scope:'workspace-site',zen:false});assert.equal(s.w.document.getElementById('sat-scope').value,'site');assert.equal(s.writes,0);s.close();
});

test('website setup Undo uses a normal runtime record and reports asynchronous errors without preference writes',async()=>{
 let records=[{id:'example',label:'Example website',before:'dark'}],seen=[];
 const runtime={records:()=>records,undo:async id=>{seen.push(id);records=[];}};
 const s=setup({browserWindows:[{private:true,__zenSiteAppearanceToggle:{siteSetup:{records(){throw Error('private runtime read');}}}},{__zenSiteAppearanceToggle:{siteSetup:runtime}}]});
 const button=s.w.document.querySelector('#sat-website-setup button');assert.ok(button,'actual setup record shown');assert.match(s.w.document.getElementById('sat-website-setup').textContent,/Example website/);
 button.click();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(seen,['example']);assert.equal(s.writes,0);assert.equal(s.w.document.querySelector('#sat-website-setup button'),null);
 records=[{id:'failed',label:'Failure fixture',before:'light'}];runtime.undo=async()=>{throw Error('Website settings unavailable');};s.write('fixture-refresh','x');
 s.w.document.querySelector('#sat-website-setup button').click();await new Promise(resolve=>setTimeout(resolve,0));assert.match(s.w.document.getElementById('sat-settings-message').textContent,/Website settings unavailable/);assert.equal(s.writes,1);s.close();
});

test('website setup Undo remains disabled while preference observers refresh during an in-flight operation',async()=>{
 let finish,calls=0;const runtime={records:()=>[{id:'pending',label:'Pending website'}],undo:()=>{calls++;return new Promise(resolve=>finish=resolve);}};
 const s=setup({browserWindows:[{__zenSiteAppearanceToggle:{siteSetup:runtime}}]});
 s.w.document.querySelector('#sat-website-setup button').click();s.write('fixture-refresh','x');
 const refreshed=s.w.document.querySelector('#sat-website-setup button');assert.equal(refreshed.disabled,true);refreshed.click();assert.equal(calls,1);
 finish();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(s.w.document.querySelector('#sat-website-setup button').disabled,false);s.close();
});

test('saved appearance edits address exact scope and retain unrelated site and workspace records',()=>{
 const store=policy.emptyStore();store.sites={'domain:example.com':'dark','host:<img>':'light'};store.workspaceSites={A:{'domain:example.com':'light'},B:{'domain:example.com':'system'}};
 const s=setup({state:policy.serialize(store).state,scope:'workspace-site'});
 const site=s.w.document.querySelector('[data-sat-scope="site"][data-sat-site="domain:example.com"] select');assert.ok(site,'shared saved record editable');
 site.value='light';site.dispatchEvent(new s.w.Event('change',{bubbles:true}));
 assert.equal(s.w.satRead().sites['domain:example.com'],'light');assert.equal(s.w.satRead().workspaceSites.A['domain:example.com'],'light');
 const a=s.w.document.querySelector('[data-sat-scope="workspace-site"][data-sat-workspace="A"] select');assert.ok(a,'workspace saved record editable');
 a.value='inherit';a.dispatchEvent(new s.w.Event('change',{bubbles:true}));
 assert.equal(s.w.satRead().workspaceSites.A['domain:example.com'],undefined);assert.equal(s.w.satRead().workspaceSites.B['domain:example.com'],'system');
 assert.equal(s.w.document.querySelectorAll('img').length,0);assert.match(s.w.document.getElementById('sat-saved-choices').textContent,/<img>/);s.close();
});

test('asynchronous native controls stay functional, fold overrides, and restore original order on stop',async()=>{
 const s=setup(),doc=s.w.document,host=doc.querySelector('.sineItemPreferenceDialogContent');
 const ids=['mod-zensiteappearancetoggle-iconset','mod-zensiteappearancetoggle-lighticon','mod-zensiteappearancetoggle-override-moon','mod-zensiteappearancetoggle-override-sparkle','mod-zensiteappearancetoggle-override-sun','svg-context-properties-content-enabled'];
 const rows=ids.map(id=>{const r=doc.createElement('hbox');r.id=id;const control=doc.createElement(id.startsWith('svg')?'checkbox':'menulist');r.append(control);host.append(r);return r;});
 let commands=0;rows[2].firstChild.addEventListener('command',()=>commands++);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.ok(rows[0].closest('#sat-toolbar-icons'),'basic icon row remains visible');
 assert.ok(rows[2].closest('details'),'override folded into advanced');assert.equal(rows[2].closest('details').open,false);
 rows[2].firstChild.dispatchEvent(new s.w.Event('command'));assert.equal(commands,1);
 s.w.__satSettings.stop();assert.deepEqual([...host.children],rows);assert.equal(doc.getElementById('sat-settings-style'),null);s.close();
});

test('private Configure cannot mutate saved appearance or asynchronous native preferences',async()=>{
 const store=policy.emptyStore();store.sites={'domain:example.com':'dark'};
 const s=setup({state:policy.serialize(store).state,privateWindow:true}),doc=s.w.document;
 const row=doc.createElement('hbox');row.id='mod-zensiteappearancetoggle-iconset';const control=doc.createElement('menulist');row.append(control);doc.querySelector('.sineItemPreferenceDialogContent').append(row);
 await new Promise(resolve=>setTimeout(resolve,0));
 const saved=doc.querySelector('[data-sat-scope="site"] select');assert.ok(saved);assert.equal(saved.disabled,true);assert.equal(control.disabled,true);
 control.addEventListener('command',()=>s.write('native-private-fixture','changed'));
 control.dispatchEvent(new s.w.Event('command',{bubbles:true}));
 saved.value='light';saved.dispatchEvent(new s.w.Event('change',{bubbles:true}));s.change('sat-browser-default','1');
 assert.equal(s.writes,0);assert.equal(s.w.satRead().sites['domain:example.com'],'dark');s.close();
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
