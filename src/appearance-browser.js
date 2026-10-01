const SAT_PREF='layout.css.prefers-color-scheme.content-override';
const SAT_PREFIX='mod.zensiteappearancetoggle.';
const SAT_STATE=SAT_PREFIX+'state', SAT_LEGACY=SAT_PREFIX+'workspacemap';
function satRead(){return AppearancePolicy.parseStore(Services.prefs.getStringPref(SAT_STATE,''),Services.prefs.getStringPref(SAT_LEGACY,'{}'));}
function satWrite(store){
  const raw=AppearancePolicy.serialize(store);
  if(Services.prefs.getStringPref(SAT_STATE,'')!==raw.state)Services.prefs.setStringPref(SAT_STATE,raw.state);
  if(Services.prefs.getStringPref(SAT_LEGACY,'{}')!==raw.legacy)Services.prefs.setStringPref(SAT_LEGACY,raw.legacy);
}
function satScope(win){
  const v=Services.prefs.getStringPref(SAT_PREFIX+'scope','workspace');
  return !win.gZenWorkspaces?'site':['workspace','site','workspace-site'].includes(v)?v:'workspace';
}
function satSite(url,store){return AppearancePolicy.recogniseSite(url,{baseDomain:h=>Services.eTLD.getBaseDomainFromHost(h),userRules:store.groups});}
function satEnvironment(win,notify){
  const system=win.matchMedia('(-moz-system-dark-theme)');
  const {PrivateBrowsingUtils}=ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs');
  // CustomizableUI itself is frozen. Share ownership through its browser
  // windows; the weak keys do not keep closed tabs or browsing contexts alive.
  const ownership=Array.from(CustomizableUI.windows).map(w=>w.__satOwnership).find(Boolean)||new WeakMap();
  win.__satOwnership=ownership;
  return {
    ownership,
    tabs:()=>Array.from(win.gBrowser.tabs).filter(t=>!t.closing),
    selected:()=>win.gBrowser.selectedTab,
    browsingContext:t=>t.linkedBrowser?.browsingContext,
    context(t,store){return {workspaceId:(t.hasAttribute('zen-essential')?win.gZenWorkspaces?.activeWorkspace:t.getAttribute('zen-workspace-id'))||null,site:satSite(t.linkedBrowser?.currentURI?.spec||'',store)};},
    read:satRead,write:satWrite,scope:()=>satScope(win),privateWindow:PrivateBrowsingUtils.isWindowPrivate(win),
    systemDark:()=>system.matches,
    defaultDark:()=>{const v=Services.prefs.getIntPref(SAT_PREF,2);return v===0||v!==1&&(v===3?(Services.appinfo?.contentThemeDerivedColorSchemeIsDark??system.matches):system.matches);},
    notify,error:e=>{console.error('[SAT]',e);win.__satError=String(e.message||e);notify();},
    listen(fn){
      let timer=null,alive=true;
      const change=()=>{if(timer===null&&alive)timer=win.setTimeout(()=>{timer=null;fn();},0);};
      const events=['TabSelect','TabOpen','TabClose','TabMove','TabAttrModified','SSTabRestored','TabBrowserInserted'];
      for(const event of events)win.gBrowser.tabContainer.addEventListener(event,change);
      const progress={onLocationChange:change,onStateChange:change,QueryInterface:ChromeUtils.generateQI(['nsIWebProgressListener','nsISupportsWeakReference'])};
      win.gBrowser.addTabsProgressListener(progress);
      const observer=new win.MutationObserver(change);
      observer.observe(win.gBrowser.tabContainer,{subtree:true,attributes:true,attributeFilter:['zen-workspace-id','zen-essential','pending']});
      win.gZenWorkspaces?.addChangeListeners(change);
      win.gZenWorkspaces?.promiseInitialized?.then(change);
      win.addEventListener('ZenWorkspacesUIUpdate',change);
      system.addEventListener('change',change);
      Services.obs?.addObserver(change,'look-and-feel-changed');
      Services.prefs.addObserver(SAT_PREFIX,change);Services.prefs.addObserver(SAT_PREF,change);
      return ()=>{alive=false;if(timer!==null)win.clearTimeout(timer);observer.disconnect();
        for(const event of events)win.gBrowser.tabContainer.removeEventListener(event,change);
        win.gBrowser.removeTabsProgressListener(progress);win.gZenWorkspaces?.removeChangeListeners(change);
        win.removeEventListener('ZenWorkspacesUIUpdate',change);system.removeEventListener('change',change);
        Services.obs?.removeObserver(change,'look-and-feel-changed');
        Services.prefs.removeObserver(SAT_PREFIX,change);Services.prefs.removeObserver(SAT_PREF,change);
      };
    }
  };
}
