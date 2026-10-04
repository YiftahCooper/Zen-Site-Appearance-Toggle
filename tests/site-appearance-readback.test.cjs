const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const {siteAppearanceAction}=require('../src/appearance-site-actions');
function page(url,{dark=false,background='rgb(255, 255, 255)'}={}){
 const d=new JSDOM('<body><button>Theme</button><div data-pcs="2"></div><span data-pcs="2"></span><div data-pcs="1"></div></body>',{url}),w=d.window;
 w.document.body.style.backgroundColor=background;w.matchMedia=()=>({matches:dark});
 let clicked=0;w.document.querySelector('button').onclick=()=>clicked++;
 return {w,clicked:()=>clicked};
}
test('Google appearance readback reports media, distinct server palettes and rendered background without mutation',async()=>{
 const s=page('https://www.google.com/search?q=example&cs=1',{dark:false,background:'rgb(34, 36, 42)'}),before=s.w.document.documentElement.outerHTML;
 const observer=new s.w.MutationObserver(()=>{});observer.observe(s.w.document,{subtree:true,attributes:true,childList:true,characterData:true});
 try{assert.deepEqual(await siteAppearanceAction(s.w.document,{operation:'appearance'}),{mediaDark:false,pcs:['2','1'],background:'rgb(34, 36, 42)'});assert.equal(s.clicked(),0);assert.equal(s.w.document.documentElement.outerHTML,before);assert.deepEqual(observer.takeRecords(),[]);}finally{observer.disconnect();s.w.close();}
});
for(const url of ['https://google.com/','https://www.google.com/webhp?cs=2','https://images.google.com/imghp','https://images.google.com/search?udm=2'])test('appearance readback accepts supported Google route '+url,async()=>{
 const s=page(url,{dark:true,background:'rgb(34, 36, 42)'});try{assert.deepEqual(await siteAppearanceAction(s.w.document,{operation:'appearance'}),{mediaDark:true,pcs:['2','1'],background:'rgb(34, 36, 42)'});}finally{s.w.close();}
});
for(const url of ['http://www.google.com/','https://www.google.com/sorry/index','https://www.google.com/preferences','https://google.com.example.net/search','https://gemini.google.com/app'])test('appearance readback rejects unsupported route '+url,async()=>{
 const s=page(url);try{await assert.rejects(siteAppearanceAction(s.w.document,{operation:'appearance'}),/Unsupported|requires/i);assert.equal(s.clicked(),0);}finally{s.w.close();}
});
test('Images host cannot invoke Google theme controls',async()=>{
 const s=page('https://images.google.com/preferences');try{await assert.rejects(siteAppearanceAction(s.w.document,{operation:'set',theme:'0'}),/Unsupported|requires/i);assert.equal(s.clicked(),0);}finally{s.w.close();}
});
test('cancelled appearance readback fails without mutation',async()=>{
 const s=page('https://www.google.com/search');try{await assert.rejects(siteAppearanceAction(s.w.document,{operation:'appearance',isCancelled:()=>true}),/cancel/i);assert.equal(s.clicked(),0);}finally{s.w.close();}
});
