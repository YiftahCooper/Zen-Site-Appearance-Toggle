/* Browser-independent lifecycle; native operations live in the environment adapter. */
function createController({environment:env,policy}) {
  // owned: browsing contexts this window currently overrides. presenter: the
  // tab that last presented each owned context, so tab-scoped refreshes can
  // release a replaced or departed context without scanning every tab.
  const owned=new Map(), presenter=new Map(), yielded=new WeakSet();
  const ownership=env.ownership||new WeakMap(),owner={};
  let running=false,unlisten=()=>{},privateStore=null;
  const read=()=> env.privateWindow ? (privateStore??=env.read()) : env.read();
  const live=tab=>env.live?env.live(tab):env.tabs().includes(tab);
  function currentContext() {
    const t=env.selected(), raw=t?env.context(t,read()):{};
    return {...raw,siteKey:raw.site?.key||null,scope:env.scope()};
  }
  function restore(bc,state) {
    if(ownership.get(bc)!==state||state.owner!==owner)return;
    try {if(bc.prefersColorSchemeOverride===state.last)bc.prefersColorSchemeOverride=state.before;} catch {}
    ownership.delete(bc);
  }
  function release(bc){const state=owned.get(bc);if(state)restore(bc,state);owned.delete(bc);presenter.delete(bc);}
  // Resolve and apply one tab's choice. Shared by full and tab-scoped refreshes.
  function apply(tab,bc,store,scope,forceContext) {
    const context=env.context(tab,store);
    const value=policy.resolveAppearance({store,scope,workspaceId:context.workspaceId,siteKey:context.site?.key});
    const want=value==='inherit'?'none':value==='system'?(env.systemDark()?'dark':'light'):value;
    let state=ownership.get(bc);
    if(state&&bc.prefersColorSchemeOverride!==state.last){ownership.delete(bc);owned.delete(bc);presenter.delete(bc);yielded.add(bc);state=null;}
    const selectedScope=forceContext &&
      (forceContext.scope==='site'||forceContext.workspaceId===context.workspaceId) &&
      (forceContext.scope==='workspace'||forceContext.siteKey===context.site?.key);
    if(selectedScope)yielded.delete(bc);
    if(yielded.has(bc))return;
    // Leave unrelated existing overrides alone when SAT has no exception.
    if(!state&&want==='none')return;
    if(!state)state={before:bc.prefersColorSchemeOverride,last:bc.prefersColorSchemeOverride};
    // A transferred tab keeps its original baseline. The departing window
    // must no longer restore an override now owned by the receiving window.
    state.owner=owner;ownership.set(bc,state);owned.set(bc,state);presenter.set(bc,tab);
    if(want==='none'){restore(bc,state);owned.delete(bc);presenter.delete(bc);return;}
    if(bc.prefersColorSchemeOverride!==want)bc.prefersColorSchemeOverride=want;
    state.last=want;
  }
  // Every tab: used for store, scope, workspace, preference and theme changes.
  function refresh(forceContext=null) {
    if(!running)return;
    try {
      const store=read(), scope=env.scope(), present=new Set();
      for(const tab of env.tabs()) {
        const bc=env.browsingContext(tab);if(!bc)continue;present.add(bc);
        apply(tab,bc,store,scope,forceContext);
      }
      for(const bc of [...owned.keys()])if(!present.has(bc))release(bc);
      env.notify();
    }catch(e){env.error(e);}
  }
  // Only the named tabs: their own navigation, load state, workspace or
  // closure cannot change any other tab's resolved appearance.
  function refreshTabs(tabs) {
    if(!running)return;
    try {
      const store=read(), scope=env.scope(), selected=env.selected();let notify=false;
      for(const tab of tabs) {
        if(tab===selected)notify=true;
        const bc=live(tab)?env.browsingContext(tab):null;
        // A closed tab or a replaced browsing context no longer presents
        // its previous context; restore it as a full refresh would.
        for(const [previous,by] of presenter)if(by===tab&&previous!==bc)release(previous);
        if(bc)apply(tab,bc,store,scope,null);
      }
      if(notify)env.notify();
    }catch(e){env.error(e);}
  }
  function choose(value) {
    const context=currentContext(),next=policy.setChoice(read(),context,value);
    if(env.privateWindow)privateStore=next;else env.write(next);
    refresh(context);
  }
  function effectiveDark() {
    const v=policy.resolveAppearance({...currentContext(),store:read()});
    return v==='inherit'?env.defaultDark():v==='system'?env.systemDark():v==='dark';
  }
  function start(){if(running)return;running=true;unlisten=env.listen(change=>change&&change.full===false&&change.tabs?refreshTabs(change.tabs):refresh());refresh();}
  function stop(){if(!running)return;running=false;unlisten();for(const [bc,state] of owned)restore(bc,state);owned.clear();presenter.clear();}
  return {start,stop,currentContext,choose,refresh,refreshTabs,effectiveDark,choice:()=>policy.resolveAppearance({...currentContext(),store:read()})};
}
if(typeof module!=='undefined')module.exports={createController};
