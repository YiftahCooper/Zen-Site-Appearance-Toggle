/* Stock GitHub sidebar presentation. Native favicon/session data is never written. */
const SAT_GITHUB_STOCK_SVG="<svg width=\"32\" height=\"32\" viewBox=\"0 0 32 32\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\r\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M16 0C7.16 0 0 7.16 0 16C0 23.08 4.58 29.06 10.94 31.18C11.74 31.32 12.04 30.84 12.04 30.42C12.04 30.04 12.02 28.78 12.02 27.44C8 28.18 6.96 26.46 6.64 25.56C6.46 25.1 5.68 23.68 5 23.3C4.44 23 3.64 22.26 4.98 22.24C6.24 22.22 7.14 23.4 7.44 23.88C8.88 26.3 11.18 25.62 12.1 25.2C12.24 24.16 12.66 23.46 13.12 23.06C9.56 22.66 5.84 21.28 5.84 15.16C5.84 13.42 6.46 11.98 7.48 10.86C7.32 10.46 6.76 8.82 7.64 6.62C7.64 6.62 8.98 6.2 12.04 8.26C13.32 7.9 14.68 7.72 16.04 7.72C17.4 7.72 18.76 7.9 20.04 8.26C23.1 6.18 24.44 6.62 24.44 6.62C25.32 8.82 24.76 10.46 24.6 10.86C25.62 11.98 26.24 13.4 26.24 15.16C26.24 21.3 22.5 22.66 18.94 23.06C19.52 23.56 20.02 24.52 20.02 26.02C20.02 28.16 20 29.88 20 30.42C20 30.84 20.3 31.34 21.1 31.18C27.42 29.06 32 23.06 32 16C32 7.16 24.84 0 16 0V0Z\" fill=\"#24292E\"/>\r\n</svg>";
function startAppearanceFavicons(win) {
  if(win.__satFaviconRuntime)return win.__satFaviconRuntime;
  const windows=win.CustomizableUI?.windows||(typeof CustomizableUI!=='undefined'?CustomizableUI.windows:[win]);
  const registry=Array.from(windows).map(w=>w.__satFaviconRegistry).find(Boolean)||{states:new WeakMap(),yielded:new WeakSet(),active:new Set()};
  win.__satFaviconRegistry=registry;
  const owned=new Map(),owner={},marker='data-sat-github-favicon';
  registry.active.add(owner);
  let running=true,scheduled=false;
  function sourceSVG(source) {
    try {
      if(source.startsWith('moz-remote-image:'))source=new win.URL(source).searchParams.get('url')||'';
      if(source.length>8192)return null;
      const match=/^data:image\/svg\+xml((?:;[^,]*)?),(.*)$/s.exec(source);
      if(!match)return null;
      return (match[1].split(';').includes('base64')?win.atob(match[2]):decodeURIComponent(match[2])).trim().replace(/\r\n?/g,'\n');
    }catch{return null;}
  }
  function stockIcon(tab,image) {
    if(tab.closing||tab.zenStaticIcon)return false;
    try {
      const url=new win.URL(tab.linkedBrowser.currentURI.spec);
      if(url.hostname!=='github.com'||!['http:','https:'].includes(url.protocol))return false;
    }catch{return false;}
    const svg=sourceSVG(image.getAttribute('src')||tab.getAttribute('image')||'');
    const stock=SAT_GITHUB_STOCK_SVG.replace(/\r\n?/g,'\n');
    return svg===stock||svg===stock.replace('fill="#24292E"','fill="white"');
  }
  function filter(image){return {value:image.style.getPropertyValue('filter'),priority:image.style.getPropertyPriority('filter')};}
  function matches(image,state){const now=filter(image);return now.value===state.last.value&&now.priority===state.last.priority;}
  function clearMarker(image,state){if(image.getAttribute(marker)===state.marker)image.removeAttribute(marker);}
  function restore(image,state) {
    if(registry.states.get(image)!==state||state.owner!==owner)return;
    if(matches(image,state)){
      if(state.before.value)image.style.setProperty('filter',state.before.value,state.before.priority);
      else image.style.removeProperty('filter');
    }else registry.yielded.add(image);
    clearMarker(image,state);registry.states.delete(image);
  }
  function transferred(image) {
    const destination=image.ownerDocument?.defaultView;
    return destination&&destination!==win&&destination.__satFaviconRuntime&&destination.__satFaviconRegistry===registry;
  }
  function release(image,state){
    // A receiver can claim the same element before or after the sender refreshes.
    // Keep its original baseline available while a receiving adapter is active.
    if(transferred(image))image.ownerDocument.defaultView.__satFaviconRuntime.refresh();
    else restore(image,state);
    owned.delete(image);
  }
  function darkSidebar(image) {
    for(const element of [image,win.gBrowser.tabContainer]) {
      const scheme=win.getComputedStyle(element).colorScheme;
      if(scheme==='dark')return true;
      if(scheme==='light')return false;
    }
    return media.matches;
  }
  function refresh() {
    if(!running)return;
    const present=new Set();
    for(const tab of win.gBrowser.tabs) {
      const image=tab.iconImage||tab.querySelector?.('.tab-icon-image');if(!image)continue;
      present.add(image);
      let state=registry.states.get(image);
      if(state&&!matches(image,state)){
        registry.yielded.add(image);registry.states.delete(image);clearMarker(image,state);owned.delete(image);state=null;
      }
      if(state){state.owner=owner;owned.set(image,state);}
      if(!stockIcon(tab,image)){if(state){restore(image,state);owned.delete(image);}continue;}
      if(registry.yielded.has(image))continue;
      if(!state){state={before:filter(image),last:filter(image),owner};registry.states.set(image,state);owned.set(image,state);}
      const dark=darkSidebar(image),value=dark?'brightness(0) invert(1)':'brightness(0)';
      if(image.style.getPropertyValue('filter')!==value||image.style.getPropertyPriority('filter')!=='important')image.style.setProperty('filter',value,'important');
      state.last=filter(image);state.marker=dark?'dark':'light';
      if(image.getAttribute(marker)!==state.marker)image.setAttribute(marker,state.marker);
    }
    for(const [image,state]of owned)if(!present.has(image))release(image,state);
  }
  function schedule(){if(!running||scheduled)return;scheduled=true;win.queueMicrotask(()=>{scheduled=false;refresh();});}
  const observer=new win.MutationObserver(schedule);
  observer.observe(win.gBrowser.tabContainer,{subtree:true,childList:true,attributes:true,attributeFilter:['image','src','style','zen-essential']});
  const themeObserver=new win.MutationObserver(schedule);
  themeObserver.observe(win.document.documentElement,{attributes:true,attributeFilter:['style','class','lwtheme','lwtheme-brighttext']});
  const events=['ZenTabIconChanged','TabAttrModified','TabSelect','TabOpen','TabClose','TabMove','SSTabRestored','TabBrowserInserted','TabPinned','TabUnpinned'];
  for(const event of events)win.gBrowser.tabContainer.addEventListener(event,schedule);
  const media=win.matchMedia('(prefers-color-scheme:dark)');media.addEventListener('change',schedule);
  const services=win.Services||(typeof Services!=='undefined'?Services:null);
  services?.prefs.addObserver('browser.theme.',schedule);services?.prefs.addObserver('ui.systemUsesDarkTheme',schedule);
  services?.obs.addObserver(schedule,'look-and-feel-changed');
  const progress={onLocationChange:schedule};
  // Zen calls these listeners only for methods they implement.
  if(win.ChromeUtils?.generateQI)progress.QueryInterface=win.ChromeUtils.generateQI(['nsIWebProgressListener','nsISupportsWeakReference']);
  win.gBrowser.addTabsProgressListener(progress);
  const api={refresh,stop(){
    if(!running)return;running=false;observer.disconnect();themeObserver.disconnect();
    for(const event of events)win.gBrowser.tabContainer.removeEventListener(event,schedule);
    media.removeEventListener('change',schedule);
    services?.prefs.removeObserver('browser.theme.',schedule);services?.prefs.removeObserver('ui.systemUsesDarkTheme',schedule);
    services?.obs.removeObserver(schedule,'look-and-feel-changed');win.gBrowser.removeTabsProgressListener(progress);
    win.removeEventListener('unload',api.stop);
    for(const [image,state]of owned)release(image,state);
    if(win.__satFaviconRuntime===api)delete win.__satFaviconRuntime;
    registry.active.delete(owner);
    if(!registry.active.size)registry.yielded=new WeakSet();
  }};
  win.__satFaviconRuntime=api;win.addEventListener('unload',api.stop);refresh();return api;
}
if(typeof module!=='undefined')module.exports={startAppearanceFavicons};

