/* Website setup journal; native transport is supplied separately. */
function createSiteSetup(env){
  const locks=env.locks||new Set();
  const follow=service=>service==='gemini'?'System':'0';
  const valid=(service,mode)=>service==='gemini'?['System','Light','Dark'].includes(mode):service==='google-search'&&['0','1','2'].includes(mode);
  function identity(ctx){
    if(!ctx||typeof ctx!=='object'||Array.isArray(ctx)||!['gemini','google-search'].includes(ctx.service)||!Number.isInteger(ctx.container)||ctx.container<0)return null;
    const account=ctx.account??null;
    if(account!==null&&(typeof account!=='string'||!/^(0|[1-9]\d*)$/.test(account)))return null;
    return ctx.service+':'+ctx.container+(account===null?'':':'+account);
  }
  function read(){
    const j=env.read();if(!j||j.version!==1||!j.records||typeof j.records!=='object'||Array.isArray(j.records))throw Error('Website setup record is invalid; it has been preserved');
    for(const [id,r]of Object.entries(j.records))if(identity(r)!==id||!valid(r.service,r.before)||!['pending','connected'].includes(r.phase)||(r.label!==undefined&&typeof r.label!=='string'))throw Error('Website setup record is invalid; it has been preserved');
    return j;
  }
  async function locked(id,fn){if(locks.has(id))throw Error('Website setup is already running');locks.add(id);try{return await fn();}finally{locks.delete(id);}}
  async function ensure(tab){
    const current=env.context(tab);if(!current)return;
    const ctx={...current,account:current.account??null};
    if(ctx.id!==identity(ctx))throw Error('Invalid website setup context or account selector');
    return locked(ctx.id,async()=>{
      if(!env.isCurrent(tab,ctx))throw Error('The selected website changed during setup');
      const before=(await env.control(ctx,{operation:'inspect'},tab)).before;
      if(!valid(ctx.service,before))throw Error('Unsupported website theme state');
      if(!env.isCurrent(tab,ctx))throw Error('The selected website changed during setup');
      if(before===follow(ctx.service))return {service:ctx.service,before};
      if(env.privateWindow)throw Error('This website uses an explicit theme in a private window. Set its theme to System or Device default manually before using a temporary private appearance choice.');
      let j=read();
      if(!j.records[ctx.id])j.records[ctx.id]={service:ctx.service,container:ctx.container,account:ctx.account,label:ctx.label,before,phase:'pending'};
      else j.records[ctx.id].phase='pending';
      env.write(j); // Capture rollback before any website-owned mutation.
      await env.control(ctx,{operation:'set',theme:follow(ctx.service)},tab);
      const verified=(await env.control(ctx,{operation:'inspect'},tab)).before;
      if(verified!==follow(ctx.service))throw Error('Could not verify the saved website setting; the original is retained for undo');
      j=read();if(j.records[ctx.id]){j.records[ctx.id].phase='connected';env.write(j);}
      if(!env.isCurrent(tab,ctx))throw Error('The selected website changed during setup; its original setting is available for undo');
      return {service:ctx.service,before};
    });
  }
  async function undo(id){
    if(env.privateWindow)throw Error('Undo website setup from a normal window');
    return locked(id,async()=>{
      const r=read().records[id];if(!r)throw Error('Website setup record no longer exists');
      const ctx={...r,id,account:r.account??null};
      const now=(await env.control(ctx,{operation:'inspect'})).before;
      if(now!==r.before&&now!==follow(r.service))throw Error('The website theme was changed outside SAT; it has been left unchanged');
      if(now!==r.before){
        await env.control(ctx,{operation:'set',theme:r.before});
        if((await env.control(ctx,{operation:'inspect'})).before!==r.before)throw Error('Could not verify website rollback; the record is retained');
      }
      const j=read();delete j.records[id];env.write(j);
    });
  }
  return {ensure,undo,records:()=>Object.entries(read().records).map(([id,r])=>({id,label:r.label||r.service,before:r.service==='google-search'?{'0':'Device default','1':'Off','2':'On'}[r.before]:r.before,phase:r.phase}))};
}
if(typeof module!=='undefined')module.exports={createSiteSetup};
