const SAT_PREF='layout.css.prefers-color-scheme.content-override';
const SAT_PREFIX='mod.zensiteappearancetoggle.';
const SAT_STATE=SAT_PREFIX+'state', SAT_LEGACY=SAT_PREFIX+'workspacemap';
// The parsed store is shared by every caller until either raw preference
// string changes. It is frozen so an accidental in-place edit cannot corrupt
// the cache; policy updates already work on copies.
let satStoreCache=null;
function satFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))satFreeze(v);Object.freeze(value);}
  return value;
}
function satRead(){
  const raw=Services.prefs.getStringPref(SAT_STATE,''),legacy=Services.prefs.getStringPref(SAT_LEGACY,'{}');
  if(satStoreCache&&satStoreCache.raw===raw&&satStoreCache.legacy===legacy)return satStoreCache.store;
  const store=satFreeze(AppearancePolicy.parseStore(raw,legacy));
  satStoreCache={raw,legacy,store};return store;
}
function satWrite(store){
  const raw=AppearancePolicy.serialize(store);
  if(Services.prefs.getStringPref(SAT_STATE,'')!==raw.state)Services.prefs.setStringPref(SAT_STATE,raw.state);
  if(Services.prefs.getStringPref(SAT_LEGACY,'{}')!==raw.legacy)Services.prefs.setStringPref(SAT_LEGACY,raw.legacy);
}
function satScope(win){
  const v=Services.prefs.getStringPref(SAT_PREFIX+'scope','workspace-site');
  // A toolbar action always belongs to its website. Retain old workspace
  // records on disk, but do not reuse a workspace-wide exception for all sites.
  return !win.gZenWorkspaces?'site':v==='workspace'?'workspace-site':['site','workspace-site'].includes(v)?v:'workspace-site';
}
// Recognition depends only on the URL and the saved groups. Any store change
// supplies a new groups object and therefore a new cache; the cap bounds memory.
const satSiteCache=new WeakMap();
function satSite(url,store){
  let cache=satSiteCache.get(store.groups);
  if(!cache){cache=new Map();satSiteCache.set(store.groups,cache);}
  let site=cache.get(url);
  if(site===undefined){
    site=AppearancePolicy.recogniseSite(url,{baseDomain:h=>Services.eTLD.getBaseDomainFromHost(h),userRules:store.groups});
    if(site)Object.freeze(site);
    if(cache.size>=512)cache.clear();
    cache.set(url,site);
  }
  return site;
}
// Tab attributes that can change a tab's saved context or loaded state.
// Title, icon, progress and sound changes are ignored.
const SAT_TAB_ATTRIBUTES=new Set(['pending','discarded','busy','zen-essential','zen-workspace-id']);
function satEnvironment(win,notify){
  const system=win.matchMedia('(-moz-system-dark-theme)');
  const {PrivateBrowsingUtils}=ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs');
  // CustomizableUI itself is frozen. Share ownership through its browser
  // windows; the weak keys do not keep closed tabs or browsing contexts alive.
  const ownership=Array.from(CustomizableUI.windows).map(w=>w.__satOwnership).find(Boolean)||new WeakMap();
  win.__satOwnership=ownership;
  const WPL=typeof Ci!=='undefined'&&Ci.nsIWebProgressListener||{STATE_START:0x1,STATE_STOP:0x10,STATE_IS_DOCUMENT:0x20000,STATE_IS_WINDOW:0x80000};
  return {
    ownership,
    tabs:()=>Array.from(win.gBrowser.tabs).filter(t=>!t.closing),
    // Whether a tab is still one of this window's open tabs. Closing (and
    // adopted) tabs are marked first; only a detached element needs a scan.
    live:t=>!!t&&!t.closing&&(t.isConnected&&t.ownerDocument===win.document||Array.from(win.gBrowser.tabs).includes(t)),
    selected:()=>win.gBrowser.selectedTab,
    browsingContext:t=>t.linkedBrowser?.browsingContext,
    context(t,store){return {workspaceId:(t.hasAttribute('zen-essential')?win.gZenWorkspaces?.activeWorkspace:t.getAttribute('zen-workspace-id'))||null,site:satSite(t.linkedBrowser?.currentURI?.spec||'',store)};},
    read:satRead,write:satWrite,scope:()=>satScope(win),privateWindow:PrivateBrowsingUtils.isWindowPrivate(win),
    systemDark:()=>system.matches,
    defaultDark:()=>{const v=Services.prefs.getIntPref(SAT_PREF,2);return v===0||v!==1&&(v===3?(Services.appinfo?.contentThemeDerivedColorSchemeIsDark??system.matches):system.matches);},
    notify,error:e=>{console.error('[SAT]',e);win.__satError=String(e.message||e);notify();},
    // Calls fn at most once per task: {full:true} after store, preference,
    // scope, workspace or theme changes, otherwise {full:false,tabs} naming
    // only the tabs whose own context or top-level document changed.
    listen(fn){
      let timer=null,alive=true,full=false;const dirty=new Set();
      const flush=()=>{
        timer=null;if(!alive)return;
        const change=full?{full:true}:{full:false,tabs:new Set(dirty)};
        full=false;dirty.clear();fn(change);
      };
      const schedule=()=>{if(timer===null&&alive)timer=win.setTimeout(flush,0);};
      const all=()=>{full=true;dirty.clear();schedule();};
      const one=tab=>{if(!tab)return all();if(!full)dirty.add(tab);schedule();};
      // An attribute change outside a tab (for example a workspace element)
      // is resolved by a full refresh rather than guessed.
      const tabElement=node=>node?.linkedBrowser?node:node?.closest?.('tab, .tabbrowser-tab')||null;
      const tabEvent=event=>{
        if(event.type==='TabAttrModified'){
          const changed=event.detail?.changed;
          if(Array.isArray(changed)&&!changed.some(name=>SAT_TAB_ATTRIBUTES.has(name)))return;
        }
        one(tabElement(event.target));
      };
      const browserTab=browser=>browser&&win.gBrowser.getTabForBrowser?.(browser)||null;
      const events=['TabSelect','TabOpen','TabClose','TabMove','TabAttrModified','SSTabRestored','TabBrowserInserted'];
      for(const event of events)win.gBrowser.tabContainer.addEventListener(event,tabEvent);
      const progress={
        // Subframe navigation and subresource requests cannot change a tab's site.
        onLocationChange(browser,webProgress){if(webProgress&&webProgress.isTopLevel===false)return;one(browserTab(browser));},
        onStateChange(browser,webProgress,request,flags){
          if(webProgress&&webProgress.isTopLevel===false)return;
          if(!(flags&(WPL.STATE_START|WPL.STATE_STOP))||!(flags&(WPL.STATE_IS_WINDOW|WPL.STATE_IS_DOCUMENT)))return;
          one(browserTab(browser));
        },
        QueryInterface:ChromeUtils.generateQI(['nsIWebProgressListener','nsISupportsWeakReference'])};
      win.gBrowser.addTabsProgressListener(progress);
      const observer=new win.MutationObserver(records=>{for(const record of records)one(tabElement(record.target));});
      observer.observe(win.gBrowser.tabContainer,{subtree:true,attributes:true,attributeFilter:['zen-workspace-id','zen-essential','pending']});
      win.gZenWorkspaces?.addChangeListeners(all);
      win.gZenWorkspaces?.promiseInitialized?.then(all);
      win.addEventListener('ZenWorkspacesUIUpdate',all);
      system.addEventListener('change',all);
      Services.obs?.addObserver(all,'look-and-feel-changed');
      Services.prefs.addObserver(SAT_PREFIX,all);Services.prefs.addObserver(SAT_PREF,all);
      return ()=>{alive=false;if(timer!==null)win.clearTimeout(timer);observer.disconnect();
        for(const event of events)win.gBrowser.tabContainer.removeEventListener(event,tabEvent);
        win.gBrowser.removeTabsProgressListener(progress);win.gZenWorkspaces?.removeChangeListeners(all);
        win.removeEventListener('ZenWorkspacesUIUpdate',all);system.removeEventListener('change',all);
        Services.obs?.removeObserver(all,'look-and-feel-changed');
        Services.prefs.removeObserver(SAT_PREFIX,all);Services.prefs.removeObserver(SAT_PREF,all);
      };
    }
  };
}
