const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const {siteAppearanceAction}=require('../src/appearance-site-actions');
function page(bodyStyle='background:white;color:black',rootStyle=''){
 const dom=new JSDOM(`<html style="${rootStyle}"><body style="${bodyStyle}"><main style="min-height:100vh">Fixture</main></body></html>`,{url:'http://example.org:8080/new',pretendToBeVisual:true});
 const d=dom.window.document;Object.defineProperty(d,'readyState',{value:'complete'});
 d.elementsFromPoint=()=>[d.querySelector('main'),d.body,d.documentElement];
 return {dom,d};
}
for(const [style,want]of [['background:white;color:black','light'],['background:#101010;color:white','dark']])test('generic readback recognises '+want+' independently of the browser request',async()=>{
 const p=page(style);try{p.dom.window.matchMedia=()=>({matches:want==='light'});assert.equal((await siteAppearanceAction(p.d,{operation:'page-appearance'})).theme,want);assert.equal(p.d.body.getAttribute('style'),style);}finally{p.dom.window.close();}
});
test('readback follows the website own class and stylesheet changes',async()=>{
 const p=page('');try{const css=p.d.createElement('style');css.textContent='body{background:white;color:black}body.dark{background:#111;color:#eee}';p.d.head.append(css);
 assert.equal((await siteAppearanceAction(p.d,{operation:'page-appearance'})).theme,'light');p.d.body.classList.add('dark');assert.equal((await siteAppearanceAction(p.d,{operation:'page-appearance'})).theme,'dark');css.textContent='body.dark{background:white;color:black}';assert.equal((await siteAppearanceAction(p.d,{operation:'page-appearance'})).theme,'light');
 }finally{p.dom.window.close();}
});
test('transparent application surfaces resolve the painted ancestor background',async()=>{
 const p=page('background:transparent;color:white','background:#111');try{assert.equal((await siteAppearanceAction(p.d,{operation:'page-appearance'})).theme,'dark');}finally{p.dom.window.close();}
});
test('mixed surfaces and image-backed pages report an uncertain theme',async()=>{
 const p=page();try{const dark=p.d.createElement('div');dark.style.background='#111';p.d.body.append(dark);p.d.elementsFromPoint=(x)=>[x<500?dark:p.d.querySelector('main'),p.d.body,p.d.documentElement];assert.equal((await siteAppearanceAction(p.d,{operation:'page-appearance'})).theme,null);
 p.d.body.style.backgroundImage='url(https://example.org/photo.png)';assert.equal((await siteAppearanceAction(p.d,{operation:'page-appearance'})).theme,null);
 }finally{p.dom.window.close();}
});
test('loading documents are not classified as a finished theme',async()=>{
 const dom=new JSDOM('<body style="background:white">');try{assert.equal((await siteAppearanceAction(dom.window.document,{operation:'page-appearance'})).theme,null);}finally{dom.window.close();}
});
test('generic readback does not grant arbitrary websites theme-setting operations',async()=>{
 const p=page();try{await assert.rejects(()=>siteAppearanceAction(p.d,{operation:'set',theme:'Dark'}),/Unsupported/);}finally{p.dom.window.close();}
});
