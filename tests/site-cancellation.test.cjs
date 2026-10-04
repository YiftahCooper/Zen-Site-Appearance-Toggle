const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const {siteAppearanceAction}=require('../src/appearance-site-actions');
const root=path.resolve(__dirname,'..');
function generatedActor(){
 const generated=new Map(),context={require:name=>name==='node:fs'?{...fs,writeFileSync:(file,value)=>generated.set(file,value)}:require(name),__dirname:path.join(root,'tools'),process:{argv:[]},console:{log:()=>{}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'tools/build.cjs'),'utf8'),context);
 const source=generated.get(path.join(root,'sine/JS/appearance-site-child.mjs'));
 const actorContext={JSWindowActorChild:class{},URL,module:{exports:{}}};
 vm.runInNewContext(source.replace('export class SatSiteAppearanceChild','class SatSiteAppearanceChild')+'\nthis.Actor=SatSiteAppearanceChild;',actorContext);
 return actorContext.Actor;
}
function gemini(){
 const d=new JSDOM('<button id="settings"><i data-mat-icon-name="settings"></i></button><div id="menus"></div>',{url:'https://gemini.google.com/app'}),w=d.window;
 w.localStorage.setItem('Bard-Color-Theme','Bard-Dark-Theme');
 let release,clicked=0;
 w.document.querySelector('#settings').onclick=()=>{
  release=()=>{w.document.querySelector('#menus').innerHTML='<button data-test-id="desktop-theme-menu-button">Theme</button>';w.document.querySelector('[data-test-id]').onclick=()=>{
   w.document.querySelector('#menus').innerHTML=['System','Light','Dark'].map(m=>`<button role="menuitemradio" aria-checked="${m==='Dark'}">${m}</button>`).join('');
   for(const e of w.document.querySelectorAll('[role=menuitemradio]'))e.onclick=()=>{clicked++;w.localStorage.setItem('Bard-Color-Theme',`Bard-${e.textContent}-Theme`);};
  };};
 };
 return {d,w,release:()=>release(),clicked:()=>clicked};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('cancellation while Gemini waits prevents the later theme mutation',async()=>{
 const s=gemini();let cancelled=false;
 try{const task=siteAppearanceAction(s.w.document,{operation:'set',theme:'System',isCancelled:()=>cancelled});await tick();cancelled=true;s.release();await assert.rejects(task,/cancel/i);assert.equal(s.clicked(),0);assert.equal(s.w.localStorage.getItem('Bard-Color-Theme'),'Bard-Dark-Theme');}finally{s.w.close();}
});
test('same-document navigation while Gemini waits prevents mutation on the new URL',async()=>{
 const s=gemini();try{const task=siteAppearanceAction(s.w.document,{operation:'set',theme:'System'});await tick();s.w.history.pushState({},'', '/app?authuser=1');s.release();await assert.rejects(task,/navigated|changed/i);assert.equal(s.clicked(),0);}finally{s.w.close();}
});
test('Google cancellation during confirmation delay never clicks Confirm',async()=>{
 const d=new JSDOM('<div role="dialog" aria-label="Dark theme">'+['0','1','2'].map(m=>`<label data-value="${m}"><input name="theme" type="radio" ${m==='1'?'checked':''}></label>`).join('')+'<button>Confirm</button></div>',{url:'https://www.google.com/preferences?hl=en'}),w=d.window;
 w.Element.prototype.getClientRects=()=>[{width:100,height:20}];let cancelled=false,confirmed=0;w.document.querySelector('button').onclick=()=>confirmed++;
 w.document.querySelector('label[data-value="0"]').addEventListener('click',()=>cancelled=true);
 try{await assert.rejects(siteAppearanceAction(w.document,{operation:'set',theme:'0',isCancelled:()=>cancelled}),/cancel/i);assert.equal(confirmed,0);}finally{w.close();}
});
for(const method of ['message','destroy'])test('generated actor '+method+' cancels its running action',async()=>{
 const s=gemini(),Actor=generatedActor(),actor=new Actor();actor.document=s.w.document;
 try{const task=actor.receiveMessage({name:'SAT:Theme',data:{operation:'set',theme:'System',operationId:'test-1',expectedHref:s.w.location.href}});await tick();if(method==='message')actor.receiveMessage({name:'SAT:Cancel',data:{operationId:'test-1'}});else actor.didDestroy();s.release();await assert.rejects(task,/cancel/i);assert.equal(s.clicked(),0);}finally{s.w.close();}
});
test('generated actor requires an operation identity before invoking page controls',async()=>{
 const s=gemini(),Actor=generatedActor(),actor=new Actor();actor.document=s.w.document;
 try{await assert.rejects(async()=>actor.receiveMessage({name:'SAT:Theme',data:{operation:'set',theme:'System',expectedHref:s.w.location.href}}),/operation|identity/i);assert.equal(s.w.document.querySelector('[data-test-id]'),null);}finally{s.w.close();}
});
function googleSection(){
 const d=new JSDOM('<div jsname="other">Other settings</div><button data-pid="cs" hidden>Theme</button><div id="menus"></div>',{url:'https://www.google.com/preferences?hl=en&authuser=1#appearance'}),w=d.window;
 w.Element.prototype.getClientRects=function(){return this.hidden?[]:[{width:100,height:20}];};let themeClicks=0;
 w.document.querySelector('[data-pid]').onclick=()=>{themeClicks++;w.document.querySelector('#menus').innerHTML='<div role="dialog" aria-label="Dark theme">'+['0','1','2'].map(m=>`<label data-value="${m}"><input name="theme" type="radio" ${m==='1'?'checked':''}></label>`).join('')+'</div>';};
 return {w,other:w.document.querySelector('[jsname]'),ready:()=>w.document.querySelector('[data-pid]').hidden=false,themeClicks:()=>themeClicks};
}
test('Google own Other settings click may synchronously select its fragment',async()=>{
 const s=googleSection();s.other.onclick=()=>{s.w.history.replaceState({},'','#other');s.ready();};
 try{assert.equal((await siteAppearanceAction(s.w.document,{operation:'inspect'})).before,'1');assert.equal(s.w.location.hash,'#other');assert.equal(s.themeClicks(),1);}finally{s.w.close();}
});
for(const destination of ['/preferences?hl=en&authuser=2#other','/search?hl=en&authuser=1#other'])test('Google own section click rejects changed target '+destination,async()=>{
 const s=googleSection();s.other.onclick=()=>{s.w.history.replaceState({},'',destination);s.ready();};
 try{await assert.rejects(siteAppearanceAction(s.w.document,{operation:'inspect'}),/navigated|changed/i);assert.equal(s.themeClicks(),0);}finally{s.w.close();}
});
test('external Google fragment change after the owned click is rejected',async()=>{
 const s=googleSection();s.other.onclick=()=>s.w.history.replaceState({},'','#other');
 try{let rejected=false;const task=siteAppearanceAction(s.w.document,{operation:'inspect'});task.catch(()=>rejected=true);await tick();assert.equal(rejected,false,'the owned fragment must first be accepted');s.w.history.replaceState({},'','#unrelated');s.ready();await assert.rejects(task,/navigated|changed/i);assert.equal(s.themeClicks(),0);}finally{s.w.close();}
});
