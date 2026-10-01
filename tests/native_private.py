"""Native private-window choice isolation, in an owned synthetic profile."""
import json,time,hashlib,traceback
from native_support import Browser,ROOT
source=(ROOT/'sine/JS/zen-colorscheme-toggle.uc.js').read_text(encoding='utf-8')
result={'sourceSHA256':hashlib.sha256(source.encode()).hexdigest(),'checks':[]}
out=ROOT/'verification'/('native-private-'+str(time.time_ns())+'.json')
def check(name,value,want):
 result['checks'].append(dict(name=name,actual=value,expected=want,passed=value==want));print(name,value,flush=True);assert value==want
try:
 with Browser() as b:
  result['identity']=b.c.identity
  b.chrome("Services.prefs.setStringPref('mod.zensiteappearancetoggle.scope','workspace');window.__privateWin=OpenBrowserWindow({private:true});")
  for _ in range(80):
   if b.chrome('return !!window.__privateWin.gBrowserInit?.delayedStartupFinished;'):break
   time.sleep(.1)
  b.chrome('''let win=window.__privateWin;let sandbox=Cu.Sandbox(win,{sandboxPrototype:win,wantXrays:false});Cu.evalInSandbox(arguments[0],sandbox);
  window.__before=[Services.prefs.getStringPref('mod.zensiteappearancetoggle.state',''),Services.prefs.getStringPref('mod.zensiteappearancetoggle.workspacemap','')];''',source);time.sleep(.2)
  check('private window is identified by native API',b.chrome("return ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs').PrivateBrowsingUtils.isWindowPrivate(window.__privateWin);"),True)
  b.chrome("window.__privateWin.__zenSiteAppearanceToggle.choose('dark');")
  check('private toolbar choice is applied',b.chrome('return window.__privateWin.gBrowser.selectedBrowser.browsingContext.prefersColorSchemeOverride;'),'dark')
  check('private choice leaves both saved maps untouched',b.chrome("return JSON.stringify(window.__before)===JSON.stringify([Services.prefs.getStringPref('mod.zensiteappearancetoggle.state',''),Services.prefs.getStringPref('mod.zensiteappearancetoggle.workspacemap','')]);"),True)
  b.chrome('window.__privateWin.__zenSiteAppearanceToggle.stop();')
  check('private stop releases override',b.chrome('return window.__privateWin.gBrowser.selectedBrowser.browsingContext.prefersColorSchemeOverride;'),'none')
  b.chrome('window.__privateWin.close();')
except Exception as e:result['error']=repr(e);traceback.print_exc()
finally:out.write_text(json.dumps(result,indent=2),encoding='utf-8');print(out,flush=True)
if result.get('error'):raise SystemExit(1)
