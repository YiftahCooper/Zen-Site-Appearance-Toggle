const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const root=path.resolve(__dirname,'..'),PREF='layout.css.prefers-color-scheme.content-override',PREFIX='mod.zensiteappearancetoggle.';
const source=fs.readFileSync(path.join(root,'sine/JS/zen-colorscheme-toggle.uc.js'),'utf8');
const flush=()=>new Promise(r=>setTimeout(r,10));
const COUNT=300,STOP_WINDOW=0x10|0x80000,STOP_REQUEST=0x10|0x10000;
// A generated Sine window with 300 tabs. Every tab records each linkedBrowser
// read, so a test can prove which tabs a notification actually touched.
function windowWithTabs(){
 const dom=new JSDOM('<body><div id="mainPopupSet"></div></body>',{runScripts:'outside-only'}),w=dom.window,doc=w.document;
 doc.createXULElement=tag=>doc.createElement(tag);
 const state=JSON.stringify({version:1,sites:{},workspaceSites:{A:{'domain:site150.com':'dark'}},groups:{}});
 const prefs=new Map([[PREF,1],[PREFIX+'scope','workspace-site'],[PREFIX+'state',state]]),observers=new Set();
 const touched=new Map(),tabs=[],browsers=[],byBrowser=new Map(),container=doc.createElement('div');doc.body.append(container);
 for(let i=0;i<COUNT;i++){
  const tab=doc.createElement('div');tab.setAttribute('zen-workspace-id','A');tab.index=i;
  const browser={currentURI:{spec:`https://site${i}.com/page`},webProgress:{isLoadingDocument:false},browsingContext:{prefersColorSchemeOverride:'none'}};
  Object.defineProperty(tab,'linkedBrowser',{get(){touched.set(i,(touched.get(i)||0)+1);return browser;}});
  container.append(tab);tabs.push(tab);browsers.push(browser);byBrowser.set(browser,tab);
 }
 let progress=null,etld=0,parses=0;
 w.gBrowser={tabs,selectedTab:tabs[0],tabContainer:container,addTabsProgressListener:l=>progress=l,removeTabsProgressListener(){},getTabForBrowser:b=>byBrowser.get(b)||null};
 w.gZenWorkspaces={activeWorkspace:'A',addChangeListeners(){},removeChangeListeners(){}};
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 const setPref=(key,value)=>{prefs.set(key,value);for(const o of observers)if(key.startsWith(o.key))o.fn();};
 w.Services={eTLD:{getBaseDomainFromHost:h=>{etld++;return h.split('.').slice(-2).join('.');}},obs:{addObserver(){},removeObserver(){}},
  prefs:{getIntPref:(k,d)=>prefs.get(k)??d,getStringPref:(k,d)=>prefs.get(k)??d,setIntPref:setPref,setStringPref:setPref,addObserver:(key,fn)=>observers.add({key,fn}),removeObserver:(key,fn)=>{for(const o of observers)if(o.key===key&&o.fn===fn)observers.delete(o);}}};
 w.ChromeUtils={generateQI:()=>()=>{},importESModule:()=>({PrivateBrowsingUtils:{isWindowPrivate:()=>false}})};
 let widget=null;const windows=new Set([w]);
 w.CustomizableUI=Object.freeze({AREA_NAVBAR:'navbar',windows,getWidget:()=>widget,createWidget:config=>{widget={...config,source:'api'};const b=doc.createElement('button');b.id='zen-colorscheme-toggle';b.innerHTML='<img class="toolbarbutton-icon">';doc.body.append(b);},destroyWidget:()=>{widget=null;}});
 const parse=w.JSON.parse;w.JSON.parse=(text,...rest)=>{if(text===prefs.get(PREFIX+'state'))parses++;return parse(text,...rest);};
 w.eval(source);
 const reset=()=>{touched.clear();etld=0;parses=0;};
 return {w,tabs,prefs,setPref,reset,browser:i=>browsers[i],
  get progress(){return progress},get touched(){return [...touched.keys()].sort((a,b)=>a-b)},get etld(){return etld},get parses(){return parses},
  attr:(i,changed)=>tabs[i].dispatchEvent(new w.CustomEvent('TabAttrModified',{bubbles:true,detail:{changed}})),
  override:i=>browsers[i].browsingContext.prefersColorSchemeOverride,
  close:()=>{w.__zenSiteAppearanceToggle?.stop?.();w.close();}};
}
test('300 tabs: a background tab title, icon or progress change touches no tab and parses nothing',async()=>{
 const s=windowWithTabs();try{
  await flush();assert.equal(s.override(150),'dark');assert.equal(s.override(149),'none');s.reset();
  for(const changed of [['label'],['image'],['progress'],['soundplaying'],['label','image']])s.attr(200,changed);
  await flush();assert.deepEqual(s.touched,[]);assert.equal(s.parses,0);assert.equal(s.etld,0);
 }finally{s.close();}
});
test('300 tabs: a relevant background tab change refreshes only that tab without re-parsing or re-recognising',async()=>{
 const s=windowWithTabs();try{
  await flush();s.reset();
  s.attr(200,['pending']);s.attr(200,['busy']);await flush();
  assert.deepEqual(s.touched,[200]);assert.equal(s.parses,0);assert.equal(s.etld,0);
 }finally{s.close();}
});
test('300 tabs: progress notifications are limited to top-level document changes of their own tab',async()=>{
 const s=windowWithTabs();try{
  await flush();s.reset();const b150=s.browser(150);
  s.progress.onStateChange(b150,{isTopLevel:true},null,STOP_REQUEST,0);
  s.progress.onStateChange(b150,{isTopLevel:false},null,STOP_WINDOW,0);
  s.progress.onLocationChange(b150,{isTopLevel:false},null,{},0);
  await flush();assert.deepEqual(s.touched,[]);
  s.progress.onStateChange(b150,{isTopLevel:true},null,STOP_WINDOW,0);await flush();assert.deepEqual(s.touched,[150]);assert.equal(s.override(150),'dark');
  // Navigation away and back resolves only the navigating tab.
  s.reset();b150.currentURI.spec='https://site151.com/';s.progress.onLocationChange(b150,{isTopLevel:true},null,{},0);await flush();
  assert.deepEqual(s.touched,[150]);assert.equal(s.override(150),'none');assert.equal(s.parses,0);assert.ok(s.etld<=1);
  const b151=s.browser(151);b151.currentURI.spec='https://site150.com/other';s.reset();s.progress.onLocationChange(b151,{isTopLevel:true},null,{},0);await flush();
  assert.deepEqual(s.touched,[151]);assert.equal(s.override(151),'dark');
 }finally{s.close();}
});
test('300 tabs: closing an overridden tab restores only that tab and a replaced context is released',async()=>{
 const s=windowWithTabs();try{
  await flush();const b150=s.browser(150),old=b150.browsingContext;
  b150.browsingContext={prefersColorSchemeOverride:'none'};s.reset();s.attr(150,['pending']);await flush();
  assert.deepEqual(s.touched,[150]);assert.equal(old.prefersColorSchemeOverride,'none');assert.equal(b150.browsingContext.prefersColorSchemeOverride,'dark');
  s.reset();const tab=s.tabs[150];tab.closing=true;tab.dispatchEvent(new s.w.Event('TabClose',{bubbles:true}));tab.remove();await flush();
  assert.deepEqual(s.touched,[150]);assert.equal(b150.browsingContext.prefersColorSchemeOverride,'none');
 }finally{s.close();}
});
test('300 tabs: a saved-choice change refreshes every tab with one parse of the stored JSON',async()=>{
 const s=windowWithTabs();try{
  await flush();s.reset();
  s.setPref(PREFIX+'state',JSON.stringify({version:1,sites:{},workspaceSites:{A:{'domain:site150.com':'dark','domain:site10.com':'light'}},groups:{}}));
  await flush();assert.equal(s.parses,1);assert.equal(s.touched.length,COUNT);assert.equal(s.override(10),'light');assert.equal(s.override(150),'dark');
  // A full refresh after a store change recognises each tab's site once; later reads reuse it.
  assert.ok(s.etld<=COUNT);s.reset();s.w.__zenSiteAppearanceToggle.controller.refresh();assert.equal(s.parses,0);assert.equal(s.etld,0);
 }finally{s.close();}
});
