const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const prefs=new Map(),windows=new Set(),calls=[],tabs=[],samples=[],controlReplies=[],restoreReplies=[],captureReplies=[],deviceReplies=[];let serial=0;
 const win={setTimeout,clearTimeout,gZenWorkspaces:{activeWorkspace:'A'},gBrowser:{tabs,selectedTab:null},__satSiteRegistry:{users:new Set([{}]),locks:new Set(),registered:true}};windows.add(win);
 const ctx={URL,Set,Array,Promise,SAT_PREFIX:'sat.',SAT_SITE_CHILD_URI:()=>'',Ci:{nsIWebNavigation:{LOAD_FLAGS_BYPASS_CACHE:1,LOAD_FLAGS_REPLACE_HISTORY:2}},CustomizableUI:{windows},ChromeUtils:{importESModule:()=>({PrivateBrowsingUtils:{isWindowPrivate:()=>false}})},Services:{uuid:{generateUUID:()=>({toString:()=> 'id'})},prefs:{getStringPref:(k,d)=>prefs.get(k)||d,setStringPref:(k,v)=>prefs.set(k,v)},scriptSecurityManager:{getSystemPrincipal:()=>({})},io:{newURI:s=>({spec:s})}},createSiteSetup:e=>({env:e}),setTimeout,clearTimeout};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../src/appearance-site-browser.js'),'utf8'),ctx);
 const api=ctx.startSiteSetup(win);
 function tab(url){const t={isConnected:true,hasAttribute:()=>false,getAttribute:()=>'',linkedBrowser:{currentURI:{spec:url},webProgress:{isLoadingDocument:false},browsingContext:{}}};
 const global=()=>({serial:++serial,documentURI:{spec:t.linkedBrowser.currentURI.spec},getActor:()=>({sendQuery:(name,data)=>{calls.push({name,data});if(data.operation==='capture'&&captureReplies.length)return Promise.resolve(captureReplies.shift());if(data.operation==='capture')return Promise.resolve({scroll:{x:0,y:120},searchInput:{value:'unsent fixture',focused:true,selectionStart:3,selectionEnd:3,selectionDirection:'none'}});if(data.operation==='device-report')return Promise.resolve(deviceReplies.length?deviceReplies.shift():{completed:true});if(data.operation==='restore')return Promise.resolve(restoreReplies.length?restoreReplies.shift():{restored:true,searchTextPreserved:true});const sample=data.operation==='appearance'?samples.shift():null;return data.operation==='appearance'?Promise.resolve(typeof sample==='function'?sample():sample||{mediaDark:false,pcs:['1']}):controlReplies.length?Promise.resolve(controlReplies.shift()):new Promise(()=>{});},sendAsyncMessage:(name,data)=>calls.push({name,data})})});
 t.linkedBrowser.browsingContext.currentWindowGlobal=global();t.linkedBrowser.loadURI=(uri,options)=>{calls.push({url:uri.spec,options});t.linkedBrowser.currentURI.spec=uri.spec;t.linkedBrowser.browsingContext.currentWindowGlobal=global();};t.linkedBrowser.reloadWithFlags=flags=>{calls.push({reload:flags});t.linkedBrowser.browsingContext.currentWindowGlobal=global();};tabs.push(t);win.gBrowser.selectedTab=t;return t;}
 win.gBrowser.addTab=url=>{calls.push({temporaryURL:url});const selected=win.gBrowser.selectedTab,t=tab(url);win.gBrowser.selectedTab=selected;return t;};win.gBrowser.removeTab=t=>{t.isConnected=false;};
 return {api,win,calls,tab,samples,controlReplies,restoreReplies,captureReplies,deviceReplies,ctx};
}

test('generic appearance transport is read-only and accepts HTTP with a nondefault port',async()=>{
 const f=fixture();try{const t=f.tab('http://example.org:8080/new'),queries=[];
 t.linkedBrowser.browsingContext.currentWindowGlobal.getActor=()=>({sendQuery:(name,data)=>{queries.push(data);return Promise.resolve({theme:'light',reason:'palette'});},sendAsyncMessage(){}});
 assert.equal((await f.api.observeAppearance(t)).theme,'light');assert.deepEqual(queries.map(q=>q.operation),['page-appearance']);assert.equal(f.calls.length,0);
 }finally{f.api.stop();}
});
test('generic transport rejects a result from a replaced document',async()=>{
 const f=fixture();try{const t=f.tab('https://example.org/');let finish;
 const wg=t.linkedBrowser.browsingContext.currentWindowGlobal;wg.getActor=()=>({sendQuery:()=>new Promise(r=>finish=r),sendAsyncMessage(){}});
 const pending=f.api.observeAppearance(t);t.linkedBrowser.browsingContext.currentWindowGlobal={};finish({theme:'dark'});await assert.rejects(pending,/changed|navigat/);
 }finally{f.api.stop();}
});
test('pending and background tabs cannot trigger generic appearance reads',async()=>{
 const f=fixture();try{const t=f.tab('https://example.org/');t.hasAttribute=n=>n==='pending';Object.defineProperty(t.linkedBrowser,'browsingContext',{get(){throw Error('Pending tab accessed');}});
 assert.equal((await f.api.observeAppearance(t)).theme,null);t.hasAttribute=()=>false;f.tab('https://other.org/');assert.equal((await f.api.observeAppearance(t)).theme,null);assert.equal(f.calls.length,0);
 }finally{f.api.stop();}
});
test('registered actor enables HTTP readback while mutating website actions stay restricted',async()=>{
 const f=fixture();try{const t=f.tab('https://example.org/');let registration;
 f.win.__satSiteRegistry.registered=false;f.ctx.ChromeUtils.registerWindowActor=(_,options)=>registration=options;
 t.linkedBrowser.browsingContext.currentWindowGlobal.getActor=()=>({sendQuery:()=>Promise.resolve({theme:'dark'}),sendAsyncMessage(){}});
 await f.api.observeAppearance(t);assert.deepEqual(Array.from(registration.matches),['http://*/*','https://*/*']);assert.equal(registration.allFrames,false);assert.equal(f.api.context(t),null);
 }finally{f.api.stop();}
});
test('supported-site context preserves explicit Google and Gemini account routes',()=>{
 const f=fixture();try{for(const [url,account]of [['https://www.google.com/search?q=x&authuser=1','1'],['https://gemini.google.com/u/2/app','2'],['https://gemini.google.com/app?authuser=3','3']]){
 const c=f.api.context(f.tab(url));assert.equal(c.account,account);assert.equal(c.id,c.service+':0:'+account);
 }assert.equal(f.api.context(f.tab('https://www.google.com/search?authuser=email@example.com')).unsupportedAccount,true);}finally{f.api.stop();}
});
test('failed Google navigation retains the unsent search only in RAM until transport stops',async()=>{
 const f=fixture();const t=f.tab('https://www.google.com/search?q=a');
 f.samples.push(()=>{t.linkedBrowser.currentURI.spec='https://example.com/new';return {mediaDark:false,pcs:['1']};});
 await assert.rejects(()=>f.api.repaintGoogle(t,false),/changed/);
 assert.equal(f.api.pendingGoogleDraft(t),'unsent fixture');
 assert.equal(f.api.pendingGoogleDraft(f.tab('https://example.org/')),null);
 f.api.stop();assert.equal(f.api.pendingGoogleDraft(t),null);
});
test('successful Google restoration releases its retained RAM search even if palette verification fails',async()=>{
 const f=fixture();try{const t=f.tab('https://www.google.com/search?q=a');
 f.samples.push({mediaDark:false,pcs:['2']},{mediaDark:false,pcs:['2']});
 await assert.rejects(()=>f.api.repaintGoogle(t,false),/did not render/);
 assert.equal(f.api.pendingGoogleDraft(t),null);
 }finally{f.api.stop();}
});
test('a later successful Google repaint does not discard an earlier failed unsent draft',async()=>{
 const f=fixture();try{const t=f.tab('https://www.google.com/search?q=a');
 f.samples.push(()=>{t.linkedBrowser.currentURI.spec='https://example.com/new';return {mediaDark:false,pcs:['1']};});
 await assert.rejects(()=>f.api.repaintGoogle(t,false),/changed/);
 t.linkedBrowser.currentURI.spec='https://www.google.com/search?q=b';
 await f.api.repaintGoogle(t,false);assert.equal(f.api.pendingGoogleDraft(t),'unsent fixture');
 }finally{f.api.stop();}
});
test('Google retry pauses before a reload if new unsent text was typed after its first navigation',async()=>{
 const f=fixture();try{const t=f.tab('https://www.google.com/search?q=a'),input=value=>({scroll:{x:0,y:120},searchInput:{value,focused:true,selectionStart:0,selectionEnd:0,selectionDirection:'none'}});
 f.captureReplies.push(input('original draft'),input('newly typed draft'));f.samples.push({mediaDark:false,pcs:['2']});
 await assert.rejects(()=>f.api.repaintGoogle(t,false),/paused to preserve/);
 assert.equal(f.calls.filter(c=>c.reload).length,0);assert.equal(f.calls.filter(c=>c.data?.operation==='restore').length,0);assert.equal(f.api.pendingGoogleDraft(t),'original draft');
 }finally{f.api.stop();}
});
test('preserving a newer input during restoration keeps the older captured draft recoverable',async()=>{
 const f=fixture();try{const t=f.tab('https://www.google.com/search?q=a');f.restoreReplies.push({restored:true,searchTextPreserved:false});
 await assert.rejects(()=>f.api.repaintGoogle(t,false),/kept newer/);assert.equal(f.api.pendingGoogleDraft(t),'unsent fixture');
 }finally{f.api.stop();}
});
for(const kind of ['destination','selection','new document'])test('Google stale readback after '+kind+' change cannot reload the replacement page',async()=>{
 const f=fixture();try{const t=f.tab('https://www.google.com/search?q=a');f.samples.push(()=>{if(kind==='destination')t.linkedBrowser.currentURI.spec='https://example.com/new';if(kind==='selection')f.tab('https://example.com/new');if(kind==='new document')t.linkedBrowser.browsingContext.currentWindowGlobal={documentURI:{spec:t.linkedBrowser.currentURI.spec}};return {mediaDark:false,pcs:['2']};});await assert.rejects(()=>f.api.repaintGoogle(t,false),/changed|navigated/);assert.equal(f.calls.filter(c=>c.reload).length,0);}finally{f.api.stop();}
});
test('Undo does not select a Gemini tab with an unsupported account selector',async()=>{
 const f=fixture();try{f.tab('https://gemini.google.com/app?authuser=account@example.com');f.controlReplies.push({before:'System'});await f.api.env.control({id:'gemini:0',service:'gemini',container:0,account:null},{operation:'inspect'});assert.equal(f.calls.filter(c=>c.temporaryURL).length,1);const request=f.calls.find(c=>c.name==='SAT:Theme');assert.equal(request.data.expectedHref,'https://gemini.google.com/');}finally{f.api.stop();}
});
test('stale Google server palette gets one fresh retry and is independently verified',async()=>{
 const f=fixture();try{const t=f.tab('https://www.google.com/search?q=a');f.samples.push({mediaDark:false,pcs:['2']},{mediaDark:false,pcs:['1']});await f.api.repaintGoogle(t,false);assert.equal(f.calls.filter(c=>c.reload).length,1);assert.equal(f.calls.filter(c=>c.data?.operation==='appearance').length,2);}finally{f.api.stop();}
});
test('Google retry waits for the completed device report before dispatching another navigation',async()=>{
 const f=fixture();let complete;try{const t=f.tab('https://www.google.com/search?q=a');f.samples.push({mediaDark:false,pcs:['2']},{mediaDark:false,pcs:['1']});
 f.deviceReplies.push(new Promise(resolve=>complete=resolve));const pending=f.api.repaintGoogle(t,false);
 await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.calls.filter(c=>c.reload).length,0);
 complete({completed:true});await pending;assert.equal(f.calls.filter(c=>c.reload).length,1);
 }finally{complete?.({completed:true});f.api.stop();}
});
test('same-URL replacement during device report wait receives no retry or old draft restoration',async()=>{
 const f=fixture();let complete;try{const t=f.tab('https://www.google.com/search?q=a');f.samples.push({mediaDark:false,pcs:['2']});
 f.deviceReplies.push(new Promise(resolve=>complete=resolve));const pending=f.api.repaintGoogle(t,false);
 await new Promise(resolve=>setTimeout(resolve,5));const bc=t.linkedBrowser.browsingContext;bc.currentWindowGlobal={...bc.currentWindowGlobal};
 complete({completed:true});await assert.rejects(pending,/changed|navigated/);
 assert.equal(f.calls.filter(c=>c.reload).length,0);assert.equal(f.calls.filter(c=>c.data?.operation==='restore').length,0);
 assert.equal(f.api.pendingGoogleDraft(t),'unsent fixture');
 }finally{complete?.({completed:true});f.api.stop();}
});
test('missing device completion stops Google retry and restores unsent text without claiming theme success',async()=>{
 const f=fixture();try{const t=f.tab('https://www.google.com/search?q=a');f.samples.push({mediaDark:false,pcs:['2']});f.deviceReplies.push({completed:false});
 await assert.rejects(()=>f.api.repaintGoogle(t,false),/report/);assert.equal(f.calls.filter(c=>c.reload).length,0);
 assert.ok(f.calls.some(c=>c.data?.operation==='restore'));assert.equal(f.api.pendingGoogleDraft(t),null);
 }finally{f.api.stop();}
});
test('an unverified Google palette fails after one retry instead of claiming success or looping',async()=>{
 const f=fixture();try{const t=f.tab('https://www.google.com/search?q=a');f.samples.push({mediaDark:false,pcs:['2']},{mediaDark:false,pcs:['2']});await assert.rejects(()=>f.api.repaintGoogle(t,false),/did not render/);assert.equal(f.calls.filter(c=>c.reload).length,1);}finally{f.api.stop();}
});
test('stopping transport cancels an in-flight query even while another window remains',async()=>{
 const f=fixture();const t=f.tab('https://gemini.google.com/');const pending=f.api.env.control(f.api.context(t),{operation:'inspect'},t);
 await new Promise(r=>setTimeout(r,5));f.api.stop();await assert.rejects(pending,/stopped|cancel/);
 assert.ok(f.calls.some(c=>c.name==='SAT:Cancel'&&c.data.operationId));
});
test('Google failed control closes its temporary tab and a retry uses a fresh one',async()=>{
 const f=fixture();try{const t=f.tab('https://www.google.com/search?q=a'),ctx=f.api.context(t);
 f.controlReplies.push({then(_resolve,reject){reject(Error('Website navigated during setup'));}});
 await assert.rejects(f.api.env.control(ctx,{operation:'set',theme:'1'}),/navigated/);
 assert.equal(f.win.gBrowser.selectedTab,t);assert.ok(f.win.gBrowser.tabs.filter(x=>x!==t).every(x=>!x.isConnected));
 f.controlReplies.push({before:'1'});await f.api.env.control(ctx,{operation:'inspect'});
 assert.equal(f.calls.filter(x=>x.temporaryURL).length,2);assert.ok(f.win.gBrowser.tabs.filter(x=>x!==t).every(x=>!x.isConnected));
 }finally{f.api.stop();}
});
test('selection changed before transport dispatch never sends a later theme mutation after cancellation',async()=>{
 const f=fixture();try{const t=f.tab('https://gemini.google.com/'),ctx=f.api.context(t);f.tab('https://example.com/');await assert.rejects(()=>f.api.env.control(ctx,{operation:'set',theme:'System'},t),/changed/);assert.equal(f.calls.filter(c=>c.name==='SAT:Theme').length,0);}finally{f.api.stop();}
});
test('Google repaint preserves query filters and explicit account without adding a history entry',async()=>{
 const f=fixture();try{const t=f.tab('https://www.google.com/search?q=a&udm=2&authuser=1#x');await f.api.repaintGoogle(t,false);
 const navigation=f.calls.find(c=>c.url),u=new URL(navigation.url);assert.equal(u.searchParams.get('q'),'a');assert.equal(u.searchParams.get('udm'),'2');assert.equal(u.searchParams.get('authuser'),'1');assert.equal(u.hash,'#x');assert.equal(u.searchParams.get('cs'),'1');assert.ok(navigation.options.loadFlags);
 const commands=f.calls.filter(c=>c.name==='SAT:Theme').map(c=>c.data.operation);assert.deepEqual(commands,['capture','appearance','restore']);assert.equal(f.calls.find(c=>c.data?.operation==='restore').data.snapshot.searchInput.value,'unsent fixture');
 }finally{f.api.stop();}
});
