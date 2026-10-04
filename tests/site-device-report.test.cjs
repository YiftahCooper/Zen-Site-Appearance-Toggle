const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const {siteAppearanceAction}=require('../src/appearance-site-actions');
function fixture(){
 const dom=new JSDOM('<body></body>',{url:'https://www.google.com/?cs=1'}),w=dom.window,entries=[];
 let waits=0;w.performance.getEntriesByType=type=>{assert.equal(type,'resource');return entries;};
 w.setTimeout=fn=>{waits++;return setTimeout(fn,1);};
 return {w,entries,waits:()=>waits,entry:(cs='1',end=120,name='https://www.google.com/client_204?cs='+cs,status=204)=>({name,responseStart:100,responseEnd:end,responseStatus:status}),close:()=>w.close()};
}
test('Google retry readiness waits for its own completed colour report, not a merely started request',async()=>{
 const s=fixture();try{
 s.entries.push(s.entry('1',0));let resolved=false;
 const pending=siteAppearanceAction(s.w.document,{operation:'device-report',dark:false}).then(v=>{resolved=true;return v;});
 await new Promise(r=>setTimeout(r,5));assert.equal(resolved,false);
 s.entries[0].responseEnd=120;assert.deepEqual(await pending,{completed:true});assert.ok(s.waits()>0);
 }finally{s.close();}
});
test('wrong colour, origin, path and unsuccessful response cannot authorize Google reload',async()=>{
 const s=fixture();try{
 s.entries.push(s.entry('2'),s.entry('1',120,'https://other.example/client_204?cs=1'),s.entry('1',120,'https://www.google.com/search?cs=1'),s.entry('1',120,undefined,500));
 await assert.rejects(siteAppearanceAction(s.w.document,{operation:'device-report',dark:false}),/report.*complete|complete.*report/i);
 assert.ok(s.waits()>0&&s.waits()<=80);
 }finally{s.close();}
});
test('completed report can be consumed immediately and does not require a fixed delay',async()=>{
 const s=fixture();try{s.entries.push(s.entry('2'));assert.deepEqual(await siteAppearanceAction(s.w.document,{operation:'device-report',dark:true}),{completed:true});assert.equal(s.waits(),0);}finally{s.close();}
});
test('a closed or cancelled connection with no response bytes cannot authorize a retry on engines without responseStatus',async()=>{
 const s=fixture();try{const entry=s.entry();entry.responseStart=0;delete entry.responseStatus;s.entries.push(entry);
 await assert.rejects(siteAppearanceAction(s.w.document,{operation:'device-report',dark:false}),/report.*complete/);
 }finally{s.close();}
});
test('cancelled or navigated report wait cannot authorize a later reload',async()=>{
 for(const kind of ['cancel','navigate']){const s=fixture();try{let cancelled=false;
 const pending=siteAppearanceAction(s.w.document,{operation:'device-report',dark:false,isCancelled:()=>cancelled});
 setTimeout(()=>{if(kind==='cancel')cancelled=true;else s.w.history.replaceState({},'', '/search?q=other');},4);
 await assert.rejects(pending,/cancel|navigat/i);
 }finally{s.close();}}
});
test('device report operation rejects an unspecified preference and unsupported site without waiting',async()=>{
 const s=fixture();try{await assert.rejects(siteAppearanceAction(s.w.document,{operation:'device-report'}),/preference/i);assert.equal(s.waits(),0);s.w.history.replaceState({},'','/preferences');await assert.rejects(siteAppearanceAction(s.w.document,{operation:'device-report',dark:false}),/Unsupported/);}finally{s.close();}
});
