function startAppearanceToolbar(win){
  const ID='zen-colorscheme-toggle',doc=win.document;
  win.__zenSiteAppearanceToggle?.stop?.();
  let menu=null,controller,busy=false,alive=true;
  const favicons=startAppearanceFavicons(win),siteSetup=startSiteSetup(win);
  const googleTouched=new WeakMap();let googleTimer=null;
  const scopeNames={workspace:'this workspace',site:'this website','workspace-site':'this website in this workspace'};
  function googleTarget(tab){
    if(!tab||tab!==win.gBrowser.selectedTab||!tab.isConnected||tab.closing||tab.hasAttribute('pending'))return null;
    const browser=tab.linkedBrowser;
    if(browser.webProgress?.isLoadingDocument||!browser.browsingContext?.currentWindowGlobal)return null;
    const ctx=siteSetup.context(tab);
    if(ctx?.service!=='google-search'||ctx.unsupportedAccount)return null;
    if(!['/','/search','/webhp','/imghp'].includes(new URL(ctx.href).pathname))return null;
    const stored=googleTouched.get(tab),previous=stored?.id===ctx.id?stored:null;
    if(!previous?.touched&&controller.choice()==='inherit')return null;
    return {ctx,previous,document:browser.browsingContext.currentWindowGlobal};
  }
  function beginGoogle(tab,ctx,dark,touched=false){
    const prior=googleTouched.get(tab),state=prior?.id===ctx.id?prior:{id:ctx.id,touched:false,observedWindowGlobal:null};
    state.dark=dark;state.touched||=touched;
    state.attemptWindowGlobal=tab.linkedBrowser.browsingContext?.currentWindowGlobal;state.attemptDark=dark;
    googleTouched.set(tab,state);return state;
  }
  function finishGoogle(tab,ctx,state,success,attemptedDocument=null){
    if(!alive||googleTouched.get(tab)!==state)return;
    const current=googleTarget(tab);
    if(current?.ctx.id!==ctx.id)return;
    if(success||attemptedDocument===current.document)state.attemptWindowGlobal=current.document;
    if(success){state.touched=true;state.observedWindowGlobal=current.document;}
  }
  async function repaintGoogle(tab,ctx,dark,touched=false){
    // Record the requested colour before loadURI can emit progress callbacks.
    // Final document identity closes the feedback loop after verified navigation.
    const state=ctx.service==='google-search'?beginGoogle(tab,ctx,dark,touched):null;
    try{await siteSetup.repaintGoogle(tab,dark);if(state)finishGoogle(tab,ctx,state,true);}
    catch(e){if(state)finishGoogle(tab,ctx,state,false,e.satGoogleAttemptedDocument);throw e;}
  }
  function needsGoogle(target,dark){
    const previous=target.previous;
    return (!previous||previous.dark!==dark||previous.observedWindowGlobal!==target.document)&&
      !(previous?.attemptWindowGlobal===target.document&&previous.attemptDark===dark);
  }
  function scheduleGoogle(){
    if(!alive||!controller||busy||googleTimer!==null)return;
    const target=googleTarget(win.gBrowser.selectedTab);
    if(!target||!needsGoogle(target,controller.effectiveDark()))return;
    googleTimer=win.setTimeout(async()=>{
      googleTimer=null;
      if(!alive||busy)return;
      const tab=win.gBrowser.selectedTab,current=googleTarget(tab);
      if(!current)return;
      const dark=controller.effectiveDark();if(!needsGoogle(current,dark))return;
      const colourChanged=!!current.previous&&current.previous.dark!==dark;
      const state=beginGoogle(tab,current.ctx,dark);
      busy=true;refresh();
      try{
        if(colourChanged)await repaintGoogle(tab,current.ctx,dark);
        else{
          const healthy=await siteSetup.verifyGoogle(tab,dark),latest=googleTarget(tab);
          // A readback from a departing document cannot authorize a repaint of
          // a new document. Its next notification will verify that document.
          if(!alive||latest?.ctx.id!==current.ctx.id||latest.document!==current.document)return;
          if(healthy)finishGoogle(tab,current.ctx,state,true);
          else await repaintGoogle(tab,current.ctx,dark);
        }
        if(alive)delete win.__satError;
      }
      catch(e){if(alive)win.__satError=e.message;}
      finally{busy=false;if(alive)refresh();}
    },0);
  }
  function refresh(){
    if(!alive||!controller)return;
    scheduleGoogle();
    const btn=doc.getElementById(ID);if(!btn)return;
    try{
      const dark=controller.effectiveDark(),ctx=controller.currentContext();
      const recovery=typeof siteSetup.pendingGoogleDraft?.(win.gBrowser.selectedTab)==='string'?' Right-click to copy the unsent Google search.':'';
      const text=busy?'Applying this website’s appearance…':win.__satError?'Appearance unavailable: '+win.__satError+recovery:`Switch ${scopeNames[ctx.scope]} to ${dark?'Light':'Dark'}${ctx.site?' — '+ctx.site.label:''}`;
      btn.setAttribute('tooltiptext',text);btn.setAttribute('aria-label',text);
      btn.disabled=busy;
      const light=SAT_VARIANT==='sun'?ORIG_SUN:SAT_VARIANT==='sparkle'?ORIG_SPARKLE:getLightSrc();
      const src=dark?(SAT_VARIANT==='sine'?getMoonSrc():ORIG_MOON):light;
      const img=btn.querySelector('.toolbarbutton-icon');if(img)img.setAttribute('src',src);
    }catch(e){btn.setAttribute('tooltiptext','SAT: '+e.message);}
  }
  controller=createController({environment:satEnvironment(win,refresh),policy:AppearancePolicy});
  function choose(value,toggling=false){
    if(busy||!alive)return;
    const tab=win.gBrowser.selectedTab,ctx=siteSetup.context(tab);
    if(!ctx||value==='inherit'&&!googleTarget(tab)){
      try{controller.choose(value);delete win.__satError;refresh();}catch(e){win.__satError=e.message;refresh();}return;
    }
    busy=true;refresh();
    return (async()=>{
      try{
        const setup=value==='inherit'?null:await siteSetup.ensure(tab);
        if(!alive||win.gBrowser.selectedTab!==tab||siteSetup.context(tab)?.href!==ctx.href)throw Error('The selected website changed before appearance could be applied');
        if(toggling&&setup){
          const explicitDark=setup.before==='Dark'||setup.before==='2';
          const explicitLight=setup.before==='Light'||setup.before==='1';
          if(explicitDark||explicitLight)value=explicitDark?'light':'dark';
        }
        controller.choose(value);delete win.__satError;
        await repaintGoogle(tab,ctx,controller.effectiveDark(),true);
      }catch(e){if(alive)win.__satError=e.message;}
      finally{busy=false;if(alive)refresh();}
    })();
  }
  function toggle(){try{return choose(controller.effectiveDark()?'light':'dark',true);}catch(e){win.__satError=e.message;refresh();}}
  function context(event){
    if(!event.target.closest?.('#'+ID))return;
    event.preventDefault();event.stopPropagation();
    menu?.remove();menu=doc.createXULElement('menupopup');menu.id='sat-appearance-menu';
    const ctx=controller.currentContext();
    for(const [value,label] of [['dark','Dark'],['light','Light'],['system','System'],['inherit','Use browser default']]){
      const item=doc.createXULElement('menuitem');item.id='sat-choice-'+value;
      item.setAttribute('label',label+' — '+scopeNames[ctx.scope]);item.setAttribute('type','radio');item.setAttribute('name','sat-appearance');
      item.setAttribute('checked',String(controller.choice()===value));item.addEventListener('command',()=>choose(value));menu.appendChild(item);
    }
    if(typeof siteSetup.pendingGoogleDraft?.(win.gBrowser.selectedTab)==='string'){
      const item=doc.createXULElement('menuitem');item.id='sat-copy-google-draft';item.setAttribute('label','Copy unsent Google search');
      item.addEventListener('command',()=>{
        if(!alive)return;
        const draft=siteSetup.pendingGoogleDraft?.(win.gBrowser.selectedTab);
        if(typeof draft==='string')Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(draft);
      });menu.appendChild(item);
    }
    (doc.getElementById('mainPopupSet')||doc.documentElement).appendChild(menu);menu.openPopupAtScreen(event.screenX,event.screenY,true);
  }
  const api={controller,siteSetup,toggle,refresh,choose,get busy(){return busy;},stop(){
    if(!alive)return;alive=false;if(googleTimer!==null){win.clearTimeout(googleTimer);googleTimer=null;}siteSetup.stop();favicons.stop();controller.stop();doc.removeEventListener('contextmenu',context,true);win.removeEventListener('unload',api.stop);
    menu?.remove();if(win.__zenSiteAppearanceToggle===api)delete win.__zenSiteAppearanceToggle;
    const any=Array.from(CustomizableUI.windows).some(w=>w.__zenSiteAppearanceToggle);
    if(!any)CustomizableUI.destroyWidget(ID);
  }};
  win.__zenSiteAppearanceToggle=api;
  if(!CustomizableUI.getWidget(ID)?.source)CustomizableUI.createWidget({id:ID,type:'button',defaultArea:CustomizableUI.AREA_NAVBAR,label:'Website Appearance',
    onCreated:btn=>btn.ownerDocument.defaultView.setTimeout(()=>btn.ownerDocument.defaultView.__zenSiteAppearanceToggle?.refresh(),0),
    onCommand:event=>event.target.ownerDocument.defaultView.__zenSiteAppearanceToggle?.toggle()});
  doc.addEventListener('contextmenu',context,true);win.addEventListener('unload',api.stop,{once:true});
  win.addUnloadListener?.(api.stop);
  controller.start();return api;
}
if(document.readyState==='complete')startAppearanceToolbar(window);
else window.addEventListener('load',()=>startAppearanceToolbar(window),{once:true});
