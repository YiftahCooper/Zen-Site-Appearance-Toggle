"""Read-only page detection and toolbar checks in an owned offline Zen profile.

Runs the generated package, including its real content actor. Routine output and
profiles stay under .backup-scratch/page-appearance; no everyday connection.
"""
import hashlib,json,shutil,threading,time,traceback
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from native_support import Browser,ROOT

class Page(BaseHTTPRequestHandler):
    def do_GET(self):
        adaptive='adaptive' in self.path
        css='@media(prefers-color-scheme:dark){body{background:#111;color:white}}' if adaptive else ''
        data=('''<!doctype html><meta charset="utf-8"><title>Appearance fixture</title>
        <style>html,body{margin:0}body{background:white;color:black}main{min-height:100vh}
        '''+css+'''body.manual-dark{background:#111;color:white}body.manual-light{background:white;color:black}
        body.photo{background-image:linear-gradient(black,white)}</style><main>
        <button id="own-dark" onclick="document.body.className='manual-dark'">Website Dark</button>
        <button id="own-light" onclick="document.body.className='manual-light'">Website Light</button>
        Fixture content</main>''').encode()
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(data)
    def log_message(self,*args):pass

result={'checks':[],'packageSHA256':hashlib.sha256((ROOT/'sine/JS/zen-colorscheme-toggle.uc.js').read_bytes()).hexdigest()}
out=ROOT/'.backup-scratch/page-appearance/native-result.json';out.parent.mkdir(parents=True,exist_ok=True)
server=ThreadingHTTPServer(('127.0.0.1',0),Page);threading.Thread(target=server.serve_forever,daemon=True).start()

def check(name,actual,want):
    item={'name':name,'actual':actual,'expected':want,'passed':actual==want};result['checks'].append(item)
    print(name,item['passed'],flush=True)
    if not item['passed']:raise AssertionError(item)

def toolbar(b):
    return b.chrome("let e=document.getElementById('zen-colorscheme-toggle');return {theme:e?.getAttribute('data-sat-page-theme'),tooltip:e?.getAttribute('tooltiptext'),icon:e?.querySelector('.toolbarbutton-icon')?.getAttribute('src'),choice:window.__zenSiteAppearanceToggle?.controller.choice()};")

def await_theme(b,want):
    end=time.monotonic()+5
    while time.monotonic()<end:
        sample=toolbar(b)
        if sample['theme']==want:return sample
        time.sleep(.1)
    raise AssertionError({'wanted':want,'toolbar':sample})

try:
    with Browser() as b:
        result['runtime']={'version':b.c.identity['version'],'gecko':b.c.identity['gecko']}
        mods=b.profile/'chrome/sine-mods';target=mods/'zen-site-appearance-toggle';target.mkdir(parents=True)
        shutil.copytree(ROOT/'sine',target/'sine')
        manifest=b.profile/'chrome/page-appearance.manifest';manifest.write_text('content sine '+mods.as_uri()+'/\n',encoding='utf-8')
        b.chrome("let f=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);f.initWithPath(arguments[0]);Components.manager.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(f);Services.prefs.setIntPref('layout.css.prefers-color-scheme.content-override',0);",str(manifest))
        base=f'http://localhost:{server.server_port}'
        b.navigate(base+'/plain')
        b.chrome("Services.scriptloader.loadSubScript('chrome://sine/content/zen-site-appearance-toggle/sine/JS/zen-colorscheme-toggle.uc.js',window);")
        sample=await_theme(b,'light')
        check('unfamiliar native light page uses a light icon under global Dark','to Dark' in sample['tooltip'],True)
        light_icon=sample['icon']
        check('visiting does not create remembered choices',b.chrome("return Services.prefs.getStringPref('mod.zensiteappearancetoggle.state','');"),'')
        check('visiting leaves the tab inherited',b.chrome('return gBrowser.selectedBrowser.browsingContext.prefersColorSchemeOverride;'),'none')
        b.content("document.getElementById('own-dark').click();")
        sample=await_theme(b,'dark');dark_icon=sample['icon']
        check('website own Dark control updates the icon',dark_icon!=light_icon,True)
        check('website own Dark control updates the next action','to Light' in sample['tooltip'],True)
        b.content("document.getElementById('own-light').click();")
        check('website own Light control restores the light icon',await_theme(b,'light')['icon'],light_icon)
        check('website controls do not save SAT choices',b.chrome("return Services.prefs.getStringPref('mod.zensiteappearancetoggle.state','');"),'')
        b.chrome('return window.__zenSiteAppearanceToggle.toggle();')
        check('first SAT click requests opposite of rendered Light',b.chrome('return gBrowser.selectedBrowser.browsingContext.prefersColorSchemeOverride;'),'dark')
        check('fixed light page keeps its actual light icon after Dark request',await_theme(b,'light')['icon'],light_icon)
        check('website choice remains Dark despite actual light rendering',toolbar(b)['choice'],'dark')
        b.navigate(base+'/adaptive')
        check('navigation to an adaptive document uses its actual dark icon',await_theme(b,'dark')['icon'],dark_icon)
        b.content("document.getElementById('own-light').click();")
        check('website own override of saved Dark changes the displayed icon',await_theme(b,'light')['icon'],light_icon)
        check('observing a website override retains the saved choice',toolbar(b)['choice'],'dark')
        b.content("document.body.className='photo';")
        check('complex image background is marked unknown',await_theme(b,'unknown')['theme'],'unknown')
        check('unknown palette explains requested-appearance fallback','not detected' in toolbar(b)['tooltip'],True)
        b.navigate(base+'/plain-replacement')
        check('replacement document cannot retain the previous dark icon',await_theme(b,'light')['icon'],light_icon)
        check('global Dark preference remains unchanged',b.chrome("return Services.prefs.getIntPref('layout.css.prefers-color-scheme.content-override');"),0)
        b.chrome('window.__zenSiteAppearanceToggle.stop();')
        check('stop releases the owned tab appearance override',b.chrome('return gBrowser.selectedBrowser.browsingContext.prefersColorSchemeOverride;'),'none')
        check('stop removes the runtime and widget',b.chrome("return !window.__zenSiteAppearanceToggle&&!document.getElementById('zen-colorscheme-toggle');"),True)
    result['status']='PASSED'
except Exception:
    result['status']='FAILED';result['error']=traceback.format_exc();print(result['error'],flush=True)
finally:
    server.shutdown();out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(out,flush=True)
if result['status']!='PASSED':raise SystemExit(1)
