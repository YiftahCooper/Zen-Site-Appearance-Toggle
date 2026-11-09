// Gecko 159 (Zen 1.24) paints context-fill data: images black in the browser
// window. The Original icons must therefore load from packaged chrome:// files.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'src/appearance-icons.js'),'utf8');
const names=['moon','sparkle','sun'],svg=Object.fromEntries(names.map(n=>[n,fs.readFileSync(path.join(root,'src/icons',n+'.svg'),'utf8')]));

function load(childURI,{exists=true,fileURL=true}={}){
  const uri=spec=>({spec,schemeIs:s=>spec.startsWith(s+':')});
  const ctx={
    SAT_SITE_CHILD_URI:()=>childURI,SAT_ICON_SVG:svg,
    Services:{io:{newURI:(rel,_,base)=>uri(base?new URL(rel,base.spec).href:rel)},prefs:{getIntPref:(_,d)=>d}},
    Ci:{nsIChromeRegistry:'reg',nsIFileURL:'file'},
    Cc:{'@mozilla.org/chrome/chrome-registry;1':{getService:()=>({convertChromeURL:u=>({QueryInterface:iid=>{if(iid!=='file'||!fileURL)throw Error('not a file URL');return {file:{exists:()=>exists}};},spec:u.spec})})}},
  };
  vm.runInNewContext(source+';this.out={ORIG_MOON,ORIG_SPARKLE,ORIG_SUN,getMoonSrc,getLightSrc};',ctx);
  return ctx.out;
}
const SINE='chrome://sine/content/zen-site-appearance-toggle/sine/JS/appearance-site-child.mjs';

test('Sine loads the Original icons from packaged chrome files',()=>{
  const out=load(SINE);
  assert.equal(out.ORIG_MOON,'chrome://sine/content/zen-site-appearance-toggle/sine/JS/icons/moon.svg?v=1.3.4');
  assert.equal(out.ORIG_SPARKLE,'chrome://sine/content/zen-site-appearance-toggle/sine/JS/icons/sparkle.svg?v=1.3.4');
  assert.equal(out.ORIG_SUN,'chrome://sine/content/zen-site-appearance-toggle/sine/JS/icons/sun.svg?v=1.3.4');
  assert.equal(out.getMoonSrc(),out.ORIG_MOON);assert.equal(out.getLightSrc(),out.ORIG_SPARKLE);
});
test('fx-autoconfig chrome paths resolve next to the manual script',()=>{
  assert.equal(load('chrome://userscripts/content/appearance-site-child.mjs').ORIG_MOON,'chrome://userscripts/content/icons/moon.svg?v=1.3.4');
});
test('missing, jar-packed or file: icons fall back to the embedded copy',()=>{
  const data=n=>'data:image/svg+xml;utf8,'+encodeURIComponent(svg[n]);
  assert.equal(load(SINE,{exists:false}).ORIG_MOON,data('moon'));
  assert.equal(load(SINE,{fileURL:false}).ORIG_SUN,data('sun'));
  assert.equal(load('file:///C:/chrome/JS/appearance-site-child.mjs').ORIG_SPARKLE,data('sparkle'));
});
test('every variant ships identical context-fill icon files and the build is current',()=>{
  for(const dir of ['sine/JS','chrome/JS/moon-sparkle','chrome/JS/moon-sun'])for(const n of names){
    const packaged=fs.readFileSync(path.join(root,dir,'icons',n+'.svg'),'utf8');
    assert.equal(packaged,svg[n],dir+'/icons/'+n+'.svg');
    assert.match(packaged,/fill="context-fill"/);
  }
  execFileSync(process.execPath,[path.join(root,'tools/build.cjs'),'--check'],{cwd:root});
});
