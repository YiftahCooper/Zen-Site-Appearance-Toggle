/* Read visible surfaces without changing the page or collecting page content. */
function readPageAppearance(doc){
  const uncertain=reason=>({theme:null,reason});
  const win=doc.defaultView,root=doc.documentElement;
  if(!win||!root||!doc.body||doc.readyState!=='complete')return uncertain('loading');
  if(!doc.elementsFromPoint)return uncertain('unavailable');
  function colour(raw){
    const match=/^rgba?\(([^)]+)\)$/.exec(raw||'');if(!match)return null;
    const values=match[1].replace(/\//g,' ').split(/[\s,]+/).filter(Boolean);
    if(values.length!==3&&values.length!==4)return null;
    const channels=values.slice(0,3).map(v=>v.endsWith('%')?parseFloat(v)*2.55:Number(v));
    const alpha=values.length===3?1:values[3].endsWith('%')?parseFloat(values[3])/100:Number(values[3]);
    return channels.every(v=>Number.isFinite(v)&&v>=0&&v<=255)&&Number.isFinite(alpha)&&alpha>=0&&alpha<=1?[...channels,alpha]:null;
  }
  function luminance(rgb){
    const linear=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
    return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
  }
  const rootStyle=win.getComputedStyle(root),scheme=rootStyle.colorScheme||'normal';
  // CSS normal uses a light canvas; a site's supported schemes can opt into
  // the dark native canvas. Explicitly painted surfaces take precedence.
  const darkCanvas=scheme.split(/\s+/).includes('dark')&&(!scheme.split(/\s+/).includes('light')||win.matchMedia('(prefers-color-scheme:dark)').matches);
  const canvas=darkCanvas?[0,0,0]:[255,255,255];
  function surface(element){
    if(!element||['img','video','canvas','iframe','svg'].includes(element.localName))return null;
    const chain=[];
    for(let e=element;e;e=e.parentElement){if(chain.length>=32)return null;chain.push(e);}
    let rgb=canvas.slice();
    for(const e of chain.reverse()){
      const style=win.getComputedStyle(e);
      if(style.backgroundImage&&style.backgroundImage!=='none'||style.opacity&&Number(style.opacity)<1||style.mixBlendMode&&style.mixBlendMode!=='normal'||style.filter&&style.filter!=='none')return null;
      const bg=colour(style.backgroundColor);if(!bg)return null;
      rgb=rgb.map((v,i)=>bg[i]*bg[3]+v*(1-bg[3]));
    }
    const value=luminance(rgb);return value<=.18?'dark':value>=.55?'light':null;
  }
  const width=win.innerWidth,height=win.innerHeight;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)return uncertain('unavailable');
  const votes={light:0,dark:0};
  for(const y of [.2,.5,.8])for(const x of [.2,.5,.8]){
    const element=doc.elementsFromPoint(width*x,height*y)[0],theme=surface(element);
    if(theme)votes[theme]++;
  }
  const theme=votes.light>=7?'light':votes.dark>=7?'dark':null;
  return theme?{theme,reason:'palette'}:uncertain('mixed-or-complex');
}
/* Narrow website-owned controls. This source is embedded in the child actor. */
async function siteAppearanceAction(doc,request){
  const url=new URL(doc.location.href),win=doc.defaultView;
  if(request?.operation==='page-appearance'){
    if(request.isCancelled?.())throw Error('Page appearance read cancelled');
    return ['http:','https:'].includes(url.protocol)?readPageAppearance(doc):{theme:null,reason:'unavailable'};
  }
  if(url.protocol!=='https:'||url.port||!['gemini.google.com','www.google.com','google.com','images.google.com'].includes(url.hostname))throw Error('Unsupported website setup');
  if(!['inspect','set','appearance','device-report','capture','restore'].includes(request?.operation))throw Error('Unsupported setup operation');
  const gemini=url.hostname==='gemini.google.com';
  if(['appearance','device-report','capture','restore'].includes(request.operation)){
    if(gemini||!['/','/search','/webhp','/imghp'].includes(url.pathname))throw Error('Unsupported Google page operation');
  }else if(!gemini&&(url.hostname==='images.google.com'||url.pathname!=='/preferences'))throw Error('Google setup requires its Search settings page');
  const allowed=gemini?['System','Light','Dark']:['0','1','2'];
  if(request.operation==='set'&&!allowed.includes(request.theme))throw Error('Unsupported website theme');
  let expectedHref=doc.location.href;
  function guard(){
    if(request.isCancelled?.())throw Error('Website theme operation cancelled');
    if(!doc.defaultView||doc.defaultView.document!==doc||doc.location.href!==expectedHref)throw Error('Website navigated during setup');
  }
  async function delay(ms){
    for(let remaining=ms;remaining>0;remaining-=50){guard();await new Promise(resolve=>win.setTimeout(resolve,Math.min(50,remaining)));guard();}
  }
  function click(element,ownGoogleSection=false){
    guard();element.click();
    if(ownGoogleSection){
      // Only the synchronous fragment navigation caused by our own section
      // click may advance the target. Later hash changes remain navigation.
      if(doc.defaultView&&doc.defaultView.document===doc){
        const next=new URL(doc.location.href),before=new URL(expectedHref);
        next.hash=before.hash;
        if(next.href===before.href)expectedHref=doc.location.href;
      }
      guard();
    }
  }
  guard();
  if(request.operation==='device-report'){
    if(typeof request.dark!=='boolean')throw Error('A Google appearance preference is required');
    const wanted=request.dark?'2':'1';
    // Google reports its device preference asynchronously after page load.
    // Navigating earlier can cancel that request and fetch the old palette.
    for(let attempt=0;attempt<80;attempt++){
      guard();
      const completed=win.performance.getEntriesByType('resource').some(entry=>{
        try{const report=new URL(entry.name);return report.origin===url.origin&&report.pathname==='/client_204'&&report.searchParams.get('cs')===wanted&&entry.responseStart>0&&entry.responseEnd>=entry.responseStart&&(entry.responseStatus===undefined||entry.responseStatus>=200&&entry.responseStatus<300);}catch{return false;}
      });
      if(completed)return {completed:true};
      await delay(50);
    }
    throw Error('Google device appearance report did not complete');
  }
  if(request.operation==='appearance')return {
    mediaDark:win.matchMedia('(prefers-color-scheme:dark)').matches,
    pcs:[...new Set([...doc.querySelectorAll('[data-pcs]')].map(element=>element.getAttribute('data-pcs')))],
    background:win.getComputedStyle(doc.body).backgroundColor
  };
  const visible=e=>e&&[...e.getClientRects()].some(r=>r.width>0&&r.height>0)&&win.getComputedStyle(e).visibility!=='hidden';
  if(['capture','restore'].includes(request.operation)){
    // Draft text and selection exist only in this query's ephemeral snapshot.
    // Password, hidden and other non-search input types are never collected.
    function searchField(){
      const fields=[...doc.querySelectorAll('textarea[name="q"],input[name="q"]')].filter(element=>visible(element)&&(element.localName==='textarea'||['text','search'].includes(element.type)));
      if(fields.length>1)throw Error('Google search input is ambiguous');
      return fields[0]||null;
    }
    if(request.operation==='capture'){
      const field=searchField();
      return {scroll:{x:win.scrollX,y:win.scrollY},searchInput:field?{value:field.value,focused:doc.activeElement===field,selectionStart:field.selectionStart,selectionEnd:field.selectionEnd,selectionDirection:field.selectionDirection}:null};
    }
    const snapshot=request.snapshot;
    const shape=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
    const coordinate=value=>Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER;
    if(!shape(snapshot,['scroll','searchInput'])||!shape(snapshot.scroll,['x','y'])||!coordinate(snapshot.scroll.x)||!coordinate(snapshot.scroll.y))throw Error('Invalid Google page snapshot');
    const input=snapshot.searchInput;
    if(input!==null&&(!shape(input,['value','focused','selectionStart','selectionEnd','selectionDirection'])||typeof input.value!=='string'||typeof input.focused!=='boolean'||!Number.isInteger(input.selectionStart)||!Number.isInteger(input.selectionEnd)||input.selectionStart<0||input.selectionEnd<input.selectionStart||input.selectionEnd>input.value.length||!['forward','backward','none'].includes(input.selectionDirection)))throw Error('Invalid Google search input snapshot');
    const field=searchField();
    if(input&&!field)throw Error('Google search field is unavailable after refresh');
    if(input&&(field.value===(url.searchParams.get('q')||'')||field.value===input.value)){
      if(field.value!==input.value){
        guard();field.value=input.value;
        guard();field.dispatchEvent(new win.InputEvent('input',{bubbles:true,composed:true,inputType:'insertReplacementText',data:input.value}));
      }
      const active=doc.activeElement;
      if(input.focused&&field.isConnected&&field.value===input.value&&(!active||active===doc.body||active===doc.documentElement||active===field)){
        guard();field.focus({preventScroll:true});
        guard();if(doc.activeElement===field&&field.isConnected&&field.value===input.value)field.setSelectionRange(input.selectionStart,input.selectionEnd,input.selectionDirection);
      }
    }
    guard();win.scrollTo({left:snapshot.scroll.x,top:snapshot.scroll.y,behavior:'instant'});
    guard();
    return {restored:true,searchTextPreserved:input?searchField()?.value===input.value:true};
  }
  async function wait(find,label){
    for(let i=0;i<40;i++){guard();const found=find();if(found)return found;await delay(50);}
    throw Error('Website theme control unavailable: '+label);
  }
  const focus=doc.activeElement;
  function close(){
    guard();
    const target=doc.activeElement||doc.body;
    target?.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
    guard();
    target?.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
    guard();
    if(focus?.isConnected)focus.focus?.({preventScroll:true});
  }
  if(gemini){
    const stored=()=>{try{return /^Bard-(System|Light|Dark)-Theme$/.exec(win.localStorage.getItem('Bard-Color-Theme')||'')?.[1]||null;}catch{return null;}};
    if(!doc.querySelector('[role="menuitemradio"]')){
      if(!doc.querySelector('[data-test-id="desktop-theme-menu-button"]')){
        const settings=await wait(()=>doc.querySelector('button:has([data-mat-icon-name="settings"])')||doc.querySelector('button[aria-label="Settings"]'),'Gemini Settings');click(settings);
      }
      click(await wait(()=>doc.querySelector('[data-test-id="desktop-theme-menu-button"]'),'Gemini Theme'));
    }
    const choices=await wait(()=>{const c=[...doc.querySelectorAll('[role="menuitemradio"]')];return c.length===3?c:null;},'Gemini theme choices');
    const modes=['System','Light','Dark'],checked=choices.filter(e=>e.getAttribute('aria-checked')==='true');
    if(checked.length!==1)throw Error('Gemini theme selection is ambiguous');
    const before=modes[choices.indexOf(checked[0])],saved=stored();
    // Gemini's stable Theme menu order is System, Light, Dark across locales.
    // Reject any disagreement with its canonical setting rather than guess.
    if(saved&&saved!==before)throw Error('Gemini theme state has changed; try again');
    if(request.operation==='inspect'){close();return {before,after:before};}
    if(before!==request.theme){click(choices[modes.indexOf(request.theme)]);await wait(()=>stored()===request.theme,'Gemini saved theme');}
    close();return {before,after:stored()||before};
  }
  let dialog=[...doc.querySelectorAll('[role="dialog"][aria-label="Dark theme"]')].find(visible);
  if(!dialog){
    // Google pre-creates hidden controls before initializing this section.
    // Their initial values are not evidence of the saved account preference.
    const other=[...doc.querySelectorAll('[role="tab"],a,div[jsname],span[jsname]')].find(e=>e.textContent.trim()==='Other settings');
    if(other)click(other,true);
    click(await wait(()=>[...doc.querySelectorAll('[data-pid="cs"]')].find(visible),'Google initialized Dark theme'));
    dialog=await wait(()=>[...doc.querySelectorAll('[role="dialog"][aria-label="Dark theme"]')].find(visible),'Google theme dialog');
  }
  const labels=[...dialog.querySelectorAll('label[data-value]')],checked=labels.filter(e=>e.control?.checked);
  if(labels.length!==3||checked.length!==1||!allowed.includes(checked[0].dataset.value))throw Error('Google theme selection is ambiguous');
  const before=checked[0].dataset.value;
  if(request.operation==='inspect')return {before,after:before};
  if(before!==request.theme){
    const target=labels.find(e=>e.dataset.value===request.theme);if(!target)throw Error('Google theme choice unavailable');click(target);
    await delay(100);
    const confirm=[...dialog.querySelectorAll('[role="button"],button')].find(e=>e.textContent.trim()==='Confirm');
    if(!confirm||!target.control?.checked)throw Error('Google theme confirmation unavailable');
    click(confirm);
  }
  // Confirmation may navigate. The parent must verify on an independent page;
  // this response reports the attempted control operation, not persisted proof.
  return {before,after:request.theme,requiresVerification:true};
}
if(typeof module!=='undefined')module.exports={siteAppearanceAction};
