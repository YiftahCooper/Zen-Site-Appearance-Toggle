const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
function setup({theme='Dark',service='gemini',privateWindow=false,account=null,container=0}={}){
 let createSiteSetup;try{({createSiteSetup}=require('../src/appearance-site-setup'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
 assert.equal(typeof createSiteSetup,'function','setup controller exists');
 let journal={version:1,records:{}},current=true,changes=0,writes=0,inspections=0,failVerification=false;
 const context={service,container,account,id:service+':'+container+(account===null?'':':'+account),label:service==='gemini'?'Gemini':'Google Search'};
 const themes=new Map([[account,theme]]),calls=[];
 const env={privateWindow,read:()=>structuredClone(journal),write:j=>{writes++;journal=structuredClone(j);},context:()=>({...context}),isCurrent:()=>current,
  control:async(ctx,request)=>{
   const selected=ctx.account??null;calls.push({id:ctx.id,account:selected,operation:request.operation});theme=themes.get(selected);
   if(request.operation==='inspect')inspections++;
   if(request.operation==='inspect')return {before:failVerification?'Dark':theme};
   const before=theme;theme=request.theme;themes.set(selected,theme);changes++;return {before,after:theme};
  }};
 const api=createSiteSetup(env);
 return {api,tab:{},get journal(){return journal},get theme(){return themes.get(context.account??null)},get changes(){return changes},get writes(){return writes},get inspections(){return inspections},calls,
  selectAccount:(account,theme)=>{context.account=account;context.id=service+':'+container+(account===null?'':':'+account);if(theme!==undefined)themes.set(account,theme);},
  replaceJournal:j=>journal=structuredClone(j),leave:()=>current=false,fail:()=>failVerification=true};
}
test('setup records original website mode before changing and verifies follow mode',async()=>{
 const s=setup();await s.api.ensure(s.tab);assert.equal(s.theme,'System');assert.equal(s.journal.records['gemini:0'].before,'Dark');assert.equal(s.journal.records['gemini:0'].phase,'connected');assert.equal(s.api.records().length,1);
 await s.api.ensure(s.tab);assert.equal(s.changes,1);
});
test('pre-existing System needs no rollback record and reopening preserves original',async()=>{
 const s=setup({theme:'System'});await s.api.ensure(s.tab);assert.equal(s.changes,0);assert.equal(s.api.records().length,0);
});
test('undo restores original mode and deletes only its own record',async()=>{
 const s=setup();await s.api.ensure(s.tab);await s.api.undo('gemini:0');assert.equal(s.theme,'Dark');assert.equal(s.api.records().length,0);
});
test('private windows do not persist or modify website-owned theme',async()=>{
 for(const [service,theme]of [['gemini','Dark'],['gemini','Light'],['google-search','1'],['google-search','2']]){
  const s=setup({privateWindow:true,service,theme});await assert.rejects(()=>s.api.ensure(s.tab),/private.*System|follow.*manually/i);assert.equal(s.inspections,1);assert.equal(s.changes,0);assert.equal(s.writes,0);assert.equal(s.api.records().length,0);
 }
});

test('private sites already following the device allow temporary browser appearance without journal writes',async()=>{
 for(const [service,theme]of [['gemini','System'],['google-search','0']]){
  const s=setup({privateWindow:true,service,theme,account:'0'});assert.deepEqual(await s.api.ensure(s.tab),{service,before:theme});
  assert.equal(s.inspections,1);assert.equal(s.changes,0);assert.equal(s.writes,0);assert.equal(s.theme,theme);assert.equal(s.api.records().length,0);
 }
});

test('distinct account selectors keep independent journals and undo uses the recorded account',async()=>{
 const s=setup({account:'0',theme:'Dark'});await s.api.ensure(s.tab);
 s.selectAccount('1','Light');await s.api.ensure(s.tab);
 assert.equal(s.journal.records['gemini:0:0'].before,'Dark');assert.equal(s.journal.records['gemini:0:0'].account,'0');
 assert.equal(s.journal.records['gemini:0:1'].before,'Light');assert.equal(s.journal.records['gemini:0:1'].account,'1');
 assert.equal(s.api.records().length,2);await s.api.undo('gemini:0:0');
 assert.equal(s.journal.records['gemini:0:0'],undefined);assert.equal(s.journal.records['gemini:0:1'].before,'Light');
 assert.equal(s.calls.at(-1).account,'0');s.selectAccount('0');assert.equal(s.theme,'Dark');s.selectAccount('1');assert.equal(s.theme,'System');
});

test('null account keeps the historical journal identity and old records without an account remain readable',async()=>{
 const s=setup();await s.api.ensure(s.tab);assert.equal(s.journal.records['gemini:0'].account,null);assert.equal(s.api.records()[0].label,'Gemini');
 s.replaceJournal({version:1,records:{'gemini:0':{service:'gemini',container:0,label:'Previous Gemini record',before:'Dark',phase:'connected'}}});
 assert.equal(s.api.records()[0].label,'Previous Gemini record');await s.api.undo('gemini:0');assert.equal(s.theme,'Dark');
});

test('invalid account selectors and mismatched stored account identities are rejected without mutation',async()=>{
 for(const account of ['-1','1.2','01','user@example.com',0]){
  const s=setup({account});await assert.rejects(()=>s.api.ensure(s.tab),/account|record|context/i);assert.equal(s.inspections,0);assert.equal(s.changes,0);assert.equal(s.writes,0);
 }
 for(const [id,account]of [['gemini:0:0','1'],['gemini:0','0'],['gemini:0:bad','bad']]){
  const s=setup();s.replaceJournal({version:1,records:{[id]:{service:'gemini',container:0,account,label:'Invalid fixture',before:'Dark',phase:'connected'}}});
  assert.throws(()=>s.api.records(),/invalid.*preserved/i);await assert.rejects(()=>s.api.undo(id),/invalid.*preserved/i);assert.equal(s.changes,0);assert.equal(s.writes,0);
 }
});
test('navigation during setup leaves a recovery record but cannot choose another site',async()=>{
 const s=setup();s.leave();await assert.rejects(()=>s.api.ensure(s.tab),/changed|navigated/);assert.equal(s.changes,0);assert.equal(s.api.records().length,0);
});
test('failed persistence verification retains the original for recovery',async()=>{
 const s=setup();s.fail();await assert.rejects(()=>s.api.ensure(s.tab),/verify|verification|persist/i);assert.equal(s.journal.records['gemini:0'].before,'Dark');assert.equal(s.journal.records['gemini:0'].phase,'pending');
});
test('Google setup and undo use Google enum values without changing global defaults',async()=>{
 const s=setup({service:'google-search',theme:'1'});await s.api.ensure(s.tab);assert.equal(s.theme,'0');await s.api.undo('google-search:0');assert.equal(s.theme,'1');
});
