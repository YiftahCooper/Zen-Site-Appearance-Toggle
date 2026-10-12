/* Parent-side native transport. No page scripts or arbitrary code are evaluated. */
function startSiteSetup(win){
  const KEY=SAT_PREFIX+'site-setup',ACTOR='SatSiteAppearance';
  const {PrivateBrowsingUtils}=ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs');
  const privateWindow=PrivateBrowsingUtils.isWindowPrivate(win);
  const registry=Array.from(CustomizableUI.windows).map(w=>w.__satSiteRegistry).find(Boolean)||{users:new Set(),locks:new Set(),registered:false};
  win.__satSiteRegistry=registry;registry.users.add(win);
  let stopped=false,drafts=new WeakMap();
  const temporary=new Set(),operations=new Set(),delay=ms=>new Promise(resolve=>win.setTimeout(resolve,ms));
  let sequence=0;
  function context(tab){
    const url=tab?.linkedBrowser?.currentURI?.spec||'';let parsed;try{parsed=new URL(url);}catch{return null;}
    if(parsed.protocol!=='https:'||parsed.port)return null;
    const service=parsed.hostname==='gemini.google.com'?'gemini':['google.com','www.google.com','images.google.com'].includes(parsed.hostname)&&['/','/search','/webhp','/imghp','/preferences'].includes(parsed.pathname)?'google-search':null;
    if(!service)return null;
    const container=tab.userContextId||Number(tab.getAttribute('usercontextid'))||0;
    const pathAccount=service==='gemini'?(/^\/u\/(\d+)(?:\/|$)/.exec(parsed.pathname)?.[1]??null):null;
    const supplied=parsed.searchParams.getAll('authuser');
    const raw=supplied[0]??pathAccount??null;
    const unsupportedAccount=supplied.length>1||(raw!==null&&!/^(0|[1-9]\d*)$/.test(raw))||(pathAccount!==null&&supplied.length&&supplied[0]!==pathAccount);
    const account=unsupportedAccount?null:raw;
    return {id:service+':'+container+(account===null?'':':'+account),service,container,account,unsupportedAccount,label:(service==='gemini'?'Gemini':'Google Search')+(account===null?'':' · Account '+account)+(container?' · Container '+container:''),href:url,workspace:win.gZenWorkspaces?.activeWorkspace||null};
  }
  function register(){
    if(registry.registered)return;
    // The module is packaged alongside each variant. Sine supplies its trusted
    // chrome URI. Manual files receive an owned resource alias for the folder.
    let uri=SAT_SITE_CHILD_URI();
    if(uri.startsWith('file:')){
      const handler=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
      registry.resourceHandler=handler;registry.resourceBefore=handler.hasSubstitution('sat-site-appearance')?handler.getSubstitution('sat-site-appearance'):null;
      handler.setSubstitution('sat-site-appearance',Services.io.newURI('.',null,Services.io.newURI(uri)));
      uri='resource://sat-site-appearance/appearance-site-child.mjs';
    }
    // General pages receive only the read-only appearance operation. The child
    // keeps all website-setting operations behind the original service gates.
    ChromeUtils.registerWindowActor(ACTOR,{child:{esModuleURI:uri+'?v=1.3.2'},matches:['http://*/*','https://*/*'],remoteTypes:['web'],safeForUntrustedWebProcess:true,allFrames:false});
    registry.registered=true;
  }
  async function ready(tab,expected,previous=null){
    for(let i=0;i<300;i++){
      if(stopped||tab.closing||!tab.isConnected)throw Error('Website setup stopped');
      const browser=tab.linkedBrowser,wg=browser.browsingContext?.currentWindowGlobal;
      const url=wg?.documentURI?.spec||'';
      if(wg!==previous&&url.startsWith(expected)&&!browser.webProgress?.isLoadingDocument)return wg;
      await delay(50);
    }
    throw Error('Website settings did not finish loading');
  }
  async function query(tab,request,current=null){
    if(stopped)throw Error('Website setup stopped');
    if(current&&!current())throw Error('The selected website changed during setup');
    register();
    const wg=tab.linkedBrowser.browsingContext?.currentWindowGlobal;if(!wg)throw Error('Website is not loaded');
    const uri=wg.documentURI.spec;
    const actor=wg.getActor(ACTOR),operationId=Services.uuid.generateUUID().toString()+':'+(++sequence);
    let timer,watch,cancel,done=false;
    const aborted=new Promise((_,reject)=>{cancel=message=>{try{actor.sendAsyncMessage('SAT:Cancel',{operationId});}catch{}reject(Error(message));};});
    operations.add(cancel);
    timer=win.setTimeout(()=>cancel('Website theme operation timed out'),6000);
    const check=()=>{if(done)return;if(current&&!current()){cancel('The selected website changed during setup');return;}watch=win.setTimeout(check,50);};
    try{
      const pending=actor.sendQuery('SAT:Theme',{...request,expectedHref:uri,operationId});
      if(current)check();
      const response=await Promise.race([pending,aborted]);
      if(stopped)throw Error('Website setup stopped');
      if(current&&!current())throw Error('The selected website changed during setup');
      if(['appearance','device-report','capture','restore'].includes(request.operation)&&tab.linkedBrowser.browsingContext?.currentWindowGlobal!==wg)throw Error('Google navigated before its appearance could be verified');
      return response;
    }
    finally{done=true;win.clearTimeout(timer);if(watch!==undefined)win.clearTimeout(watch);operations.delete(cancel);}
  }
  async function inTemporary(ctx,fn){
    const url=new URL(ctx.service==='google-search'?'https://www.google.com/preferences?hl=en&fg=1#appearance':ctx.account==null?'https://gemini.google.com/':'https://gemini.google.com/u/'+ctx.account+'/');
    if(ctx.account!=null)url.searchParams.set('authuser',ctx.account);
    const tab=win.gBrowser.addTab(url.href,{userContextId:ctx.container,triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),inBackground:true,skipAnimation:true});
    temporary.add(tab);
    try{await ready(tab,ctx.service==='google-search'?'https://www.google.com/preferences':'https://gemini.google.com/');const observed=context(tab);if(!observed||observed.unsupportedAccount||observed.id!==ctx.id)throw Error('The website changed the requested account; setup was canceled');return await fn(tab);}
    finally{temporary.delete(tab);if(tab.isConnected&&!tab.closing)win.gBrowser.removeTab(tab,{animate:false,skipPermitUnload:true});}
  }
  async function control(ctx,request,clicked){
    if(ctx.unsupportedAccount)throw Error('This website account selector is unsupported; no website setting was changed');
    if(privateWindow&&request.operation!=='inspect')throw Error('Website setup is not changed in private windows');
    const current=clicked?()=>!stopped&&win.gBrowser.selectedTab===clicked&&context(clicked)?.href===ctx.href&&(win.gZenWorkspaces?.activeWorkspace||null)===ctx.workspace:null;
    // Each Google call has a fresh settings document, giving confirmation an
    // independent persistence readback. Existing Search tabs stay untouched.
    if(ctx.service==='google-search')return inTemporary(ctx,async tab=>{
      const response=await query(tab,request,current);
      if(request.operation==='set')await delay(600);
      return response;
    });
    const live=clicked||Array.from(win.gBrowser.tabs).find(t=>{const observed=context(t);return !t.hasAttribute('pending')&&!t.closing&&observed&&!observed.unsupportedAccount&&observed.id===ctx.id;});
    if(live){const observed=context(live);if(!observed||observed.unsupportedAccount||observed.id!==ctx.id)throw Error('Website navigated during setup');return query(live,request,current);}
    return inTemporary(ctx,tab=>query(tab,request));
  }
  const api=createSiteSetup({privateWindow,locks:registry.locks,context,
    isCurrent:(tab,ctx)=>!stopped&&win.gBrowser.selectedTab===tab&&context(tab)?.href===ctx.href&&(win.gZenWorkspaces?.activeWorkspace||null)===ctx.workspace,
    read:()=>JSON.parse(Services.prefs.getStringPref(KEY,'{"version":1,"records":{}}')),
    write:j=>Services.prefs.setStringPref(KEY,JSON.stringify(j)),control});
  const matchesGoogle=(s,dark)=>s.mediaDark===dark&&s.pcs.length===1&&s.pcs[0]===(dark?'2':'1');
  return {...api,privateWindow,context,
    async observeAppearance(tab){
      const unavailable={theme:null,reason:'unavailable'};
      if(stopped||!tab||tab!==win.gBrowser.selectedTab||!tab.isConnected||tab.closing||tab.hasAttribute('pending'))return unavailable;
      const browser=tab.linkedBrowser,href=browser?.currentURI?.spec;
      if(!/^https?:\/\//i.test(href||'')||browser.webProgress?.isLoadingDocument)return unavailable;
      const wg=browser.browsingContext?.currentWindowGlobal;if(!wg)return unavailable;
      const current=()=>!stopped&&tab===win.gBrowser.selectedTab&&tab.isConnected&&!tab.closing&&!tab.hasAttribute('pending')&&browser.currentURI.spec===href&&browser.browsingContext?.currentWindowGlobal===wg;
      const sample=await query(tab,{operation:'page-appearance'},current);
      if(!current())throw Error('Page changed before appearance could be read');
      if(!sample||![null,'light','dark'].includes(sample.theme))return unavailable;
      return {theme:sample.theme,reason:typeof sample.reason==='string'?sample.reason:'unavailable'};
    },
    // A failed navigation may remove unsent input. Keep recovery in memory
    // only, accessible solely by the user's explicit copy command.
    pendingGoogleDraft(tab){const values=(drafts.get(tab)||[]).filter(d=>d.failed&&d.snapshot.searchInput).map(d=>d.snapshot.searchInput.value);return values.length?[...new Set(values)].join('\n\n'):null;},
    async verifyGoogle(tab,dark){
      const ctx=context(tab);if(ctx?.service!=='google-search'||ctx.unsupportedAccount)return false;
      const current=()=>!stopped&&win.gBrowser.selectedTab===tab&&tab.linkedBrowser.currentURI.spec===ctx.href;
      return matchesGoogle(await query(tab,{operation:'appearance'},current),dark);
    },
    async repaintGoogle(tab,dark){
      if(context(tab)?.service!=='google-search')return;
      const url=new URL(tab.linkedBrowser.currentURI.spec);
      if(!['/','/search','/webhp','/imghp'].includes(url.pathname))return;
      const beforeURL=url.href;
      const beforeCurrent=()=>!stopped&&win.gBrowser.selectedTab===tab&&tab.linkedBrowser.currentURI.spec===beforeURL;
      const snapshot=await query(tab,{operation:'capture'},beforeCurrent);
      const draft={snapshot,failed:false},retained=drafts.get(tab)||[];retained.push(draft);drafts.set(tab,retained);
      let attemptedDocument=null;
      const release=()=>{if(drafts.get(tab)===retained){const index=retained.indexOf(draft);if(index>=0)retained.splice(index,1);if(!retained.length)drafts.delete(tab);}};
      try{
      url.searchParams.set('cs',dark?'2':'1');
      // Use the current result URL so query, Images mode and filters survive.
      // No other tabs are reloaded, and no global setting is written.
      let previous=tab.linkedBrowser.browsingContext.currentWindowGlobal;
      tab.linkedBrowser.loadURI(Services.io.newURI(url.href),{loadFlags:Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY,triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
      attemptedDocument=await ready(tab,url.href,previous);
      const current=()=>!stopped&&win.gBrowser.selectedTab===tab&&tab.linkedBrowser.currentURI.spec===url.href&&tab.linkedBrowser.browsingContext?.currentWindowGlobal===attemptedDocument;
      if(!current())throw Error('The selected Google page changed before appearance could be verified');
      let sample=await query(tab,{operation:'appearance'},current);
      if(!matchesGoogle(sample,dark)){
        try{
          const report=await query(tab,{operation:'device-report',dark},current);
          if(report.completed!==true)throw Error('Google device appearance report did not complete');
        }catch(e){
          // A failed wait must not turn an unsent search into lost input.
          // The guarded restore yields to newer typing and other documents.
          try{const restored=await query(tab,{operation:'restore',snapshot},current);if(!snapshot.searchInput||restored.searchTextPreserved===true)release();}catch{}
          throw e;
        }
        const retrySnapshot=await query(tab,{operation:'capture'},current);
        const retryInput=retrySnapshot.searchInput;
        if(retryInput&&retryInput.value!==(url.searchParams.get('q')||'')&&retryInput.value!==snapshot.searchInput?.value)throw Error('Google appearance retry paused to preserve newly typed Search text');
        if(!current())throw Error('The selected Google page changed before its appearance retry');
        // The report completed; one fresh load can now use its recorded choice.
        previous=tab.linkedBrowser.browsingContext.currentWindowGlobal;
        tab.linkedBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE);
        attemptedDocument=await ready(tab,url.href,previous);
        sample=await query(tab,{operation:'appearance'},current);
      }
      const restored=await query(tab,{operation:'restore',snapshot},current);
      if(snapshot.searchInput&&restored.searchTextPreserved===false)throw Error('Google kept newer page input; the earlier unsent Search text can be recovered');
      release();
      if(!matchesGoogle(sample,dark))throw Error('Google did not render the requested appearance; its saved SAT choice has been retained');
      }catch(e){
        if(attemptedDocument&&tab.linkedBrowser.browsingContext?.currentWindowGlobal===attemptedDocument)e.satGoogleAttemptedDocument=attemptedDocument;
        if(drafts.get(tab)===retained){draft.failed=true;if(retained.some(d=>d!==draft&&d.failed&&d.snapshot.searchInput?.value===snapshot.searchInput?.value))release();if(snapshot.searchInput)e.message+='; unsent Search text is available from the SAT right-click menu';}
        throw e;
      }
    },
    stop(){if(stopped)return;stopped=true;drafts=new WeakMap();for(const cancel of operations)cancel('Website setup stopped');operations.clear();for(const tab of temporary)if(tab.isConnected&&!tab.closing)win.gBrowser.removeTab(tab,{animate:false,skipPermitUnload:true});temporary.clear();registry.users.delete(win);delete win.__satSiteRegistry;
      if(!registry.users.size){if(registry.registered)ChromeUtils.unregisterWindowActor(ACTOR);registry.registered=false;if(registry.resourceHandler)registry.resourceHandler.setSubstitution('sat-site-appearance',registry.resourceBefore);}
    }
  };
}
