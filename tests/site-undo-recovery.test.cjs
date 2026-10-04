const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSiteSetup}=require('../src/appearance-site-setup');

for(const service of ['google-search','gemini'])for(const fault of ['initial-read','before-save','after-save','verification-read','wrong-readback']){
 test(`${service} Undo preserves recovery and permits explicit retry after ${fault}`,async()=>{
  const original=service==='google-search'?'1':'Dark',follow=service==='google-search'?'0':'System';
  const id=service+':2:1',other='gemini:3:0';let current=follow,armed=true,reads=0,writes=0,sets=0;
  let journal={version:1,records:{[id]:{service,container:2,account:'1',before:original,phase:'connected'},[other]:{service:'gemini',container:3,account:'0',before:'Light',phase:'connected'}}};
  const baseline=structuredClone(journal),contexts=[];
  const api=createSiteSetup({privateWindow:false,read:()=>structuredClone(journal),write:value=>{writes++;journal=structuredClone(value);},control:async(ctx,request)=>{
   contexts.push(ctx);
   if(request.operation==='inspect'){
    reads++;
    if(armed&&((fault==='initial-read'&&reads===1)||(fault==='verification-read'&&reads===2)))throw Error('Website navigated during setup');
    if(armed&&fault==='wrong-readback'&&reads===2)return {before:follow};
    return {before:current};
   }
   if(armed&&fault==='before-save')throw Error('Website navigated during setup');
   sets++;current=request.theme;
   if(armed&&fault==='after-save')throw Error('Website navigated during setup');
   return {after:current};
  }});
  await assert.rejects(api.undo(id),/navigated|verify/);
  assert.deepEqual(journal,baseline,'no recovery record is removed on an unverified outcome');assert.equal(writes,0);
  const savedSets=sets;armed=false;reads=0;
  await api.undo(id);
  assert.equal(current,original);assert.equal(journal.records[id],undefined);assert.deepEqual(journal.records[other],baseline.records[other]);
  assert.equal(writes,1);assert.equal(sets,savedSets+(savedSets===0?1:0),'retry reads actual website state before deciding whether another save is needed');
  assert.ok(contexts.every(c=>c.container===2&&c.account==='1'&&c.id===id),'retry stays in the recorded container/account');
 });
}
test('an external website choice after interrupted Undo is preserved with its recovery record',async()=>{
 let journal={version:1,records:{'google-search:0':{service:'google-search',container:0,account:null,before:'1',phase:'connected'}}},theme='0',fail=true,sets=0;
 const original=structuredClone(journal);
 const api=createSiteSetup({read:()=>structuredClone(journal),write:j=>journal=j,control:async(ctx,request)=>{
  if(request.operation==='inspect')return {before:theme};
  if(fail)throw Error('Website navigated during setup');sets++;theme=request.theme;
 }});
 await assert.rejects(api.undo('google-search:0'),/navigated/);fail=false;theme='2';
 await assert.rejects(api.undo('google-search:0'),/outside SAT/);assert.equal(theme,'2');assert.equal(sets,0);assert.deepEqual(journal,original);
});
