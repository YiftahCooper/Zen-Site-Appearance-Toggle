const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const root=path.resolve(__dirname,'..'),PREF='layout.css.prefers-color-scheme.content-override',PREFIX='mod.zensiteappearancetoggle.';
const sources=['sine/JS/zen-colorscheme-toggle.uc.js','chrome/JS/moon-sparkle/zen-colorscheme-toggle-sparkle.uc.js','chrome/JS/moon-sun/zen-colorscheme-toggle-sun.uc.js'];
const flush=()=>new Promise(r=>setTimeout(r,10));
function environment(source,{shared,workspace='A',essential=false,zen=true}={}){
 shared??={prefs:new Map([[PREF,1]]),observers:new Set(),windows:new Set(),widget:null,writes:[]};
 const dom=new JSDOM('<body><div id="mainPopupSet"></div></body>',{runScripts:'outside-only'}),w=dom.window,doc=w.document,themeObservers=new Set();
 doc.createXULElement=tag=>doc.createElement(tag);const changes=new Set();
 const makeTab=(url,ws)=>{const t=doc.createElement('div');if(ws)t.setAttribute('zen-workspace-id',ws);t.linkedBrowser={currentURI:{spec:url},browsingContext:{prefersColorSchemeOverride:'none'}};return t;};
 const tab=makeTab('https://example.com',workspace),other=makeTab('https://other.net','B');if(essential){tab.removeAttribute('zen-workspace-id');tab.setAttribute('zen-essential','true');}
 const tabContainer=doc.createElement('div');doc.body.appendChild(tabContainer);tabContainer.append(tab,other);
 w.gBrowser={tabs:[tab,other],selectedTab:tab,tabContainer,addTabsProgressListener(){},removeTabsProgressListener(){}};
 w.gZenWorkspaces={activeWorkspace:workspace,promiseInitialized:Promise.resolve(),addChangeListeners:f=>changes.add(f),removeChangeListeners:f=>changes.delete(f)};
 if(!zen)delete w.gZenWorkspaces;
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 const change=(key,value)=>{shared.prefs.set(key,value);shared.writes.push([key,value]);for(const o of shared.observers)if(key.startsWith(o.key))o.fn();};
 w.Services={eTLD:{getBaseDomainFromHost:h=>h.split('.').slice(-2).join('.')},prefs:{getIntPref:(k,d)=>shared.prefs.get(k)??d,getStringPref:(k,d)=>shared.prefs.get(k)??d,setIntPref:change,setStringPref:change,addObserver:(key,fn)=>shared.observers.add({key,fn}),removeObserver:(key,fn)=>{for(const o of shared.observers)if(o.key===key&&o.fn===fn)shared.observers.delete(o);}}};
 w.ChromeUtils={generateQI:()=>()=>{},importESModule:()=>({PrivateBrowsingUtils:{isWindowPrivate:()=>false}})};
 w.Services.obs={addObserver:f=>themeObservers.add(f),removeObserver:f=>themeObservers.delete(f)};
 shared.windows.add(w);
 function button(win){const b=win.document.createElement('button');b.id='zen-colorscheme-toggle';b.innerHTML='<img class="toolbarbutton-icon">';win.document.body.appendChild(b);shared.widget.onCreated?.(b);}
 w.CustomizableUI=Object.freeze({AREA_NAVBAR:'navbar',windows:shared.windows,getWidget:()=>shared.widget,createWidget:config=>{assert.equal(shared.widget,null);shared.widget={...config,source:'api'};for(const win of shared.windows)button(win);},destroyWidget:()=>{for(const win of shared.windows)win.document.getElementById('zen-colorscheme-toggle')?.remove();shared.widget=null;}});
 if(shared.widget)button(w);
 w.eval(fs.readFileSync(path.join(root,source),'utf8'));
 return {w,tab,other,shared,change,themeObservers,themeChanged:()=>{for(const f of themeObservers)f();},api:()=>w.__zenSiteAppearanceToggle,
 click:()=>shared.widget.onCommand({target:doc.getElementById('zen-colorscheme-toggle')}),
 switchTo:id=>{w.gZenWorkspaces.activeWorkspace=id;for(const fn of changes)fn();},
 close:()=>{w.__zenSiteAppearanceToggle?.stop?.();shared.windows.delete(w);w.close();}};
}
for(const source of sources){
 test(source+': legacy browser-theme default toggles from the actual content appearance',async()=>{
  const e=environment(source);try{await flush();
   e.w.Services.appinfo={contentThemeDerivedColorSchemeIsDark:true};e.change(PREF,3);await flush();
   assert.equal(e.api().controller.effectiveDark(),true);
   assert.match(e.w.document.getElementById('zen-colorscheme-toggle').getAttribute('tooltiptext'),/to Light/);
   e.w.Services.appinfo.contentThemeDerivedColorSchemeIsDark=false;e.themeChanged();await flush();
   assert.match(e.w.document.getElementById('zen-colorscheme-toggle').getAttribute('tooltiptext'),/to Dark/);
   e.w.Services.appinfo.contentThemeDerivedColorSchemeIsDark=true;e.themeChanged();await flush();
   e.click();assert.equal(e.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'light');
  }finally{e.close();}
 });
 test(source+': without Zen workspaces the saved choice is per site',async()=>{
  const e=environment(source,{zen:false});try{await flush();assert.equal(e.api().controller.currentContext().scope,'site');e.click();
   assert.equal(e.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'dark');
   assert.equal(JSON.parse(e.shared.prefs.get(PREFIX+'state')).sites['domain:example.com'],'dark');
   assert.equal(e.shared.prefs.has(PREFIX+'workspacemap'),false);
  }finally{e.close();}
 });
 test(source+': unresolved ordinary workspace cannot save against the active workspace',async()=>{
  const e=environment(source);try{await flush();e.tab.removeAttribute('zen-workspace-id');
  assert.equal(e.api().controller.currentContext().workspaceId,null);assert.throws(()=>e.api().controller.choose('dark'));
  assert.equal(e.shared.prefs.has(PREFIX+'workspacemap'),false);
  e.tab.setAttribute('zen-workspace-id','B');e.api().controller.choose('dark');assert.equal(JSON.parse(e.shared.prefs.get(PREFIX+'workspacemap')).B,2);
  }finally{e.close();}
 });
 test(source+': selection and Essential switches preserve native default',async()=>{
  const e=environment(source,{essential:true});try{await flush();e.click();await flush();assert.equal(e.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'dark');
  for(let i=0;i<3;i++)e.w.gBrowser.tabContainer.dispatchEvent(new e.w.Event('TabSelect'));await flush();assert.equal(e.shared.prefs.get(PREF),1);
  e.switchTo('B');await flush();assert.equal(e.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'none');e.switchTo('A');await flush();assert.equal(e.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'dark');
  assert.equal(e.shared.writes.filter(([k])=>k===PREF).length,0);}finally{e.close();}
 });
 test(source+': additional windows route commands to the owner and share saved choices',async()=>{
  const a=environment(source);await flush();const b=environment(source,{shared:a.shared,workspace:'B',essential:true});
  try{await flush();b.click();await flush();assert.equal(b.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'dark');assert.equal(a.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'none');assert.equal(a.other.linkedBrowser.browsingContext.prefersColorSchemeOverride,'dark');}
  finally{b.close();a.close();}
 });
 test(source+': mode changes retain choices and saved site follows navigation',async()=>{
  const e=environment(source);try{await flush();e.click();e.change(PREFIX+'scope','site');await flush();assert.equal(e.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'none');
  e.click();await flush();e.tab.linkedBrowser.currentURI.spec='https://other.net';e.api().controller.refresh();assert.equal(e.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'none');
  e.tab.linkedBrowser.currentURI.spec='https://example.com/another?q=x';e.api().controller.refresh();assert.equal(e.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'dark');}finally{e.close();}
 });
 test(source+': unload removes overrides, observers and widget',async()=>{
  const e=environment(source);try{await flush();e.click();e.api().stop();assert.equal(e.tab.linkedBrowser.browsingContext.prefersColorSchemeOverride,'none');assert.equal(e.shared.observers.size,0);assert.equal(e.themeObservers.size,0);assert.equal(e.shared.widget,null);}finally{e.close();}
 });
}
