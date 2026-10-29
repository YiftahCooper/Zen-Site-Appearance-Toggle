"""Real supported-site toolbar checks. Fresh signed-out owned profile only."""
import hashlib,json,time,shutil,traceback,re,sys
from native_support import Browser,ROOT
result={'checks':[]};output=ROOT/'.backup-scratch/native-sites';output.mkdir(parents=True,exist_ok=True);out=output/('native-sites-'+str(time.time_ns())+'.json')
def check(name,actual,expected):
 item={'name':name,'actual':actual,'expected':expected,'pass':actual==expected};result['checks'].append(item);print(name,item['pass'],actual,flush=True);assert item['pass'],item
def appearance(b):return b.content("return {dark:matchMedia('(prefers-color-scheme:dark)').matches,body:getComputedStyle(document.body).backgroundColor,theme:localStorage.getItem('Bard-Color-Theme')};")
def light(b):
 sample=appearance(b);result.setdefault('renderedSamples',[]).append(sample)
 return not sample['dark'] and all(int(n)>=235 for n in re.findall(r'\d+',sample['body'])) and sample['theme']=='Bard-System-Theme'
def click(b):
 b.chrome("document.getElementById('zen-colorscheme-toggle').doCommand();")
 for _ in range(600):
  state=b.chrome("return {busy:!!window.__zenSiteAppearanceToggle?.busy,error:window.__satError||null};")
  if not state['busy']:break
  time.sleep(.1)
 if state['busy']:raise RuntimeError('SAT toolbar did not finish within 60 seconds')
 time.sleep(.3)
 if state['error']:raise RuntimeError(state['error'])
try:
 with Browser(network=True) as b:
  result['identity']=b.c.identity
  mods=b.profile/'chrome'/'sine-mods';target=mods/'zen-site-appearance-toggle';target.mkdir(parents=True)
  shutil.copytree(ROOT/'sine',target/'sine')
  manifest=b.profile/'chrome'/'site-test.manifest';manifest.write_text('content sine '+mods.as_uri()+'/\n',encoding='utf-8')
  b.chrome("const f=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);f.initWithPath(arguments[0]);Components.manager.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(f);Services.prefs.setIntPref('layout.css.prefers-color-scheme.content-override',0);Services.prefs.setStringPref('mod.zensiteappearancetoggle.scope','site');",str(manifest))
  b.navigate('https://gemini.google.com/');time.sleep(1)
  action=(ROOT/'src/appearance-site-actions.js').read_text(encoding='utf-8')
  b.content(action+"\nreturn siteAppearanceAction(document,{operation:'set',theme:'Dark'});")
  check('fixture Gemini really starts with its own Dark',appearance(b)['theme'],'Bard-Dark-Theme')
  variant=sys.argv[1] if len(sys.argv)>1 else 'sine'
  if variant=='sine':
   uri='chrome://sine/content/zen-site-appearance-toggle/sine/JS/zen-colorscheme-toggle.uc.js';sourceFile=ROOT/'sine/JS/zen-colorscheme-toggle.uc.js'
  else:
   folder='moon-'+variant;dest=b.profile/'chrome'/'JS'/folder;shutil.copytree(ROOT/'chrome'/'JS'/folder,dest)
   sourceFile=dest/('zen-colorscheme-toggle-'+variant+'.uc.js')
   manualManifest=b.profile/'chrome'/'manual-test.manifest';manualManifest.write_text('content userScripts '+(b.profile/'chrome'/'JS').as_uri()+'/\n',encoding='utf-8')
   b.chrome("const f=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);f.initWithPath(arguments[0]);Components.manager.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(f);",str(manualManifest))
   uri='chrome://userScripts/content/'+folder+'/'+sourceFile.name
  result['variant']=variant
  result['sourceSHA256']=hashlib.sha256(sourceFile.read_bytes()).hexdigest()
  b.chrome("Services.scriptloader.loadSubScriptWithOptions(arguments[0],{target:window,ignoreCache:true});",uri)
  click(b)
  check('first actual toolbar click renders Gemini light',light(b),True)
  check('website setup stores original Dark',b.chrome("return window.__zenSiteAppearanceToggle.siteSetup.records().map(r=>r.before);"),['Dark'])
  check('Gemini click leaves native global Dark',b.chrome("return Services.prefs.getIntPref('layout.css.prefers-color-scheme.content-override');"),0)
  click(b);check('next toolbar click renders Gemini dark',appearance(b)['body'],'rgb(15, 15, 15)')
  click(b);check('next toolbar click renders Gemini light again',light(b),True)
  b.navigate('https://gemini.google.com/');time.sleep(1)
  check('Gemini reload retains its SAT light choice',appearance(b)['dark'],False)
  b.chrome("return window.__zenSiteAppearanceToggle.siteSetup.undo('gemini:0');")
  check('website Undo restores Gemini own Dark',appearance(b)['theme'],'Bard-Dark-Theme')
  check('website Undo removes only the setup record',b.chrome('return window.__zenSiteAppearanceToggle.siteSetup.records().length;'),0)
  if variant!='sine':
   result['manualActorRegistered']=b.chrome('return !!window.__satSiteRegistry.registered;')
   # Manual variants exercise the trusted file resource actor on real Gemini.
   # Google is tested separately with the same shared source in the Sine run.
   raise StopIteration
  b.navigate('https://www.google.com/preferences?hl=en&fg=1#appearance');time.sleep(.7)
  b.content(action+"\nreturn siteAppearanceAction(document,{operation:'set',theme:'1'});");time.sleep(.7)
  b.navigate('https://www.google.com/preferences?hl=en&fg=1#appearance');time.sleep(.5)
  check('fixture Google really starts with its own Off',b.content(action+"\nreturn siteAppearanceAction(document,{operation:'inspect'});")['before'],'1')
  b.navigate('https://www.google.com/?hl=en');time.sleep(.7)
  result['googleBefore']=b.content("return {dark:matchMedia('(prefers-color-scheme:dark)').matches,body:getComputedStyle(document.body).backgroundColor,cs:new URL(location.href).searchParams.get('cs')};")
  b.chrome("const api=window.__zenSiteAppearanceToggle.siteSetup;const original=api.ensure;api.ensure=async(...args)=>{const info=await original(...args);window.__testSetupInfo=info;return info;};")
  beforeTabs=b.chrome('return gBrowser.tabs.length;')
  click(b);time.sleep(1)
  sample=b.content("return {dark:matchMedia('(prefers-color-scheme:dark)').matches,body:getComputedStyle(document.body).backgroundColor,cs:new URL(location.href).searchParams.get('cs')};")
  result.setdefault('googleSamples',[]).append(sample)
  result['googleSetupInfo']=b.chrome('return {info:window.__testSetupInfo,choice:window.__zenSiteAppearanceToggle.controller.choice(),records:window.__zenSiteAppearanceToggle.siteSetup.records()};')
  check('first Google click darkens explicit Light page',sample['dark'] and all(int(n)<60 for n in re.findall(r'\d+',sample['body'])) and sample['cs']=='2',True)
  check('Google setup closes all temporary tabs',b.chrome('return gBrowser.tabs.length;'),beforeTabs)
  check('Google setup remembers original Off',b.chrome("return window.__zenSiteAppearanceToggle.siteSetup.records().filter(r=>r.id==='google-search:0').map(r=>r.before);"),['Off'])
  b.content("const e=[...document.querySelectorAll('textarea[name=q],input[name=q]')].find(e=>e.getClientRects().length);if(!e)throw Error('Google fixture has no visible search input');e.value='SAT unsent test';e.dispatchEvent(new Event('input',{bubbles:true}));e.focus();e.setSelectionRange(4,10,'forward');")
  result['googleURLBeforeLight']=b.content('return location.href;')
  click(b);time.sleep(1)
  sample=b.content("return {dark:matchMedia('(prefers-color-scheme:dark)').matches,body:getComputedStyle(document.body).backgroundColor,cs:new URL(location.href).searchParams.get('cs')};")
  result['googleSamples'].append(sample)
  check('next Google click renders light',not sample['dark'] and all(int(n)>=235 for n in re.findall(r'\d+',sample['body'])) and sample['cs']=='1',True)
  check('Google repaint restores unsent search and cursor',b.content("const e=[...document.querySelectorAll('textarea[name=q],input[name=q]')].find(e=>e.getClientRects().length);return e&&[e.value,e.selectionStart,e.selectionEnd,e.selectionDirection,document.activeElement===e];"),['SAT unsent test',4,10,'forward',True])
  b.navigate('https://www.google.com/?hl=en');time.sleep(2)
  for _ in range(600):
   state=b.chrome("return {busy:!!window.__zenSiteAppearanceToggle?.busy,error:window.__satError||null};")
   if not state['busy']:break
   time.sleep(.1)
  if state['busy']:raise RuntimeError('Saved Google choice did not finish within 60 seconds')
  if state['error']:raise RuntimeError(state['error'])
  check('reopened Google document retains saved Light',b.content("return !matchMedia('(prefers-color-scheme:dark)').matches && [...document.querySelectorAll('[data-pcs]')].some(e=>e.getAttribute('data-pcs')==='1');"),True)
  check('Google toolbar leaves native global Dark',b.chrome("return Services.prefs.getIntPref('layout.css.prefers-color-scheme.content-override');"),0)
  b.chrome("return window.__zenSiteAppearanceToggle.siteSetup.undo('google-search:0');")
  check('Google website Undo verified and record cleared',b.chrome('return window.__zenSiteAppearanceToggle.siteSetup.records().length;'),0)
  check('Google Undo closes all temporary tabs',b.chrome('return gBrowser.tabs.length;'),beforeTabs)
except StopIteration:pass
except Exception as e:result['error']=repr(e);traceback.print_exc()
finally:out.write_text(json.dumps(result,indent=2),encoding='utf-8');print(out,flush=True)
if result.get('error'):raise SystemExit(1)
