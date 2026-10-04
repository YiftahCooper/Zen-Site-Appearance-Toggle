const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
function action(doc,request){
 // JSDOM has no layout engine. Give existing and inserted fixture controls
 // rectangles; tests can explicitly override this to model delayed readiness.
 if(!doc.defaultView.Element.prototype.__fixtureRects){doc.defaultView.Element.prototype.__fixtureRects=true;doc.defaultView.Element.prototype.getClientRects=function(){return this.hidden?[]:[{width:100,height:20}];};}
 const ctx={module:{exports:{}},URL,setTimeout};vm.createContext(ctx);
 const path=require('node:path').join(__dirname,'../src/appearance-site-actions.js');
 if(fs.existsSync(path))vm.runInContext(fs.readFileSync(path,'utf8'),ctx);
 assert.equal(typeof ctx.module.exports.siteAppearanceAction,'function','site action exists');
 return ctx.module.exports.siteAppearanceAction(doc,request);
}
function gemini(before='Dark'){
 const dom=new JSDOM('<button id="settings"><i data-mat-icon-name="settings"></i></button><div id="menus"></div>',{url:'https://gemini.google.com/app'}),w=dom.window;
 w.localStorage.setItem('Bard-Color-Theme',`Bard-${before}-Theme`);
 w.document.getElementById('settings').onclick=()=>{
  w.document.getElementById('menus').innerHTML='<button data-test-id="desktop-theme-menu-button" role="menuitem">Theme</button>';
  w.document.querySelector('[data-test-id]').onclick=()=>{
   w.document.getElementById('menus').innerHTML=['System','Light','Dark'].map(v=>`<button role="menuitemradio" aria-checked="${v===before}">${v}</button>`).join('');
   for(const e of w.document.querySelectorAll('[role=menuitemradio]'))e.onclick=()=>{for(const n of e.parentElement.children)n.setAttribute('aria-checked',String(n===e));w.localStorage.setItem('Bard-Color-Theme',`Bard-${e.textContent}-Theme`);};
  };
 };
 return dom;
}
test('Gemini setup uses its actual theme control and returns original mode',async()=>{
 const d=gemini();const result=await action(d.window.document,{operation:'set',theme:'System'});
 assert.equal(result.before,'Dark');assert.equal(result.after,'System');assert.equal(d.window.localStorage.getItem('Bard-Color-Theme'),'Bard-System-Theme');d.window.close();
});
test('Gemini rollback restores the recorded theme using controls',async()=>{
 const d=gemini('System');const result=await action(d.window.document,{operation:'set',theme:'Dark'});
 assert.equal(result.after,'Dark');assert.equal(d.window.localStorage.getItem('Bard-Color-Theme'),'Bard-Dark-Theme');d.window.close();
});
test('unknown site and unsupported operation are rejected without clicking',async()=>{
 const d=new JSDOM('<button onclick="throw Error()">Settings</button>',{url:'https://evil.example/'});
 await assert.rejects(()=>action(d.window.document,{operation:'set',theme:'System'}),/Unsupported|supported/);d.window.close();
 const g=gemini();await assert.rejects(()=>action(g.window.document,{operation:'arbitrary'}),/operation/);g.window.close();
});
test('Google preference choice is confined to its theme dialog and confirmation',async()=>{
 const d=new JSDOM('<button data-pid="cs">Theme</button><div role="dialog" aria-label="Unrelated"><button role="button">Confirm</button></div><div id="host"></div>',{url:'https://www.google.com/preferences?hl=en'}),w=d.window;
 let unrelated=0,confirmed=0;w.document.querySelector('[aria-label=Unrelated] button').onclick=()=>unrelated++;
 w.document.querySelector('[data-pid=cs]').onclick=()=>{
  w.document.getElementById('host').innerHTML='<div role="dialog" aria-label="Dark theme">'+['0','1','2'].map(v=>`<label data-value="${v}"><input type="radio" name="theme" ${v==='1'?'checked':''}></label>`).join('')+'<button role="button">Confirm</button></div>';
  w.document.querySelector('[aria-label="Dark theme"] button').onclick=()=>confirmed++;
 };
 const result=await action(w.document,{operation:'set',theme:'0'});
 assert.equal(result.before,'1');assert.equal(result.after,'0');assert.equal(unrelated,0);assert.equal(confirmed,1);w.close();
});
test('no page-supplied arbitrary code or unsupported theme can be executed',async()=>{
 const d=gemini();await assert.rejects(()=>action(d.window.document,{operation:'set',theme:'eval(alert(1))'}),/theme/);
 assert.equal(d.window.localStorage.getItem('Bard-Color-Theme'),'Bard-Dark-Theme');d.window.close();
});
test('Google Other settings is initialized before reading an already present theme control',async()=>{
 const d=new JSDOM('<div jsname="settings-tab">Other settings</div><button data-pid="cs">Theme</button><div id="host"></div>',{url:'https://www.google.com/preferences?hl=en'}),w=d.window;
 let initialized=false;w.document.querySelector('[jsname]').onclick=()=>initialized=true;
 w.document.querySelector('[data-pid]').onclick=()=>{w.document.getElementById('host').innerHTML='<div role="dialog" aria-label="Dark theme">'+['0','1','2'].map(v=>`<label data-value="${v}"><input type="radio" name="theme" ${v===(initialized?'1':'0')?'checked':''}></label>`).join('')+'</div>';};
 assert.equal((await action(w.document,{operation:'inspect'})).before,'1');w.close();
});
test('Google theme control readiness is awaited instead of a fixed sleep',async()=>{
 const d=new JSDOM('<div jsname="settings-tab">Other settings</div><button data-pid="cs" hidden>Theme</button><div id="host"></div>',{url:'https://www.google.com/preferences?hl=en'}),w=d.window;
 let initialized=false;w.document.querySelector('[jsname]').onclick=()=>w.setTimeout(()=>{initialized=true;w.document.querySelector('[data-pid]').hidden=false;},180);
 w.document.querySelector('[data-pid]').onclick=()=>{w.document.getElementById('host').innerHTML='<div role="dialog" aria-label="Dark theme">'+['0','1','2'].map(v=>`<label data-value="${v}"><input type="radio" name="theme" ${v===(initialized?'1':'0')?'checked':''}></label>`).join('')+'</div>';};
 assert.equal((await action(w.document,{operation:'inspect'})).before,'1');w.close();
});
