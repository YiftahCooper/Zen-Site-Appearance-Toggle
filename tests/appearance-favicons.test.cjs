const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let startAppearanceFavicons;
try{({startAppearanceFavicons}=require('../src/appearance-favicons'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const svg=fs.readFileSync(path.join(__dirname,'fixtures/github-stock-light.svg'),'utf8');
const white=fs.readFileSync(path.join(__dirname,'fixtures/github-stock-dark.svg'),'utf8');
const uri=s=>'data:image/svg+xml;base64,'+Buffer.from(s).toString('base64');
class Target{constructor(){this.events=new Map();}addEventListener(k,f){if(!this.events.has(k))this.events.set(k,new Set());this.events.get(k).add(f);}removeEventListener(k,f){this.events.get(k)?.delete(f);}fire(k){for(const f of this.events.get(k)||[])f({type:k});}}
class Style{constructor(){this.values=new Map();}setProperty(k,v,p=''){if(v)this.values.set(k,[v,p]);else this.values.delete(k);}removeProperty(k){this.values.delete(k);}getPropertyValue(k){return this.values.get(k)?.[0]||'';}getPropertyPriority(k){return this.values.get(k)?.[1]||'';}}
function setup({shared,filter='opacity(0.8)',priority='important',scheme='dark',url='https://github.com/octocat/Hello-World',source=uri(svg)}={}){
 const observers=[],microtasks=[],win=new Target(),container=new Target(),root=new Target();
 Object.assign(win,{URL,atob:s=>Buffer.from(s,'base64').toString('binary'),TextDecoder,Uint8Array,queueMicrotask:f=>microtasks.push(f),getComputedStyle:e=>({colorScheme:e.scheme||scheme})});
 win.document={documentElement:root,defaultView:win};win.CustomizableUI={windows:shared||new Set([win])};win.CustomizableUI.windows.add(win);
 win.MutationObserver=class{constructor(f){this.f=f;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
 const media=new Target();media.matches=false;win.matchMedia=()=>media;
 const preferences=new Set(),obs=new Set();win.Services={prefs:{addObserver:(k,f)=>preferences.add(f),removeObserver:(k,f)=>preferences.delete(f)},obs:{addObserver:f=>obs.add(f),removeObserver:f=>obs.delete(f)}};
 const progress=new Set();win.gBrowser={tabs:[],tabContainer:container,addTabsProgressListener:f=>progress.add(f),removeTabsProgressListener:f=>progress.delete(f)};
 function tab(u=url,s=source){const attrs=new Map([['image',s],['pending','true']]),imageAttrs=new Map([['src',s]]);
  const image={style:new Style(),ownerDocument:win.document,getAttribute:k=>imageAttrs.get(k)||null,setAttribute:(k,v)=>imageAttrs.set(k,v),removeAttribute:k=>imageAttrs.delete(k)};
  image.style.setProperty('filter',filter,priority);
  const browser={currentURI:{spec:u},mIconURL:s};Object.defineProperty(browser,'browsingContext',{get(){throw Error('must not access pending browsing context');}});
  const t={linkedBrowser:browser,iconImage:image,ownerDocument:win.document,getAttribute:k=>attrs.get(k)||null,setAttribute:(k,v)=>attrs.set(k,v),hasAttribute:k=>attrs.has(k),_zenPinnedInitialState:{image:'deliberate reset baseline'}};
  win.gBrowser.tabs.push(t);return t;
 }
 const t=tab();
 const flush=()=>{for(const o of observers)if(!o.disconnected)o.f([]);for(let n=0;microtasks.length&&n<20;n++)microtasks.shift()();};
 assert.equal(typeof startAppearanceFavicons,'function','favicon presentation function exists');
 const api=startAppearanceFavicons(win);
 return {win,t,api,tab,flush,media,preferences,obs,progress,observers,source:s=>{t.setAttribute('image',s);t.iconImage.setAttribute('src',s);t.linkedBrowser.mIconURL=s;},scheme:s=>{t.iconImage.scheme=s;container.scheme=s;}};
}
test('both exact stock assets render against actual dark/light sidebar without changing pending/native/reset data',()=>{
 const s=setup();const original=s.t.linkedBrowser.mIconURL,baseline=JSON.stringify(s.t._zenPinnedInitialState);
 assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'brightness(0) invert(1)');
 for(const stock of [svg,white])for(const scheme of ['light','dark']){s.source(uri(stock));s.scheme(scheme);s.flush();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),scheme==='dark'?'brightness(0) invert(1)':'brightness(0)');assert.equal(s.t.linkedBrowser.mIconURL,uri(stock));assert.equal(s.t.getAttribute('image'),uri(stock));assert.equal(s.t.hasAttribute('pending'),true);assert.equal(JSON.stringify(s.t._zenPinnedInitialState),baseline);}
 s.api.stop();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'opacity(0.8)');assert.equal(s.t.iconImage.style.getPropertyPriority('filter'),'important');
});
test('remote wrappers and percent encoded SVGs recognize the same exact stock source',()=>{
 for(const source of ['moz-remote-image://?url='+encodeURIComponent(uri(svg))+'&colorScheme=light','data:image/svg+xml;utf8,'+encodeURIComponent(white)]){const s=setup({source});assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'brightness(0) invert(1)');s.api.stop();}
});
test('network LF and local CRLF line endings recognize the exact same stock SVG',()=>{
 for(const source of [uri(svg.replace(/\r\n?/g,'\n')),uri(white.replace(/\r\n?/g,'\n'))]){const s=setup({source});assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'brightness(0) invert(1)');s.api.stop();}
});
test('unknown, altered path, additional artwork, custom icons and non GitHub sources bypass',()=>{
 for(const options of [{source:uri(svg.replace('M16 0','M15 0'))},{source:uri(svg.replace('</svg>','<circle r="2"/></svg>'))},{source:'data:image/png;base64,AAAA'},{url:'https://github.com.evil.test/x'},{url:'https://example.com/'},{url:'https://gist.github.com/x'}]){const s=setup(options);assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'opacity(0.8)');s.api.stop();}
 const s=setup();s.t.zenStaticIcon=uri(svg);s.flush();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'opacity(0.8)');delete s.t.zenStaticIcon;s.flush();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'brightness(0) invert(1)');s.api.stop();
});
test('navigation and unknown source release rendering and restore exact previous filter',()=>{
 const s=setup();s.t.linkedBrowser.currentURI.spec='https://example.com/';s.flush();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'opacity(0.8)');s.t.linkedBrowser.currentURI.spec='https://github.com/x';s.flush();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'brightness(0) invert(1)');s.source('data:image/svg+xml;base64,AAAA');s.flush();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'opacity(0.8)');s.api.stop();
});
test('another filter owner is preserved during refresh, later theme/source changes and cleanup',()=>{
 const s=setup();s.t.iconImage.style.setProperty('filter','sepia(0.5)','important');s.flush();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'sepia(0.5)');s.scheme('light');s.source(uri(white));s.flush();s.api.refresh();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'sepia(0.5)');s.api.stop();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'sepia(0.5)');assert.equal(s.t.iconImage.style.getPropertyPriority('filter'),'important');
});
test('priority-only external change yields, and cleanup preserves external removal',()=>{
 const s=setup();s.t.iconImage.style.setProperty('filter','brightness(0) invert(1)','');s.api.refresh();s.api.stop();assert.equal(s.t.iconImage.style.getPropertyPriority('filter'),'');assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'brightness(0) invert(1)');
 const q=setup();q.t.iconImage.style.removeProperty('filter');q.api.stop();assert.equal(q.t.iconImage.style.getPropertyValue('filter'),'');
});
test('empty filter baseline is removed again and stopping disconnects native event sources',()=>{
 const s=setup({filter:'',priority:''});s.api.stop();s.api.stop();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'');assert.equal(s.preferences.size,0);assert.equal(s.obs.size,0);assert.equal(s.progress.size,0);assert.ok(s.observers.every(o=>o.disconnected));s.win.gBrowser.tabContainer.fire('TabSelect');s.flush();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'');
});
for(const receiverFirst of [true,false])test(`cross-window transfer preserves baseline, receiver first ${receiverFirst}`,()=>{
 const shared=new Set(),a=setup({shared}),b=setup({shared,filter:'opacity(0.4)',priority:''});const moved=a.t;a.win.gBrowser.tabs=[];b.win.gBrowser.tabs.push(moved);moved.iconImage.ownerDocument=b.win.document;moved.ownerDocument=b.win.document;b.scheme('light');moved.iconImage.scheme='light';
 if(receiverFirst){b.api.refresh();a.api.refresh();}else{a.api.refresh();b.api.refresh();}
 assert.equal(moved.iconImage.style.getPropertyValue('filter'),'brightness(0)');a.api.stop();assert.equal(moved.iconImage.style.getPropertyValue('filter'),'brightness(0)');b.api.stop();assert.equal(moved.iconImage.style.getPropertyValue('filter'),'opacity(0.8)');assert.equal(moved.iconImage.style.getPropertyPriority('filter'),'important');
});
test('transfer to a window without a running adapter safely restores sender baseline',()=>{
 const s=setup();s.win.gBrowser.tabs=[];s.t.iconImage.ownerDocument={defaultView:{}};s.api.refresh();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'opacity(0.8)');s.api.stop();
});
test('reenabling after all runtimes stop captures the current external filter as a fresh baseline',()=>{
 const s=setup();s.t.iconImage.style.setProperty('filter','sepia(0.5)','');s.flush();s.api.stop();const api=startAppearanceFavicons(s.win);assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'brightness(0) invert(1)');api.stop();assert.equal(s.t.iconImage.style.getPropertyValue('filter'),'sepia(0.5)');assert.equal(s.t.iconImage.style.getPropertyPriority('filter'),'');
});
