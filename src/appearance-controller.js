/* Browser-independent lifecycle; native operations live in the environment adapter. */
function createController({environment:env,policy}) {
  const owned=new Map(), yielded=new WeakSet();
  const ownership=env.ownership||new WeakMap(),owner={};
  let running=false,unlisten=()=>{},privateStore=null;
  const read=()=> env.privateWindow ? (privateStore??=env.read()) : env.read();
  function currentContext() {
    const t=env.selected(), raw=t?env.context(t,read()):{};
    return {...raw,siteKey:raw.site?.key||null,scope:env.scope()};
  }
  function restore(bc,state) {
    if(ownership.get(bc)!==state||state.owner!==owner)return;
    try {if(bc.prefersColorSchemeOverride===state.last)bc.prefersColorSchemeOverride=state.before;} catch {}
    ownership.delete(bc);
  }
  function refresh(forceContext=null) {
    if(!running)return;
    try {
      const store=read(), present=new Set();
      for(const tab of env.tabs()) {
        const bc=env.browsingContext(tab);if(!bc)continue;present.add(bc);
        const context=env.context(tab,store);
        const value=policy.resolveAppearance({store,scope:env.scope(),workspaceId:context.workspaceId,siteKey:context.site?.key});
        const want=value==='inherit'?'none':value==='system'?(env.systemDark()?'dark':'light'):value;
        let state=ownership.get(bc);
        if(state&&bc.prefersColorSchemeOverride!==state.last){ownership.delete(bc);owned.delete(bc);yielded.add(bc);state=null;}
        const selectedScope=forceContext &&
          (forceContext.scope==='site'||forceContext.workspaceId===context.workspaceId) &&
          (forceContext.scope==='workspace'||forceContext.siteKey===context.site?.key);
        if(selectedScope)yielded.delete(bc);
        if(yielded.has(bc))continue;
        // Leave unrelated existing overrides alone when SAT has no exception.
        if(!state&&want==='none')continue;
        if(!state)state={before:bc.prefersColorSchemeOverride,last:bc.prefersColorSchemeOverride};
        // A transferred tab keeps its original baseline. The departing window
        // must no longer restore an override now owned by the receiving window.
        state.owner=owner;ownership.set(bc,state);owned.set(bc,state);
        if(want==='none'){restore(bc,state);owned.delete(bc);continue;}
        if(bc.prefersColorSchemeOverride!==want)bc.prefersColorSchemeOverride=want;
        state.last=want;
      }
      for(const [bc,state] of owned)if(!present.has(bc)){restore(bc,state);owned.delete(bc);}
      env.notify();
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
  function start(){if(running)return;running=true;unlisten=env.listen(()=>refresh());refresh();}
  function stop(){if(!running)return;running=false;unlisten();for(const [bc,state] of owned)restore(bc,state);owned.clear();}
  return {start,stop,currentContext,choose,refresh,effectiveDark,choice:()=>policy.resolveAppearance({...currentContext(),store:read()})};
}
if(typeof module!=='undefined')module.exports={createController};
