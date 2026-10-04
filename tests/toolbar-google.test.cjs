const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const AppearancePolicy=require('../src/appearance-policy'),{createController}=require('../src/appearance-controller');
const source=fs.readFileSync(path.join(__dirname,'../src/appearance-toolbar.js'),'utf8');
const flush=()=>new Promise(r=>setTimeout(r,15));
function setup({scope='site',savedChoice=null}={}){
 const dom=new JSDOM('<body><div id="mainPopupSet"></div></body>',{runScripts:'outside-only'}),w=dom.window,doc=w.document;
 Object.defineProperty(doc,'readyState',{value:'complete'});doc.createXULElement=t=>{const el=doc.createElement(t);if(t==='menupopup')el.openPopupAtScreen=()=>{};return el;};
 let store=AppearancePolicy.emptyStore(),defaultDark=false,systemDark=false,workspace='A',change=()=>{},ensureError=null,repaintHook=null,verifyHook=null,healthy=true;
 const calls=[],verifications=[],ensures=[],copies=[],drafts=new WeakMap(),tabs=[],container=doc.createElement('div');doc.body.appendChild(container);
 function add(url='https://www.google.com/search?q=fixture&tbm=isch&authuser=1',essential=false){const t=doc.createElement('div');container.appendChild(t);t.linkedBrowser={currentURI:{spec:url},webProgress:{isLoadingDocument:false},browsingContext:{prefersColorSchemeOverride:'none',currentWindowGlobal:{}}};if(essential)t.setAttribute('zen-essential','true');else t.setAttribute('zen-workspace-id','A');tabs.push(t);return t;}
 const tab=add(),other=add('https://www.google.com/search?q=untouched&authuser=1');w.gBrowser={tabs,tabContainer:container,selectedTab:tab};
 if(savedChoice)store=AppearancePolicy.setChoice(store,{scope,workspaceId:'A',siteKey:AppearancePolicy.recogniseSite(tab.linkedBrowser.currentURI.spec,{baseDomain:h=>h==='www.google.com'?'google.com':h}).key},savedChoice);
 w.gZenWorkspaces={get activeWorkspace(){return workspace;}};
 const context=t=>{const u=new URL(t.linkedBrowser.currentURI.spec);return ['www.google.com','google.com','images.google.com'].includes(u.hostname)?{id:'google-search:0:'+(u.searchParams.get('authuser')||''),service:'google-search',href:u.href}:u.hostname==='gemini.google.com'?{id:'gemini:0',service:'gemini',href:u.href}:null;};
 const siteSetup={context,async ensure(t){ensures.push(t);if(ensureError)throw Error(ensureError);return null;},async verifyGoogle(t,dark){verifications.push({tab:t,dark,document:t.linkedBrowser.browsingContext.currentWindowGlobal});return verifyHook?verifyHook(t,dark):healthy;},async repaintGoogle(t,dark){if(context(t)?.service!=='google-search')return;calls.push({tab:t,dark,url:t.linkedBrowser.currentURI.spec});if(repaintHook)return repaintHook(t,dark);},stop(){}};
 const env={tabs:()=>tabs,selected:()=>w.gBrowser.selectedTab,browsingContext:t=>t.hasAttribute('pending')?null:t.linkedBrowser.browsingContext,
  context(t){return {workspaceId:t.hasAttribute('zen-essential')?workspace:t.getAttribute('zen-workspace-id'),site:AppearancePolicy.recogniseSite(t.linkedBrowser.currentURI.spec,{baseDomain:h=>h==='www.google.com'?'google.com':h})};},
  read:()=>store,write:s=>store=s,scope:()=>scope,privateWindow:false,defaultDark:()=>defaultDark,systemDark:()=>systemDark,listen:fn=>{change=fn;return()=>change=()=>{};},error:e=>{throw e;}};
 siteSetup.pendingGoogleDraft=t=>drafts.get(t);w.Ci={nsIClipboardHelper:{}};w.Cc={'@mozilla.org/widget/clipboardhelper;1':{getService(i){assert.equal(i,w.Ci.nsIClipboardHelper);return {copyString:text=>copies.push(text)};}}};
 w.AppearancePolicy=AppearancePolicy;w.createController=createController;w.satEnvironment=(_,notify)=>({...env,notify});w.startAppearanceFavicons=()=>({stop(){}});w.startSiteSetup=()=>siteSetup;
 w.SAT_VARIANT='sine';for(const name of ['getMoonSrc','getLightSrc'])w[name]=()=>name;for(const name of ['ORIG_SUN','ORIG_SPARKLE','ORIG_MOON'])w[name]=name;
 let widget=null;w.CustomizableUI={windows:new Set([w]),AREA_NAVBAR:'navbar',getWidget:()=>widget,createWidget:c=>{widget={source:'api'};const b=doc.createElement('button');b.id=c.id;b.innerHTML='<img class="toolbarbutton-icon">';doc.body.appendChild(b);},destroyWidget:()=>{doc.getElementById('zen-colorscheme-toggle')?.remove();widget=null;}};
 w.eval(source);
 return {w,tab,other,add,calls,verifications,ensures,copies,draft:(t,text)=>drafts.set(t,text),menu:()=>{doc.getElementById('zen-colorscheme-toggle').dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));return doc.getElementById('sat-appearance-menu');},get api(){return w.__zenSiteAppearanceToggle;},context,change:()=>change(),default:v=>{defaultDark=v;change();},system:v=>{systemDark=v;change();},workspace:v=>{workspace=v;change();},failEnsure:v=>ensureError=v,onRepaint:f=>repaintHook=f,onVerify:f=>verifyHook=f,healthy:v=>healthy=v,newDocument:()=>{tab.linkedBrowser.browsingContext.currentWindowGlobal={};change();},restart:()=>w.eval(source),close:()=>{w.__zenSiteAppearanceToggle?.stop();w.close();}};
}
test('Use browser default repaints a Google tab previously touched by this runtime',async()=>{
 const s=setup();try{await s.api.choose('dark');await s.api.choose('inherit');await flush();assert.deepEqual(s.calls.map(c=>c.dark),[true,false]);assert.equal(s.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'none');}finally{s.close();}
});
test('native default and System changes reconcile the selected touched Google tab once',async()=>{
 const s=setup();try{await s.api.choose('dark');await s.api.choose('inherit');await flush();s.default(true);await flush();s.change();s.change();await flush();assert.deepEqual(s.calls.map(c=>c.dark),[true,false,true]);await s.api.choose('system');s.system(true);await flush();assert.deepEqual(s.calls.map(c=>c.dark),[true,false,true,false,true]);}finally{s.close();}
});
test('a touched shared Google Essential reconciles actual workspace appearance changes',async()=>{
 const s=setup({scope:'workspace-site'});try{s.tab.setAttribute('zen-essential','true');await s.api.choose('dark');s.workspace('B');await flush();assert.deepEqual(s.calls.map(c=>c.dark),[true,false]);s.workspace('A');await flush();assert.deepEqual(s.calls.map(c=>c.dark),[true,false,true]);}finally{s.close();}
});
test('initial, failed-setup, untouched, background and non Google tabs never automatically repaint',async()=>{
 const s=setup();try{s.default(true);await flush();assert.equal(s.calls.length,0);s.failEnsure('fixture setup rejected');await s.api.choose('light');s.default(false);await flush();assert.equal(s.calls.length,0);s.failEnsure(null);await s.api.choose('dark');s.w.gBrowser.selectedTab=s.other;s.change();s.default(true);await flush();assert.equal(s.calls.length,1);s.w.gBrowser.selectedTab=s.add('https://example.com/');s.change();await flush();assert.equal(s.calls.length,1);s.w.gBrowser.selectedTab=s.add('https://gemini.google.com/');await s.api.choose('light');s.default(false);await flush();assert.equal(s.calls.length,1);}finally{s.close();}
});
test('pending disconnected loading and closing Google tabs are not reconciled or awakened',async()=>{
 const s=setup();try{await s.api.choose('dark');await s.api.choose('inherit');await flush();const count=s.calls.length;s.tab.setAttribute('pending','true');Object.defineProperty(s.tab.linkedBrowser,'browsingContext',{get(){throw Error('unloaded context was accessed');},configurable:true});s.default(true);await flush();assert.equal(s.calls.length,count);Object.defineProperty(s.tab.linkedBrowser,'browsingContext',{value:{prefersColorSchemeOverride:'none',currentWindowGlobal:{}},configurable:true});s.tab.removeAttribute('pending');s.tab.linkedBrowser.webProgress.isLoadingDocument=true;s.change();await flush();assert.equal(s.calls.length,count);s.tab.linkedBrowser.webProgress.isLoadingDocument=false;s.tab.closing=true;s.change();await flush();assert.equal(s.calls.length,count);s.tab.closing=false;s.tab.remove();s.change();await flush();assert.equal(s.calls.length,count);}finally{s.close();}
});
test('own Google navigation notifications cannot trigger a repaint loop or leak account ownership',async()=>{
 const s=setup();try{s.onRepaint((t,dark)=>{const u=new URL(t.linkedBrowser.currentURI.spec);u.searchParams.set('cs',dark?'2':'1');t.linkedBrowser.currentURI.spec=u.href;s.change();});await s.api.choose('dark');await s.api.choose('inherit');await flush();assert.deepEqual(s.calls.map(c=>c.dark),[true,false]);for(let i=0;i<5;i++)s.change();await flush();assert.equal(s.calls.length,2);s.tab.linkedBrowser.currentURI.spec='https://www.google.com/search?q=other-account&authuser=2';s.default(true);await flush();assert.equal(s.calls.length,2);}finally{s.close();}
});
test('stop removes queued reconciliation and cannot dispatch after a selection change',async()=>{
 const s=setup();try{await s.api.choose('dark');await s.api.choose('inherit');await flush();const count=s.calls.length;s.default(true);s.w.gBrowser.selectedTab=s.other;await flush();assert.equal(s.calls.length,count);s.w.gBrowser.selectedTab=s.tab;s.change();s.api.stop();await flush();assert.equal(s.calls.length,count);}finally{s.close();}
});
test('failed automatic repaint reports once without a navigation retry storm',async()=>{
 const s=setup();try{await s.api.choose('dark');await s.api.choose('inherit');await flush();s.onRepaint(()=>Promise.reject(Error('fixture transport failed')));s.default(true);await flush();assert.equal(s.w.__satError,'fixture transport failed');const count=s.calls.length;for(let i=0;i<5;i++)s.change();await flush();assert.equal(s.calls.length,count);}finally{s.close();}
});
test('saved Dark choice startup verifies stale Google then repaints without website setup',async()=>{
 const s=setup({savedChoice:'dark'});try{s.healthy(false);await flush();assert.equal(s.verifications.length,1);assert.deepEqual(s.calls.map(c=>c.dark),[true]);assert.equal(s.ensures.length,0);}finally{s.close();}
});
test('fresh healthy saved-choice documents and runtime restart verify without reloading',async()=>{
 const s=setup({savedChoice:'dark'});try{await flush();assert.equal(s.verifications.length,1);assert.equal(s.calls.length,0);s.newDocument();await flush();assert.equal(s.verifications.length,2);s.restart();await flush();assert.equal(s.verifications.length,3);assert.equal(s.calls.length,0);assert.equal(s.ensures.length,0);}finally{s.close();}
});
test('discarded Google restored as a stale new document repaints once despite unchanged Dark',async()=>{
 const s=setup();try{await s.api.choose('dark');const count=s.calls.length;s.tab.setAttribute('pending','true');s.change();await flush();assert.equal(s.verifications.length,0);s.tab.removeAttribute('pending');s.healthy(false);s.onRepaint(()=>s.newDocument());s.newDocument();await flush();assert.equal(s.verifications.length,1);assert.equal(s.calls.length,count+1);for(let i=0;i<5;i++)s.change();await flush();assert.equal(s.calls.length,count+1);}finally{s.close();}
});
test('untouched inheritance and background or pending saved-choice tabs stay excluded from verification',async()=>{
 const s=setup();try{s.newDocument();await flush();assert.equal(s.verifications.length,0);assert.equal(s.calls.length,0);}finally{s.close();}
 const p=setup({savedChoice:'dark'});try{p.tab.setAttribute('pending','true');p.w.gBrowser.selectedTab=p.other;p.other.setAttribute('pending','true');p.change();await flush();assert.equal(p.verifications.length,0);assert.equal(p.calls.length,0);}finally{p.close();}
});
test('failed fresh-document verification reports once per document and colour without storms',async()=>{
 const s=setup({savedChoice:'dark'});try{s.onVerify(()=>Promise.reject(Error('fixture verification failed')));await flush();assert.equal(s.w.__satError,'fixture verification failed');assert.equal(s.verifications.length,1);for(let i=0;i<5;i++)s.change();await flush();assert.equal(s.verifications.length,1);s.newDocument();await flush();assert.equal(s.verifications.length,2);assert.equal(s.calls.length,0);}finally{s.close();}
});
test('failed repaint on a departing Google query cannot suppress verification of its replacement',async()=>{
 const s=setup({savedChoice:'dark'});try{
 s.healthy(false);let first=true;
 s.onRepaint(t=>{if(first){first=false;t.linkedBrowser.currentURI.spec='https://www.google.com/search?q=user-navigation&authuser=1';s.newDocument();throw Error('The selected Google page changed');}});
 await flush();await flush();assert.equal(s.verifications.length,2);assert.equal(s.calls.length,2);
 }finally{s.close();}
});
test('only renderable Google search paths reconcile and preferences never verify or repaint',async()=>{
 const s=setup({savedChoice:'dark'});try{
  s.tab.linkedBrowser.currentURI.spec='https://www.google.com/preferences?authuser=1';s.change();await flush();assert.equal(s.verifications.length,0);assert.equal(s.calls.length,0);
  for(const pathname of ['/','/search','/webhp','/imghp']){s.tab.linkedBrowser.currentURI.spec='https://www.google.com'+pathname+'?authuser=1';s.newDocument();await flush();}
  assert.equal(s.verifications.length,4);assert.equal(s.calls.length,0);
  s.tab.linkedBrowser.currentURI.spec='https://www.google.com/preferences?authuser=1';s.newDocument();s.default(true);await flush();assert.equal(s.verifications.length,4);assert.equal(s.calls.length,0);
 }finally{s.close();}
});
test('recovery menu copies only the current selected retained Google draft on explicit command',async()=>{
 const s=setup();try{
  assert.equal(s.menu().querySelector('#sat-copy-google-draft'),null);
  s.draft(s.tab,'unsubmitted search');s.w.__satError='fixture restore failed';s.api.refresh();
  const menu=s.menu(),item=menu.querySelector('#sat-copy-google-draft');assert.ok(item);assert.equal(item.getAttribute('label'),'Copy unsent Google search');assert.equal(menu.querySelectorAll('[type="radio"]').length,4);
  assert.match(s.w.document.getElementById('zen-colorscheme-toggle').getAttribute('tooltiptext'),/unsent Google search/);assert.deepEqual(s.copies,[]);
  s.draft(s.tab,'updated retained search');item.dispatchEvent(new s.w.Event('command'));assert.deepEqual(s.copies,['updated retained search']);
  s.draft(s.tab,undefined);item.dispatchEvent(new s.w.Event('command'));assert.equal(s.copies.length,1);assert.equal(s.menu().querySelector('#sat-copy-google-draft'),null);
  s.draft(s.tab,'previous tab search');const oldItem=s.menu().querySelector('#sat-copy-google-draft');s.w.gBrowser.selectedTab=s.other;oldItem.dispatchEvent(new s.w.Event('command'));assert.equal(s.copies.length,1);
  s.draft(s.other,'current tab search');oldItem.dispatchEvent(new s.w.Event('command'));assert.deepEqual(s.copies,['updated retained search','current tab search']);
  s.api.stop();oldItem.dispatchEvent(new s.w.Event('command'));assert.equal(s.copies.length,2);
 }finally{s.close();}
});
