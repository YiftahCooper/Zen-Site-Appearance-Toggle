"""Production favicon regression in a guarded new profile.
Run with python -B from the project directory. --preintegration separately
loads the actual production component beside existing generated SAT and records
that narrower proof boundary; default requires the integrated generated script.
"""
import sys,json,time,base64,traceback,hashlib
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent
sys.path.insert(0,str(ROOT/'tests'))
from native_support import Browser
from restore_readiness import RestoredIconReadiness
stock={key:(HERE/'fixtures'/name).read_text(encoding='utf-8').strip() for key,name in [('initialSVG','github-stock-dark.svg'),('lightSVG','github-stock-light.svg')]}
URIS=['data:image/svg+xml;base64,'+base64.b64encode(stock[k].encode()).decode() for k in ['initialSVG','lightSVG']]
run=str(time.time_ns());OUT=ROOT/'.backup-scratch/native-favicons'/run;OUT.mkdir(parents=True)
result={'checks':[],'snapshots':[],'screenshots':[],'errors':[]}
SNAP=r'''
return {pref:Services.prefs.getIntPref('layout.css.prefers-color-scheme.content-override'),chromeDark:matchMedia('(prefers-color-scheme:dark)').matches,tabs:[...gBrowser.tabs].filter(t=>window.__targets.includes(t)).map(t=>({key:window.__names.get(t),id:t.id,url:t.linkedBrowser.currentURI.spec,pending:t.hasAttribute('pending'),essential:t.hasAttribute('zen-essential'),static:t.zenStaticIcon||null,image:t.getAttribute('image'),source:t.iconImage?.getAttribute('src'),mIconURL:t.linkedBrowser.mIconURL||null,reset:JSON.stringify(t._zenPinnedInitialState||null),essentialCSS:t.style.getPropertyValue('--zen-essential-tab-icon'),filter:t.iconImage?.style.getPropertyValue('filter'),priority:t.iconImage?.style.getPropertyPriority('filter'),computed:t.iconImage?{filter:getComputedStyle(t.iconImage).filter,scheme:getComputedStyle(t.iconImage).colorScheme,display:getComputedStyle(t.iconImage).display,width:t.iconImage.getBoundingClientRect().width,height:t.iconImage.getBoundingClientRect().height}:null,marker:t.iconImage?.getAttribute('data-sat-github-favicon')}))};
'''
def snap(b,label):
 d=b.chrome(SNAP);d['label']=label;result['snapshots'].append(d);(OUT/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8');return d
def check(name,value):result['checks'].append({'name':name,'pass':bool(value)});print(name,bool(value),flush=True)
def wait(b,predicate,seconds=20):
 for _ in range(int(seconds*10)):
  if b.chrome(predicate):return True
  time.sleep(.1)
 return False
def shot(b,label):
 b.context('chrome')
 try:
  raw=b.c.command('WebDriver:TakeScreenshot',{'full':False})['value'];path=OUT/(label+'.png');path.write_bytes(base64.b64decode(raw));result['screenshots'].append(str(path))
 except Exception as e:result.setdefault('screenshotErrors',[]).append(repr(e))
try:
 with Browser(network=True,profile=ROOT/'.backup-scratch/icon-diagnosis'/('presentation-'+run)) as b:
  result['identity']=b.c.identity;result['profile']=str(b.profile)
  b.chrome("Services.prefs.setIntPref('layout.css.prefers-color-scheme.content-override',0);window.resizeTo(1200,900);")
  b.navigate('https://github.com/octocat/Hello-World');wait(b,"return (gBrowser.selectedBrowser.mIconURL||'').startsWith('data:image/svg+xml');")
  b.chrome("window.__regular=gBrowser.addTab('https://github.com/octocat/Hello-World',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});gBrowser.selectedTab=window.__regular;")
  wait(b,"return (window.__regular.linkedBrowser.mIconURL||'').startsWith('data:image/svg+xml');")
  b.chrome("window.__essential=gBrowser.addTab('https://github.com/octocat/Hello-World',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});gBrowser.selectedTab=window.__essential;")
  wait(b,"return (window.__essential.linkedBrowser.mIconURL||'').startsWith('data:image/svg+xml');")
  b.chrome("gZenPinnedTabManager.addToEssentials(window.__essential);window.__unknown=gBrowser.addTab('https://github.com/unknown-test',{createLazyBrowser:true,triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});window.__custom=gBrowser.addTab('https://github.com/custom-test',{createLazyBrowser:true,triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});window.__other=gBrowser.addTab('https://example.com/',{createLazyBrowser:true,triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});window.__targets=[__regular,__essential,__unknown,__custom,__other];window.__names=new Map(__targets.map((t,i)=>[t,['regular','essential','unknown','custom','other'][i]]));",URIS)
  b.chrome("__regular.iconImage.style.setProperty('filter','opacity(0.8)','important');__essential.iconImage.style.setProperty('filter','opacity(0.7)');__custom.iconImage.style.setProperty('filter','sepia(0.25)');__custom.zenStaticIcon=arguments[0];gBrowser.setIcon(__custom,arguments[0]);gBrowser.setIcon(__other,arguments[0]);gBrowser.setIcon(__unknown,'data:image/svg+xml;base64,'+btoa('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\"><circle cx=\"16\" cy=\"16\" r=\"15\" fill=\"purple\"/></svg>'));",URIS[0])
  # Leave regular GitHub pending while the Essential is the selected live page.
  check('native regular discard succeeds',b.chrome('return gBrowser.discardBrowser(__regular,true);'))
  baseline=snap(b,'baseline')
  generated=(ROOT/'sine/JS/zen-colorscheme-toggle.uc.js').read_text(encoding='utf-8')
  integrated='startAppearanceFavicons(win)' in generated
  assert integrated or '--preintegration' in sys.argv
  result['integration']='generated' if integrated else 'separate-production-component'
  result['generatedSHA256']=hashlib.sha256(generated.encode()).hexdigest()
  b.chrome("Services.prefs.setStringPref('mod.zensiteappearancetoggle.scope','site');let sandbox=Cu.Sandbox(window,{sandboxPrototype:window,wantXrays:false});Cu.evalInSandbox(arguments[0],sandbox);",generated)
  if not integrated:
   component=(ROOT/'src/appearance-favicons.js').read_text(encoding='utf-8');result['componentSHA256']=hashlib.sha256(component.encode()).hexdigest()
   b.chrome("let sandbox=Cu.Sandbox(window,{sandboxPrototype:window,wantXrays:false});Cu.evalInSandbox(arguments[0]+'\\nstartAppearanceFavicons(window);',sandbox);",component)
  time.sleep(.2);check('generated SAT starts favicon component',b.chrome('return !!__zenSiteAppearanceToggle && !!__satFaviconRuntime;'))
  for dark in [True,False]:
   # Native built-in theme changes in this disposable profile only.
   theme='firefox-compact-dark@mozilla.org' if dark else 'firefox-compact-light@mozilla.org'
   result.setdefault('themeEnables',[]).append(b.chrome("return ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager.getAddonByID(arguments[0]).then(a=>a? a.enable().then(()=>true):false);",theme))
   b.chrome("Services.prefs.setIntPref('ui.systemUsesDarkTheme',arguments[0]);",1 if dark else 0)
   time.sleep(.4)
   for fill,uri in zip(['white','black'],URIS):
    # Deliberately replay genuine known favicon source bytes through the native API.
    # This changes only the diagnostic source inputs; the presentation never calls setIcon.
    b.chrome('gBrowser.setIcon(__regular,arguments[0]);gBrowser.setIcon(__essential,arguments[0]);',uri);time.sleep(.15)
    state=snap(b,('dark' if dark else 'light')+'-'+fill);tabs={t['key']:t for t in state['tabs']}
    expected='brightness(0) invert(1)' if dark else 'brightness(0)'
    check(state['label']+' actual sidebar scheme',all(tabs[k]['computed']['scheme']==('dark' if dark else 'light') for k in ['regular','essential']))
    check(state['label']+' regular and Essential presentation',all(tabs[k]['filter']==expected and tabs[k]['marker']==('dark' if dark else 'light') for k in ['regular','essential']))
    check(state['label']+' regular and Essential visible geometry',all(tabs[k]['computed']['width']>0 and tabs[k]['computed']['height']>0 for k in ['regular','essential']))
    check(state['label']+' pending regular remains pending',tabs['regular']['pending'])
    check(state['label']+' custom unknown other bypass',all(tabs[k]['marker'] is None for k in ['custom','unknown','other']) and tabs['custom']['filter']=='sepia(0.25)')
    shot(b,state['label'])
  # Real website source transitions from the integrated SAT per-site controller.
  b.chrome("gBrowser.selectedTab=__essential;__zenSiteAppearanceToggle.choose('light');")
  check('real GitHub Light transition reaches stock black source',wait(b,"return __essential.linkedBrowser.mIconURL===arguments[0];".replace('arguments[0]',json.dumps(URIS[1]))))
  check('real GitHub Light transition retains actual sidebar rendering',b.chrome("return __essential.iconImage.getAttribute('data-sat-github-favicon')==='light';"));snap(b,'sat-github-light')
  b.chrome("__zenSiteAppearanceToggle.choose('dark');")
  check('real GitHub Dark transition reaches stock white source',wait(b,"return __essential.linkedBrowser.mIconURL===arguments[0];".replace('arguments[0]',json.dumps(URIS[0]))))
  check('real GitHub Dark transition retains actual sidebar rendering',b.chrome("return __essential.iconImage.getAttribute('data-sat-github-favicon')==='light';"));snap(b,'sat-github-dark')
  # Real restored lifecycle with the observer active and no direct replay thereafter.
  b.chrome('gBrowser.selectedTab=__regular;');check('real regular restores',wait(b,"return !__regular.hasAttribute('pending')&&(__regular.linkedBrowser.mIconURL||'').startsWith('data:image/svg+xml');"));time.sleep(.5)
  check('real regular restore remains treated',b.chrome("return __regular.iconImage.hasAttribute('data-sat-github-favicon');"));snap(b,'real-regular-restore');shot(b,'real-regular-restore')
  b.chrome('gBrowser.selectedTab=__other;');check('native Essential discard succeeds',b.chrome('return gBrowser.discardBrowser(__essential,true);'));time.sleep(.2)
  check('pending Essential remains treated',b.chrome("return __essential.hasAttribute('pending')&&__essential.iconImage.hasAttribute('data-sat-github-favicon');"));snap(b,'real-essential-discard')
  b.chrome('window.__satBeforeRestoreDocument=__essential.linkedBrowser.browsingContext?.currentWindowGlobal;gBrowser.selectedTab=__essential;')
  result['essentialRestoreTimeline']=[]
  readiness=RestoredIconReadiness('https://github.com/octocat/Hello-World');settled=False
  for index in range(100):
   state=b.chrome(r'''const t=__essential,b=t.linkedBrowser,w=b.browsingContext?.currentWindowGlobal,i=t.iconImage;
    function svg(source){try{if(source.startsWith('moz-remote-image:'))source=new URL(source).searchParams.get('url')||'';const match=/^data:image\/svg\+xml;base64,(.*)$/s.exec(source);return match?atob(match[1]).trim().replace(/\r\n?/g,'\n'):null;}catch{return null;}}
    const source=svg(i?.getAttribute('src')||'');
    return {at:Date.now(),pending:t.hasAttribute('pending'),loading:b.webProgress.isLoadingDocument,newDocument:!!w&&w!==window.__satBeforeRestoreDocument,
      documentId:w?.innerWindowId?String(w.innerWindowId):null,documentURL:w?.documentURI?.spec||null,stockSource:!!source&&arguments[0].some(uri=>svg(uri)===source),hasNativeSource:!!b.mIconURL,
      filter:i?.style.filter,marker:i?.getAttribute('data-sat-github-favicon')};''',URIS)
   result['essentialRestoreTimeline'].append(state)
   settled=readiness.observe(state)
   if settled:break
   time.sleep(.1)
  check('Essential reaches a loaded replacement document with its stock icon source',settled)
  check('loaded Essential retains contrast treatment',state['marker']=='light' and state['filter']=='brightness(0)')
  snap(b,'real-essential-restore');shot(b,'real-essential-restore')
  # Custom icon chosen on a previously treated native Essential.
  b.chrome('__essential.zenStaticIcon=arguments[0];gBrowser.setIcon(__essential,arguments[0]);',URIS[0]);time.sleep(.15)
  check('custom selection releases previously treated Essential',b.chrome("return !__essential.iconImage.hasAttribute('data-sat-github-favicon')&&__essential.iconImage.style.filter==='opacity(0.7)';"));snap(b,'essential-custom-selected')
  b.chrome('delete __essential.zenStaticIcon;gBrowser.setIcon(__essential,arguments[0]);',URIS[1]);time.sleep(.15)
  check('removing custom reclaims recognized Essential',b.chrome("return __essential.iconImage.hasAttribute('data-sat-github-favicon');"))
  # Native CSSOM intervention must yield without reclaiming on source/theme changes.
  b.chrome("__regular.iconImage.style.setProperty('filter','sepia(0.9)','important');")
  time.sleep(.15)
  check('external filter write yields immediately',b.chrome("return !__regular.iconImage.hasAttribute('data-sat-github-favicon')&&__regular.iconImage.style.filter==='sepia(0.9)';"))
  b.chrome("gBrowser.setIcon(__regular,arguments[0]);",URIS[0]);time.sleep(.15)
  check('stock source update does not reclaim external filter',b.chrome("return __regular.iconImage.style.filter==='sepia(0.9)'&&!__regular.iconImage.hasAttribute('data-sat-github-favicon');"))
  before=snap(b,'before-stop');b.chrome('__zenSiteAppearanceToggle.stop();'+('' if integrated else '__satFaviconRuntime.stop();'));after=snap(b,'after-stop')
  bt={t['key']:t for t in before['tabs']};at={t['key']:t for t in after['tabs']}
  check('stop preserves source image native data Essential CSS and reset baseline',all(all(bt[k][field]==at[k][field] for field in ['source','image','mIconURL','essentialCSS','reset','static','pending']) for k in bt))
  check('stop restores existing inline values and priority',at['regular']['filter']=='sepia(0.9)' and at['regular']['priority']=='important' and at['essential']['filter']=='opacity(0.7)' and at['essential']['priority']=='' and at['custom']['filter']=='sepia(0.25)')
  check('root stop disconnects favicon component',b.chrome('return !window.__satFaviconRuntime;'))
  check('stop removes all owned markers',all(t['marker'] is None for t in after['tabs']))
  check('global appearance remains Dark',all(s['pref']==0 for s in result['snapshots']))
  check('pin baseline unchanged through treatment and lifecycle',all(next(t for t in s['tabs'] if t['key']=='essential')['reset']==next(t for t in baseline['tabs'] if t['key']=='essential')['reset'] for s in result['snapshots']))
  shot(b,'cleanup')
except Exception as e:result['errors'].append(repr(e));traceback.print_exc()
finally:
 result['passed']=sum(c['pass'] for c in result['checks']);result['total']=len(result['checks']);(OUT/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(OUT,flush=True)
if result['errors'] or result['passed']!=result['total']:raise SystemExit(1)
