"""Guarded disposable browser support. Never connects to an unspecified profile."""
import json, os, socket, subprocess, time
from pathlib import Path
import marionette
ROOT=Path(__file__).resolve().parents[1]
class Browser:
    def __init__(self, network=False, profile=None):
        self.profile=profile or ROOT/'.backup-scratch'/('appearance-'+str(time.time_ns()))
        self.profile.mkdir(parents=True,exist_ok=True)
        with socket.socket() as s:s.bind(('127.0.0.1',0));self.port=s.getsockname()[1]
        prefs={'marionette.enabled':True,'marionette.port':self.port,'remote.allowSystemAccess':True,
        'zen.welcome-screen.seen':True,'browser.startup.page':0,'browser.startup.homepage':'about:blank',
        'browser.shell.checkDefaultBrowser':False,'browser.newtabpage.enabled':False,
        'app.update.disabledForTesting':True,'datareporting.policy.dataSubmissionEnabled':False,
        'ui.systemUsesDarkTheme':0,'sine.auto-updates':False,'sine.engine.auto-update':False}
        if not network:prefs.update({'network.proxy.type':1,'network.proxy.http':'127.0.0.1','network.proxy.http_port':9,'network.proxy.ssl':'127.0.0.1','network.proxy.ssl_port':9,'network.proxy.no_proxies_on':'localhost, 127.0.0.1'})
        (self.profile/'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k,v in prefs.items()),encoding='utf-8')
        self.log=open(self.profile/'process.log','ab');self.c=None
        self.p=subprocess.Popen([r'C:\Program Files\Zen Browser\zen.exe','-headless','-no-remote','-marionette','--remote-allow-system-access','-profile',str(self.profile)],env=dict(os.environ,MOZ_DISABLE_CONTENT_SANDBOX='1'),stdout=self.log,stderr=self.log,creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            marionette.PROFILE=self.profile;marionette.PORT=self.port
            for _ in range(80):
                time.sleep(.25)
                try:self.c=marionette.Client();break
                except (ConnectionRefusedError,socket.timeout):pass
            if not self.c:raise RuntimeError('Disposable Zen unavailable')
            self.chrome('return gZenWorkspaces.promiseInitialized.then(()=>true);')
        except: self.close();raise
    def context(self,name):self.c.command('Marionette:SetContext',{'value':name})
    def chrome(self,script,*args):self.context('chrome');return self.c.execute(script,list(args))
    def select_content(self):
        handle=self.chrome("return ChromeUtils.importESModule('chrome://remote/content/shared/NavigableManager.sys.mjs').NavigableManager.getIdForBrowser(gBrowser.selectedBrowser);")
        self.context('content');self.c.command('WebDriver:SwitchToWindow',{'handle':handle})
    def content(self,script,*args):self.select_content();return self.c.execute(script,list(args))
    def navigate(self,url):
        self.select_content();self.c.command('WebDriver:SetTimeouts',{'pageLoad':30000});return self.c.command('WebDriver:Navigate',{'url':url})
    def close(self):
        if self.c:
            try:self.c.command('Marionette:Quit',{'flags':['eAttemptQuit']})
            except Exception:pass
            self.c.sock.close()
        try:self.p.wait(timeout=15)
        except subprocess.TimeoutExpired:self.p.terminate();self.p.wait(timeout=10)
        self.log.close()
    def __enter__(self):return self
    def __exit__(self,*args):self.close()
