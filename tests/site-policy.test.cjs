const {test}=require('node:test');
const assert=require('node:assert/strict');
let p;try {p=require('../src/appearance-policy.js')} catch(e) {if(e.code!=='MODULE_NOT_FOUND')throw e;p={}}
const baseDomain=host=>{
  for(const suffix of ['co.uk','github.io']) if(host.endsWith('.'+suffix))return host.split('.').slice(-3).join('.');
  return host.split('.').slice(-2).join('.');
};
const id=(url,store)=>p.recogniseSite(url,{baseDomain,userRules:store?.groups});
test('groups website sections without recording queries or paths',()=>{
  for(const url of ['https://www.example.com/search?q=private','http://example.com/a#b','https://shop.example.com/cart'])
    assert.equal(id(url).key,'domain:example.com');
  assert.equal(id('https://example.com:8443/a').key,'domain:example.com:8443');
});
test('uses public suffix boundaries and keeps hosted tenants separate',()=>{
  assert.equal(id('https://shop.example.co.uk').key,'domain:example.co.uk');
  assert.notEqual(id('https://alice.github.io').key,id('https://bob.github.io').key);
});
test('groups Search and Images but separates independent Google services',()=>{
  for(const host of ['google.com','www.google.com','images.google.com'])assert.equal(id('https://'+host).key,'service:google-search');
  for(const host of ['gemini','mail','drive','docs','calendar','accounts'])assert.equal(id('https://'+host+'.google.com').key,'host:'+host+'.google.com');
  assert.equal(id('https://google.com.example.net').key,'domain:example.net');
  assert.notEqual(id('https://images.example.com').key,id('https://images.google.com').key);
});
test('normalises international names but rejects nonweb schemes and credentials',()=>{
  assert.equal(id('https://BÜCHER.de').key,id('https://xn--bcher-kva.de').key);
  for(const url of ['about:blank','file:///a','javascript:alert(1)','garbage','https://user:secret@example.com'])assert.equal(id(url),null);
  assert.equal(id('http://localhost:8000').key,'host:localhost:8000');
  assert.equal(id('http://127.0.0.1:8000').key,'host:127.0.0.1:8000');
});
test('scope records persist independently and clear only the chosen record',()=>{
  let store=p.emptyStore();
  const context={scope:'site',workspaceId:'A',siteKey:'domain:example.com'};
  store=p.setChoice(store,context,'dark');
  store=p.setChoice(store,{...context,scope:'workspace'},'light');
  store=p.setChoice(store,{...context,scope:'workspace-site'},'system');
  assert.equal(p.resolveAppearance({...context,store}),'dark');
  assert.equal(p.resolveAppearance({...context,scope:'workspace',store}),'light');
  assert.equal(p.resolveAppearance({...context,scope:'workspace-site',store}),'system');
  assert.equal(p.resolveAppearance({...context,scope:'workspace-site',workspaceId:'B',store}),'inherit');
  store=p.setChoice(store,{...context,scope:'workspace-site'},'inherit');
  assert.equal(p.resolveAppearance({...context,scope:'workspace-site',store}),'inherit');
  assert.equal(p.resolveAppearance({...context,store}),'dark');
});
test('legacy Auto is System, missing entries inherit and malformed records are rejected',()=>{
  const store=p.parseStore('', '{"A":0,"B":1,"C":2}');
  for(const [workspaceId,want] of [['A','system'],['B','light'],['C','dark'],['D','inherit']])
    assert.equal(p.resolveAppearance({scope:'workspace',workspaceId,store}),want);
  for(const raw of ['{broken','[]','{"version":999}','{"version":1,"sites":{"domain:a.com":"purple"}}'])assert.throws(()=>p.parseStore(raw,'{}'));
  assert.throws(()=>p.parseStore('', '{broken'));
});
test('regrouping preserves conflicting choices and can restore automatic grouping',()=>{
  let store=p.emptyStore();
  store=p.setChoice(store,{scope:'site',siteKey:'domain:example.com'},'dark');
  store=p.setChoice(store,{scope:'site',siteKey:'host:shop.example.com'},'light');
  store=p.setGrouping(store,'shop.example.com','host:shop.example.com');
  assert.equal(id('https://shop.example.com',store).key,'host:shop.example.com');
  store=p.setGrouping(store,'shop.example.com','domain:example.com');
  assert.equal(p.resolveAppearance({scope:'site',siteKey:id('https://shop.example.com',store).key,store}),'dark');
  store=p.setGrouping(store,'shop.example.com',null);
  assert.equal(id('https://shop.example.com',store).key,'domain:example.com');
  assert.equal(store.sites['host:shop.example.com'],'light');
  assert.throws(()=>p.setGrouping(store,'*.example.com','domain:example.com'));
  assert.throws(()=>p.setGrouping(store,'example.com/path','domain:example.com'));
});
test('validated state rejects prototype keys and missing context rather than broadening scope',()=>{
  const store=p.emptyStore();
  assert.throws(()=>p.setChoice(store,{scope:'workspace',workspaceId:null},'dark'));
  assert.throws(()=>p.setChoice(store,{scope:'site',siteKey:null},'dark'));
  assert.throws(()=>p.parseStore('{"version":1,"groups":{"__proto__":"host:x.com"}}','{}'));
  assert.throws(()=>p.setChoice(store,{scope:'invalid',siteKey:'domain:x.com'},'dark'));
});
test('group aliases preserve port boundaries instead of doubling destination ports',()=>{
 let store=p.setChoice(p.emptyStore(),{scope:'site',siteKey:'domain:example.com:8443'},'dark');
 store=p.setGrouping(store,'alias.example.org','domain:example.com:8443');
 assert.equal(id('https://alias.example.org:8443',store).key,'domain:example.com:8443');
 assert.equal(p.resolveAppearance({scope:'site',siteKey:id('https://alias.example.org:8443',store).key,store}),'dark');
 assert.equal(p.resolveAppearance({scope:'site',siteKey:id('https://alias.example.org',store).key,store}),'inherit');
 assert.equal(id('https://alias.example.org:9443',store).key,'domain:example.com:9443');
});
