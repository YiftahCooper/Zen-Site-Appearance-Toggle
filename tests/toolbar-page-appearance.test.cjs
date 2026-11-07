const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const policy=require('../src/appearance-policy'),{createController}=require('../src/appearance-controller'),{siteAppearanceAction}=require('../src/appearance-site-actions');
const source=fs.readFileSync(require.resolve('../src/appearance-toolbar.js'),'utf8');
const wait=()=>new Promise(r=>setTimeout(r,60));
function fixture(){
 const chrome=new JSDOM('<body><div id="mainPopupSet"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=chrome.window,d=w.document,pages=[];
 Object.defineProperty(d,'readyState',{value:'complete'});d.createXULElement=t=>d.createElement(t);
 let store=policy.emptyStore(),writes=0,changed=()=>{},hook=null,reads=0,watching=true,watches=0,cancelled=0,poll=null;
 const tabs=[],container=d.createElement('div');d.body.append(container);
 function add(style='background:white;color:black',css=''){
  const page=new JSDOM(`<head><style>${css}</style></head><body style="${style}"><main>Content</main></body>`,{url:'https://example'+tabs.length+'.org/',pretendToBeVisual:true});pages.push(page);
  Object.defineProperty(page.window.document,'readyState',{value:'complete'});page.window.document.elementsFromPoint=()=>[page.window.document.querySelector('main'),page.window.document.body,page.window.document.documentElement];
  const tab=d.createElement('div');tab.setAttribute('zen-workspace-id','A');container.append(tab);tab.page=page;
  tab.linkedBrowser={currentURI:{spec:page.window.location.href},webProgress:{isLoadingDocument:false},browsingContext:{prefersColorSchemeOverride:'none',currentWindowGlobal:{}}};tabs.push(tab);return tab;
 }
 const first=add(),second=add('background:#111;color:white');w.gBrowser={tabs,tabContainer:container,selectedTab:first};
 const env={tabs:()=>tabs,selected:()=>w.gBrowser.selectedTab,browsingContext:t=>t.linkedBrowser.browsingContext,context:t=>({workspaceId:'A',site:policy.recogniseSite(t.linkedBrowser.currentURI.spec,{baseDomain:h=>h})}),read:()=>store,write:s=>{store=s;writes++;},scope:()=> 'workspace-site',privateWindow:false,defaultDark:()=>true,systemDark:()=>false,listen:fn=>{changed=fn;return()=>{};},error:e=>{throw e;}};
 w.AppearancePolicy=policy;w.createController=createController;w.satEnvironment=(_,notify)=>({...env,notify});w.startAppearanceFavicons=()=>({stop(){}});
 // The watcher is the real child function; only its debounce is shortened.
 const watchAppearance=t=>{
  if(!watching)throw Error('fixture watcher unavailable');
  watches++;const token={cancelled:false};let abort=null;
  const promise=siteAppearanceAction(t.page.window.document,{operation:'watch-appearance',quiet:10,maxWait:40,isCancelled:()=>token.cancelled,onCancel:f=>abort=f});
  return {promise,cancel:()=>{cancelled++;token.cancelled=true;abort?.();}};
 };
 w.startSiteSetup=()=>({context:()=>null,observeAppearance:async t=>{reads++;return hook?hook(t):siteAppearanceAction(t.page.window.document,{operation:'page-appearance'});},watchAppearance,stop(){}});
 w.SAT_VARIANT='sine';w.getMoonSrc=()=> 'moon';w.getLightSrc=()=> 'light';
 w.CustomizableUI={windows:new Set([w]),AREA_NAVBAR:'navbar',getWidget:()=>null,createWidget:config=>{const btn=d.createElement('button');btn.id=config.id;btn.innerHTML='<img class="toolbarbutton-icon">';d.body.append(btn);},destroyWidget(){}};
 // Settle samples run 50x sooner. The 10 s fallback poll is captured and
 // only runs when a test calls poll(), so every other sample has a cause.
 const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms=0,...args)=>timeout(fn,ms>=100?Math.ceil(ms/50):ms,...args);
 w.setInterval=(fn,ms)=>{assert.equal(ms,10000);poll=fn;return 1;};w.clearInterval=()=>{poll=null;};
 w.eval(source);
 return {w,first,second,add,get api(){return w.__zenSiteAppearanceToggle;},get writes(){return writes},get reads(){return reads},get watches(){return watches},get cancelled(){return cancelled},poll:()=>poll?.(),noWatch:()=>watching=false,icon:()=>d.querySelector('.toolbarbutton-icon').getAttribute('src'),tooltip:()=>d.getElementById('zen-colorscheme-toggle').getAttribute('tooltiptext'),select:t=>{w.gBrowser.selectedTab=t;changed();},change:()=>changed(),hook:f=>hook=f,close:()=>{w.__zenSiteAppearanceToggle?.stop();w.close();for(const p of pages)p.window.close();}};
}
test('an unfamiliar light page shows the light icon under a Dark browser default without saving a choice',async()=>{
 const s=fixture();try{await wait();assert.equal(s.icon(),'light');assert.match(s.tooltip(),/to Dark/);assert.equal(s.writes,0);assert.equal(s.first.linkedBrowser.browsingContext.prefersColorSchemeOverride,'none');}finally{s.close();}
});
test('website own theme changes update the icon and action without changing SAT choices',async()=>{
 // No fallback poll runs in this fixture: the body attribute watcher is the only route.
 const s=fixture();try{await wait();s.first.page.window.document.body.style.background='#111';await wait();assert.equal(s.icon(),'moon');assert.match(s.tooltip(),/to Light/);s.first.page.window.document.body.style.background='white';await wait();assert.equal(s.icon(),'light');assert.equal(s.writes,0);assert.ok(s.watches>=2);}finally{s.close();}
});
test('a toolbar click requests the opposite of the rendered theme',async()=>{
 const s=fixture();try{await wait();await s.api.toggle();assert.equal(s.first.linkedBrowser.browsingContext.prefersColorSchemeOverride,'dark');assert.equal(s.writes,1);}finally{s.close();}
});
test('delayed page results cannot overwrite another tab or a replacement document',async()=>{
 const s=fixture();try{await wait();let finish;s.hook(t=>t===s.first?new Promise(r=>finish=r):Promise.resolve({theme:'dark'}));s.first.linkedBrowser.browsingContext.currentWindowGlobal={};s.change();await wait();s.select(s.second);finish({theme:'light'});await wait();assert.equal(s.icon(),'moon');assert.match(s.tooltip(),/to Light/);
 s.select(s.first);await wait();s.first.linkedBrowser.browsingContext.currentWindowGlobal={};finish({theme:'dark'});s.hook(()=>Promise.resolve({theme:'light'}));s.change();await wait();assert.equal(s.icon(),'light');
 }finally{s.close();}
});
test('uncertain pages identify the fallback instead of claiming a detected theme',async()=>{
 const s=fixture();try{s.hook(()=>Promise.resolve({theme:null,reason:'mixed-or-complex'}));await wait();assert.match(s.tooltip(),/uncertain|not detected/i);assert.equal(s.writes,0);}finally{s.close();}
});
test('pending tabs and stopped toolbar do not keep reading page appearance',async()=>{
 const s=fixture();try{await wait();s.first.setAttribute('pending','true');const before=s.reads;await wait();assert.equal(s.reads,before);s.api.stop();s.first.removeAttribute('pending');await wait();assert.equal(s.reads,before);}finally{s.close();}
});
test('a selected page is not re-sampled without a triggering event',async()=>{
 const s=fixture();try{
  await wait();await wait();const settled=s.reads;assert.ok(settled>=1&&settled<=4,'initial sample plus at most three settle samples');
  await wait();await wait();assert.equal(s.reads,settled);
  // An unrelated page change outside <html>/<body> attributes is not observed.
  s.first.page.window.document.querySelector('main').textContent='Changed';await wait();assert.equal(s.reads,settled);
 }finally{s.close();}
});
test('a website theme switch on the html element is followed through the page watcher',async()=>{
 const s=fixture();try{
  const css='body{background:white;color:black}html[data-theme=dark] body{background:#111;color:#eee}';
  const tab=s.add('',css);s.select(tab);await wait();await wait();assert.equal(s.icon(),'light');
  const before=s.reads;tab.page.window.document.documentElement.dataset.theme='dark';await wait();
  assert.equal(s.icon(),'moon');assert.match(s.tooltip(),/to Light/);assert.ok(s.reads>before&&s.reads<=before+3,'one change costs a sample and at most a settle sample');
  delete tab.page.window.document.documentElement.dataset.theme;await wait();assert.equal(s.icon(),'light');assert.equal(s.writes,0);
 }finally{s.close();}
});
test('selection changes cancel the previous page watch and background pages are not sampled',async()=>{
 const s=fixture();try{
  await wait();await wait();const watched=s.watches;s.select(s.second);await wait();await wait();
  assert.ok(s.cancelled>=1);assert.ok(s.watches>watched);assert.equal(s.icon(),'moon');
  const before=s.reads;s.first.page.window.document.body.style.background='#222';await wait();await wait();assert.equal(s.reads,before);assert.equal(s.icon(),'moon');
 }finally{s.close();}
});
test('the slow fallback samples only an active visible window',async()=>{
 const s=fixture();try{
  s.noWatch();const tab=s.add('','body{background:white;color:black}'),style=tab.page.window.document.querySelector('style');
  s.select(tab);await wait();await wait();assert.equal(s.icon(),'light');
  style.textContent='body{background:#111;color:#eee}';await wait();assert.equal(s.icon(),'light','a stylesheet repaint has no cheap signal');
  s.w.dispatchEvent(new s.w.Event('deactivate'));let before=s.reads;s.poll();await wait();assert.equal(s.reads,before);assert.equal(s.icon(),'light');
  s.w.dispatchEvent(new s.w.Event('activate'));await wait();assert.equal(s.icon(),'moon','activation takes a fresh sample');
  style.textContent='body{background:white;color:black}';Object.defineProperty(s.w.document,'hidden',{value:true,configurable:true});before=s.reads;s.poll();await wait();assert.equal(s.reads,before);
  Object.defineProperty(s.w.document,'hidden',{value:false,configurable:true});s.poll();await wait();assert.equal(s.icon(),'light');
 }finally{s.close();}
});
test('unchanged toolbar state writes no attributes',async()=>{
 const s=fixture();try{
  await wait();await wait();const button=s.w.document.getElementById('zen-colorscheme-toggle');
  const records=[];const observer=new s.w.MutationObserver(list=>records.push(...list));observer.observe(button,{attributes:true,subtree:true});
  for(let i=0;i<5;i++)s.api.refresh();s.change();await wait();observer.disconnect();assert.deepEqual(records.map(r=>r.attributeName),[]);
 }finally{s.close();}
});
