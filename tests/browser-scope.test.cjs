const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function readScope(value,zen=true){
 const ctx={Services:{prefs:{getStringPref:(_k,fallback)=>value===undefined?fallback:value}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../src/appearance-browser.js'),'utf8'),ctx);
 return ctx.satScope(zen?{gZenWorkspaces:{}}:{});
}
test('unset remembering mode defaults to website choices within each workspace',()=>assert.equal(readScope(undefined),'workspace-site'));
test('legacy whole-workspace mode becomes website within workspace, not unrelated domains',()=>assert.equal(readScope('workspace'),'workspace-site'));
test('supported website scopes survive and invalid values use the workspace website default',()=>{
 assert.equal(readScope('site'),'site');assert.equal(readScope('workspace-site'),'workspace-site');assert.equal(readScope('garbage'),'workspace-site');
});
test('browsers without workspaces always use website scope',()=>assert.equal(readScope('workspace-site',false),'site'));
