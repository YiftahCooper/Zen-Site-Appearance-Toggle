function startAppearanceToolbar(win){
  const ID='zen-colorscheme-toggle',doc=win.document;
  win.__zenSiteAppearanceToggle?.stop?.();
  let menu=null,controller;
  const scopeNames={workspace:'this workspace',site:'this website','workspace-site':'this website in this workspace'};
  function refresh(){
    const btn=doc.getElementById(ID);if(!btn||!controller)return;
    try{
      const dark=controller.effectiveDark(),ctx=controller.currentContext();
      const text=win.__satError?'Appearance unavailable: '+win.__satError:`Switch ${scopeNames[ctx.scope]} to ${dark?'Light':'Dark'}${ctx.site?' — '+ctx.site.label:''}`;
      btn.setAttribute('tooltiptext',text);btn.setAttribute('aria-label',text);
      const light=SAT_VARIANT==='sun'?ORIG_SUN:SAT_VARIANT==='sparkle'?ORIG_SPARKLE:getLightSrc();
      const src=dark?(SAT_VARIANT==='sine'?getMoonSrc():ORIG_MOON):light;
      const img=btn.querySelector('.toolbarbutton-icon');if(img)img.setAttribute('src',src);
    }catch(e){btn.setAttribute('tooltiptext','SAT: '+e.message);}
  }
  controller=createController({environment:satEnvironment(win,refresh),policy:AppearancePolicy});
  function choose(value){try{controller.choose(value);delete win.__satError;refresh();}catch(e){win.__satError=e.message;refresh();}}
  function toggle(){try{choose(controller.effectiveDark()?'light':'dark');}catch(e){win.__satError=e.message;refresh();}}
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
    (doc.getElementById('mainPopupSet')||doc.documentElement).appendChild(menu);menu.openPopupAtScreen(event.screenX,event.screenY,true);
  }
  const api={controller,toggle,refresh,choose,stop(){
    controller.stop();doc.removeEventListener('contextmenu',context,true);win.removeEventListener('unload',api.stop);
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
