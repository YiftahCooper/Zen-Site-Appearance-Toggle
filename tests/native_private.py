"""Native private-window choice isolation, in an owned synthetic profile."""
import json,time,hashlib,traceback,threading
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from native_support import Browser,ROOT
source=(ROOT/'sine/JS/zen-colorscheme-toggle.uc.js').read_text(encoding='utf-8')
result={'sourceSHA256':hashlib.sha256(source.encode()).hexdigest(),'sourceFileSHA256':hashlib.sha256((ROOT/'sine/JS/zen-colorscheme-toggle.uc.js').read_bytes()).hexdigest(),'checks':[]}
receipts=ROOT/'.backup-scratch/native-contracts';receipts.mkdir(parents=True,exist_ok=True)
out=receipts/('native-private-'+str(time.time_ns())+'.json')
class Page(BaseHTTPRequestHandler):
 def do_GET(self):
  body=b'<title>SAT owned private fixture</title><body>Private website appearance fixture</body>'
  self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(body)
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Page);threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://localhost:{server.server_port}/private-choice'
def check(name,value,want):
 result['checks'].append(dict(name=name,actual=value,expected=want,passed=value==want));print(name,value,flush=True);assert value==want
try:
 with Browser() as b:
  result['identity']=b.c.identity
  b.chrome("Services.prefs.setStringPref('mod.zensiteappearancetoggle.scope','workspace');window.__privateWin=OpenBrowserWindow({private:true});")
  for _ in range(80):
   if b.chrome('return !!window.__privateWin.gBrowserInit?.delayedStartupFinished;'):break
   time.sleep(.1)
  b.chrome("window.__privateWin.gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});",url)
  for _ in range(80):
   if b.chrome("return window.__privateWin.gBrowser.selectedBrowser.currentURI.spec===arguments[0]&&!window.__privateWin.gBrowser.selectedBrowser.webProgress.isLoadingDocument;",url):break
   time.sleep(.1)
  check('actual private selected tab loaded owned localhost website',b.chrome('return window.__privateWin.gBrowser.selectedBrowser.currentURI.spec;'),url)
  b.chrome('''let win=window.__privateWin;let sandbox=Cu.Sandbox(win,{sandboxPrototype:win,wantXrays:false});Cu.evalInSandbox(arguments[0],sandbox);
  window.__prefWrites=[];window.__prefObserver={observe:(subject,topic,key)=>window.__prefWrites.push(key)};Services.prefs.addObserver('mod.zensiteappearancetoggle.',window.__prefObserver);Services.prefs.addObserver('layout.css.prefers-color-scheme.content-override',window.__prefObserver);
  window.__before=[Services.prefs.getStringPref('mod.zensiteappearancetoggle.state',''),Services.prefs.getStringPref('mod.zensiteappearancetoggle.workspacemap',''),Services.prefs.getStringPref('mod.zensiteappearancetoggle.site-setup',''),Services.prefs.getIntPref('layout.css.prefers-color-scheme.content-override',2)];''',source);time.sleep(.2)
  check('private window is identified by native API',b.chrome("return ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs').PrivateBrowsingUtils.isWindowPrivate(window.__privateWin);"),True)
  b.chrome("window.__privateWin.__zenSiteAppearanceToggle.choose('dark');")
  check('private toolbar choice is applied',b.chrome('return window.__privateWin.gBrowser.selectedBrowser.browsingContext.prefersColorSchemeOverride;'),'dark')
  check('private choice leaves saved maps, setup journal and browser default untouched',b.chrome("return JSON.stringify(window.__before)===JSON.stringify([Services.prefs.getStringPref('mod.zensiteappearancetoggle.state',''),Services.prefs.getStringPref('mod.zensiteappearancetoggle.workspacemap',''),Services.prefs.getStringPref('mod.zensiteappearancetoggle.site-setup',''),Services.prefs.getIntPref('layout.css.prefers-color-scheme.content-override',2)]);"),True)
  check('private website choice performs no normal persisted preference writes',b.chrome('return window.__prefWrites;'),[])
  b.chrome('window.__privateWin.__zenSiteAppearanceToggle.stop();')
  check('private stop releases override',b.chrome('return window.__privateWin.gBrowser.selectedBrowser.browsingContext.prefersColorSchemeOverride;'),'none')
  b.chrome("Services.prefs.removeObserver('mod.zensiteappearancetoggle.',window.__prefObserver);Services.prefs.removeObserver('layout.css.prefers-color-scheme.content-override',window.__prefObserver);window.__privateWin.close();")
except Exception as e:result['error']=repr(e);traceback.print_exc()
finally:
 server.shutdown();server.server_close();result['sourceFileUnchangedAtEnd']=hashlib.sha256((ROOT/'sine/JS/zen-colorscheme-toggle.uc.js').read_bytes()).hexdigest()==result['sourceFileSHA256'];out.write_text(json.dumps(result,indent=2),encoding='utf-8');print(out,flush=True)
if result.get('error'):raise SystemExit(1)
