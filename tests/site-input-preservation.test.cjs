const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const {siteAppearanceAction}=require('../src/appearance-site-actions');
function page(html='<textarea name="q">loaded query</textarea>'){
 const d=new JSDOM('<body>'+html+'<button id="other">Other control</button></body>',{url:'https://www.google.com/search?q=loaded+query&cs=1'}),w=d.window;
 w.Element.prototype.getClientRects=function(){return this.hidden||this.type==='hidden'?[]:[{width:100,height:20}];};
 Object.defineProperties(w,{scrollX:{value:12,writable:true},scrollY:{value:540,writable:true}});const scrolls=[];
 w.scrollTo=options=>scrolls.push(options);let inputs=0;w.document.addEventListener('input',()=>inputs++);
 return {w,field:w.document.querySelector('textarea[name=q],input[name=q]'),scrolls,inputs:()=>inputs};
}
const snapshot=()=>({scroll:{x:12,y:540},searchInput:{value:'unsent draft',focused:true,selectionStart:2,selectionEnd:6,selectionDirection:'backward'}});
test('capture reads only the visible Google search field and preserves focus, selection and scroll without mutation',async()=>{
 const s=page('<input name="q" hidden value="hidden secret"><input name="q" type="password" value="password secret"><textarea name="q">unsent draft</textarea>'),field=s.w.document.querySelector('textarea');
 field.focus();field.setSelectionRange(2,6,'backward');const html=s.w.document.documentElement.outerHTML;
 try{assert.deepEqual(await siteAppearanceAction(s.w.document,{operation:'capture'}),snapshot());assert.equal(s.inputs(),0);assert.equal(s.scrolls.length,0);assert.equal(s.w.document.documentElement.outerHTML,html);}finally{s.w.close();}
});
test('capture returns null when only hidden and password fields match q',async()=>{
 const s=page('<input name="q" type="hidden" value="hidden secret"><input name="q" type="password" value="password secret">');
 try{assert.deepEqual(await siteAppearanceAction(s.w.document,{operation:'capture'}),{scroll:{x:12,y:540},searchInput:null});}finally{s.w.close();}
});
for(const operation of ['capture','restore'])test(operation+' rejects ambiguous visible Google search controls before writes',async()=>{
 const s=page('<textarea name="q">loaded query</textarea><input name="q" type="search" value="loaded query">');
 try{await assert.rejects(siteAppearanceAction(s.w.document,{operation,snapshot:snapshot()}),/ambiguous/i);assert.equal(s.inputs(),0);assert.equal(s.scrolls.length,0);}finally{s.w.close();}
});
test('restore reinstates a draft, native input event, focus, selection and scroll after reload',async()=>{
 const s=page();try{const result=await siteAppearanceAction(s.w.document,{operation:'restore',snapshot:snapshot()});assert.equal(result.searchTextPreserved,true);assert.equal(s.field.value,'unsent draft');assert.equal(s.inputs(),1);assert.equal(s.w.document.activeElement,s.field);assert.equal(s.field.selectionStart,2);assert.equal(s.field.selectionEnd,6);assert.equal(s.field.selectionDirection,'backward');assert.deepEqual(s.scrolls,[{left:12,top:540,behavior:'instant'}]);}finally{s.w.close();}
});
test('restore yields to newer user search text and its selection',async()=>{
 const s=page();s.field.value='new user text';s.field.focus();s.field.setSelectionRange(1,3);
 try{const result=await siteAppearanceAction(s.w.document,{operation:'restore',snapshot:snapshot()});assert.equal(result.searchTextPreserved,false);assert.equal(s.field.value,'new user text');assert.equal(s.field.selectionStart,1);assert.equal(s.field.selectionEnd,3);assert.equal(s.inputs(),0);}finally{s.w.close();}
});
test('restore reports an input-event rewrite without overwriting its resulting text',async()=>{
 const s=page();s.field.addEventListener('input',()=>s.field.value='text changed by input');
 try{const result=await siteAppearanceAction(s.w.document,{operation:'restore',snapshot:snapshot()});assert.equal(result.searchTextPreserved,false);assert.equal(s.field.value,'text changed by input');assert.equal(s.inputs(),1);}finally{s.w.close();}
});
test('restore checks the final visible field if an input handler replaces it',async()=>{
 const s=page();s.field.addEventListener('input',()=>{const next=s.w.document.createElement('textarea');next.name='q';next.value='replacement text';s.field.replaceWith(next);});
 try{const result=await siteAppearanceAction(s.w.document,{operation:'restore',snapshot:snapshot()});assert.equal(result.searchTextPreserved,false);assert.equal(s.w.document.querySelector('[name=q]').value,'replacement text');}finally{s.w.close();}
});
test('restore with no captured search field reports no lost text',async()=>{
 const s=page();try{const result=await siteAppearanceAction(s.w.document,{operation:'restore',snapshot:{scroll:{x:12,y:540},searchInput:null}});assert.equal(result.searchTextPreserved,true);assert.equal(s.field.value,'loaded query');assert.equal(s.inputs(),0);}finally{s.w.close();}
});
test('supported-site operations reject nondefault HTTPS ports before controls or writes',async()=>{
 for(const [url,operation]of [['https://www.google.com:8443/search','capture'],['https://www.google.com:8443/search','restore'],['https://www.google.com:8443/preferences','inspect'],['https://gemini.google.com:8443/app','set']]){
  const d=new JSDOM('<textarea name="q">loaded query</textarea>',{url});
  try{await assert.rejects(siteAppearanceAction(d.window.document,{operation,snapshot:snapshot(),theme:'System'}),/Unsupported/i);}finally{d.window.close();}
 }
});
test('restore keeps later focus on another control while restoring the draft',async()=>{
 const s=page(),other=s.w.document.querySelector('#other');other.focus();
 try{await siteAppearanceAction(s.w.document,{operation:'restore',snapshot:snapshot()});assert.equal(s.field.value,'unsent draft');assert.equal(s.w.document.activeElement,other);}finally{s.w.close();}
});
test('restore of already captured text emits no input event',async()=>{
 const s=page();s.field.value='unsent draft';try{await siteAppearanceAction(s.w.document,{operation:'restore',snapshot:snapshot()});assert.equal(s.inputs(),0);assert.equal(s.field.selectionStart,2);}finally{s.w.close();}
});
test('restore does not focus a field that was not focused before capture',async()=>{
 const s=page(),data=snapshot();data.searchInput.focused=false;
 try{await siteAppearanceAction(s.w.document,{operation:'restore',snapshot:data});assert.equal(s.w.document.activeElement,s.w.document.body);}finally{s.w.close();}
});
test('restore rejects malformed snapshot fields before any write',async()=>{
 for(const data of [null,{}, {...snapshot(),unexpected:true},{...snapshot(),scroll:{x:Infinity,y:0}},{...snapshot(),scroll:{x:'12',y:0}},{...snapshot(),searchInput:{...snapshot().searchInput,focused:'true'}},{...snapshot(),searchInput:{...snapshot().searchInput,selectionEnd:100}},{...snapshot(),searchInput:{...snapshot().searchInput,selectionDirection:'invalid'}}]){
  const s=page();try{await assert.rejects(siteAppearanceAction(s.w.document,{operation:'restore',snapshot:data}),/snapshot|invalid/i);assert.equal(s.field.value,'loaded query');assert.equal(s.inputs(),0);assert.equal(s.scrolls.length,0);}finally{s.w.close();}
 }
});
test('restore stops later focus and scrolling when an input handler cancels the operation',async()=>{
 const s=page();let cancelled=false;s.field.addEventListener('input',()=>cancelled=true);
 try{await assert.rejects(siteAppearanceAction(s.w.document,{operation:'restore',snapshot:snapshot(),isCancelled:()=>cancelled}),/cancel/i);assert.equal(s.w.document.activeElement,s.w.document.body);assert.equal(s.scrolls.length,0);}finally{s.w.close();}
});
test('restore stops later actions when native input changes the account route',async()=>{
 const s=page();s.field.addEventListener('input',()=>s.w.history.replaceState({},'','?q=loaded+query&authuser=1'));
 try{await assert.rejects(siteAppearanceAction(s.w.document,{operation:'restore',snapshot:snapshot()}),/navigated|changed/i);assert.equal(s.w.document.activeElement,s.w.document.body);assert.equal(s.scrolls.length,0);}finally{s.w.close();}
});
test('capture and restore never access persistent preferences',async()=>{
 const s=page();let accesses=0;
 const prefs=new Proxy({}, {get(){accesses++;throw Error('Persistent preference access is forbidden');}}),Services={prefs};s.w.Services=Services;
 const context={URL,Services,module:{exports:{}}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/appearance-site-actions'),'utf8'),context);
 try{const data=await context.module.exports.siteAppearanceAction(s.w.document,{operation:'capture'});await context.module.exports.siteAppearanceAction(s.w.document,{operation:'restore',snapshot:data});assert.equal(accesses,0);assert.equal(s.inputs(),0);}finally{s.w.close();}
});
for(const operation of ['capture','restore'])test(operation+' rejects Gemini, settings and challenge pages',async()=>{
 for(const url of ['https://gemini.google.com/app','https://www.google.com/preferences','https://www.google.com/sorry/index']){
  const d=new JSDOM('<textarea name="q">loaded query</textarea>',{url});
  try{await assert.rejects(siteAppearanceAction(d.window.document,{operation,snapshot:snapshot()}),/Unsupported/i);}finally{d.window.close();}
 }
});
