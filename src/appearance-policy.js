/* Pure policy shared by all packaged scripts. Never reads browser history. */
const AppearancePolicy = (() => {
  const rules = typeof SAT_SITE_RULES !== 'undefined' ? SAT_SITE_RULES : require('./site-rules.json');
  const values = new Set(['system', 'light', 'dark']);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const safe = k => typeof k === 'string' && k.length > 0 && !['__proto__','constructor','prototype'].includes(k);
  const record = o => o && typeof o === 'object' && !Array.isArray(o);
  const copy = o => JSON.parse(JSON.stringify(o));
  function emptyStore() { return {version:1, sites:{}, workspaceSites:{}, groups:{}, workspaces:{}}; }
  function hostname(input) {
    if (typeof input !== 'string' || /[\s/*?#@]/.test(input)) throw new Error('Enter an exact hostname, without a URL or wildcard.');
    const u = new URL('https://' + input);
    if (u.port || u.pathname !== '/' || !safe(u.hostname)) throw new Error('Invalid hostname.');
    return u.hostname.replace(/\.$/, '');
  }
  function validKey(k) { return typeof k === 'string' && /^(domain|host|service):[^\s/?#@]+$/.test(k); }
  // Group identities are independent of port; each visited URL supplies its
  // own port. Saved appearance keys retain their existing port separation.
  const groupIdentity=k=>k.replace(/:\d+$/,'');
  function parseStore(raw = '', legacy = '{}') {
    const s = raw ? JSON.parse(raw) : emptyStore();
    if (!record(s) || s.version !== 1) throw new Error('Saved SAT settings use an invalid or unsupported format.');
    for (const name of ['sites','workspaceSites','groups']) {
      s[name] ??= {};
      if (!record(s[name])) throw new Error('Invalid SAT ' + name);
      for (const [k,v] of Object.entries(s[name])) {
        if (!safe(k)) throw new Error('Invalid SAT key');
        if (name === 'groups') {
          if (hostname(k) !== k || !validKey(v)) throw new Error('Invalid site grouping');
        } else if (name === 'sites') {
          if (!validKey(k) || !values.has(v)) throw new Error('Invalid site appearance');
        } else {
          if (!record(v)) throw new Error('Invalid workspace sites');
          for(const [site,value] of Object.entries(v)) if(!validKey(site)||!values.has(value)) throw new Error('Invalid workspace site appearance');
        }
      }
    }
    const old = JSON.parse(legacy);
    if (!record(old)) throw new Error('Invalid legacy workspace map');
    s.workspaces = {};
    for(const [k,v] of Object.entries(old)) {
      if(!safe(k)||![0,1,2].includes(v)) throw new Error('Invalid legacy workspace appearance');
      s.workspaces[k] = ['system','light','dark'][v];
    }
    return s;
  }
  function recogniseSite(url, {baseDomain, userRules = {}}) {
    let u;
    try { u = new URL(url); } catch { return null; }
    if (!['http:','https:'].includes(u.protocol) || u.username || u.password) return null;
    const host = u.hostname.replace(/\.$/,'');
    const suffix = u.port ? ':' + u.port : '';
    if (own(userRules,host)) return {key:groupIdentity(userRules[host])+suffix,label:groupIdentity(userRules[host]).replace(/^[^:]+:/,'')+suffix,host};
    for(const group of rules.groups) if(group.hosts.includes(host)) return {key:group.key+suffix,label:group.label,host};
    let base;
    try { base=baseDomain(host); } catch { base=host; }
    const local = host === 'localhost' || !host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[');
    const independent = local || rules.separateSubdomains.includes(base) && ![base,'www.'+base].includes(host);
    const key = (independent?'host:'+host:'domain:'+base)+suffix;
    return {key,label:(independent?host:base)+suffix,host};
  }
  function target(store, {scope,workspaceId,siteKey}, create=false) {
    if(scope==='workspace')return safe(workspaceId)?[store.workspaces,workspaceId]:null;
    if(!validKey(siteKey))return null;
    if(scope==='site')return [store.sites,siteKey];
    if(scope==='workspace-site' && safe(workspaceId)) {
      if(create)store.workspaceSites[workspaceId]??={};
      return [store.workspaceSites[workspaceId]||{},siteKey];
    }
    return null;
  }
  function resolveAppearance(context) {
    const t=target(context.store,context);
    return t && own(t[0],t[1]) ? t[0][t[1]] : 'inherit';
  }
  function setChoice(store,context,value) {
    if(value!=='inherit'&&!values.has(value))throw new Error('Invalid appearance');
    const next=copy(store), t=target(next,context,true);
    if(!t)throw new Error('This page or workspace is not ready for a saved choice.');
    if(value==='inherit')delete t[0][t[1]];else t[0][t[1]]=value;
    return next;
  }
  function setGrouping(store,host,key) {
    host=hostname(host);
    if(key!==null&&!validKey(key))throw new Error('Invalid site group');
    const next=copy(store);
    if(key===null)delete next.groups[host];else next.groups[host]=groupIdentity(key);
    return next;
  }
  function serialize(store) {
    const {workspaces,...state}=store;
    return {state:JSON.stringify(state),legacy:JSON.stringify(Object.fromEntries(Object.entries(workspaces).map(([k,v])=>[k,{system:0,light:1,dark:2}[v]])))};
  }
  return {emptyStore,parseStore,recogniseSite,resolveAppearance,setChoice,setGrouping,serialize};
})();
if (typeof module !== 'undefined') module.exports = AppearancePolicy;
