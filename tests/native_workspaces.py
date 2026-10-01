"""Run only against a new disposable Zen profile, never an everyday profile.

Usage: python tests/native_workspaces.py --zen <path-to-zen>
The test uses only synthetic about:blank tabs and blocks external traffic.
"""
import argparse, hashlib, json, os, socket, subprocess, time
from pathlib import Path
import marionette

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--zen',required=True)
args=parser.parse_args()
profile=ROOT/'.backup-scratch'/('native-'+str(time.time_ns()))
profile.mkdir(parents=True)
marionette.PROFILE=profile;marionette.PORT=28797
source=(ROOT/'sine/JS/zen-colorscheme-toggle.uc.js').read_text(encoding='utf-8')
PREF='layout.css.prefers-color-scheme.content-override'
prefs={'marionette.enabled':True,'marionette.port':28797,'remote.allowSystemAccess':True,
 'zen.welcome-screen.seen':True,'browser.startup.page':0,'browser.startup.homepage':'about:blank',
 'browser.shell.checkDefaultBrowser':False,'browser.newtabpage.enabled':False,
 'app.update.disabledForTesting':True,'datareporting.policy.dataSubmissionEnabled':False,
 'network.proxy.type':1,'network.proxy.http':'127.0.0.1','network.proxy.http_port':9,
 'network.proxy.ssl':'127.0.0.1','network.proxy.ssl_port':9,
 'ui.systemUsesDarkTheme':0,'sine.auto-updates':False,'sine.engine.auto-update':False}
(profile/'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k,v in prefs.items()),encoding='utf-8')
result={'sourceSHA256':hashlib.sha256(source.encode()).hexdigest(),'checks':[]}
log=open(profile/'process.log','wb')
p=subprocess.Popen([args.zen,'-headless','-no-remote','-marionette','--remote-allow-system-access','-profile',str(profile)],env=dict(os.environ,MOZ_DISABLE_CONTENT_SANDBOX='1'),stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
c=None
def execute(js,*args): return c.execute(js,list(args))
def check(name,expected):
    state=execute('''return {pref:Services.prefs.getIntPref(arguments[0]),workspace:gZenWorkspaces.activeWorkspace,essential:gBrowser.selectedTab.hasAttribute('zen-essential'),tabSelects:window.__test.selections,workspaceEvents:window.__test.workspaceEvents};''',PREF)
    result['checks'].append({'name':name,'expectedPreference':expected,**state})
    print(name,state,flush=True)
    assert state['pref']==expected,(name,state)
def switch(key): execute('return gZenWorkspaces.changeWorkspaceWithID(window.__test[arguments[0]]).then(()=>true);',key)
def select(key): execute('gBrowser.selectedTab=window.__test[arguments[0]];',key)
def menu(value): execute("document.getElementById('zen-ws-item-'+arguments[0]).doCommand();",value)
def click(): execute("document.getElementById('zen-colorscheme-toggle').doCommand();")
try:
    for _ in range(60):
        time.sleep(.5)
        try:c=marionette.Client();break
        except (ConnectionRefusedError,socket.timeout):pass
    if not c:raise RuntimeError('Disposable browser unavailable')
    result['browser']={k:v for k,v in c.identity.items() if k!='profile'}
    execute('return gZenWorkspaces.promiseInitialized.then(()=>true);')
    execute('''window.__test={A:gZenWorkspaces.activeWorkspace,selections:0,workspaceEvents:0};let t=window.__test;let opt={triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()};t.regular=gBrowser.addTab('about:blank',opt);t.essential=gBrowser.addTab('about:blank',opt);gZenPinnedTabManager.addToEssentials(t.essential);gBrowser.selectedTab=t.essential;gBrowser.tabContainer.addEventListener('TabSelect',()=>t.selections++);window.addEventListener('ZenWorkspacesUIUpdate',()=>t.workspaceEvents++);return true;''')
    execute("return gZenWorkspaces.createAndSaveWorkspace('Appearance test B',undefined,true).then(w=>{window.__test.B=w.uuid;return true;});")
    # Visit both spaces and select the same Essential so native last-selected
    # tab restoration keeps it selected on subsequent workspace switches.
    switch('B');select('essential');switch('A');select('essential')
    execute("Services.prefs.setStringPref('mod.zensiteappearancetoggle.workspacemap',JSON.stringify({[window.__test.A]:2,[window.__test.B]:1}));")
    execute('''let sandbox=Cu.Sandbox(window,{sandboxPrototype:window,wantXrays:false});Cu.evalInSandbox(arguments[0],sandbox);return true;''',source)
    check('load with Essential selected and saved Dark default',0)
    before=execute('return window.__test.selections;')
    switch('B');check('real workspace switch with shared Essential',1)
    after=execute('return {selections:window.__test.selections,stillEssential:gBrowser.selectedTab===window.__test.essential};')
    result['essentialSwitch']={'beforeSelections':before,**after}
    assert after['stillEssential'] and before==after['selections'],result['essentialSwitch']
    switch('A');check('return to saved Dark workspace',0)
    for i in range(3):
        select('regular');check(f'ordinary selection {i}',0)
        select('essential');check(f'Essential selection {i}',0)
    menu('auto');check('set Auto from Essential',3)
    click();check('manual Dark override from Essential',0)
    select('regular');check('manual choice survives ordinary selection',0)
    switch('B');check('other workspace keeps saved Light',1)
    switch('A');check('return restores session Dark override',0)
    select('essential');menu('light');check('set persistent Light default from Essential',1)
    saved=execute("return JSON.parse(Services.prefs.getStringPref('mod.zensiteappearancetoggle.workspacemap'));")
    ids=execute('return {A:window.__test.A,B:window.__test.B};')
    assert saved[ids['A']]==1 and saved[ids['B']]==1
    # Open a second native browser window. The global widget provider must route
    # its toolbar and menu commands to the window that owns the clicked button.
    execute("window.__test.second=OpenBrowserWindow();return true;")
    for _ in range(60):
        ready=execute('return !!window.__test.second.gBrowserInit?.delayedStartupFinished;')
        if ready:break
        time.sleep(.25)
    assert ready,'Second window startup'
    # Execute the same source with the second window's globals in a fresh
    # system sandbox, mirroring a per-window script load without Sine.
    execute('''let win=window.__test.second;let sandbox=Cu.Sandbox(win,{sandboxPrototype:win,wantXrays:false});Cu.evalInSandbox(arguments[0],sandbox);return true;''',source)
    execute('return window.__test.second.gZenWorkspaces.changeWorkspaceWithID(window.__test.B).then(()=>true);')
    execute("window.__test.second.document.getElementById('zen-ws-item-auto').doCommand();")
    execute("window.__test.second.document.getElementById('zen-colorscheme-toggle').doCommand();")
    check('second-window toolbar selects Dark',0)
    execute('return window.__test.second.gZenWorkspaces.changeWorkspaceWithID(window.__test.A).then(()=>true);')
    check('second window restores A Light',1)
    execute('return window.__test.second.gZenWorkspaces.changeWorkspaceWithID(window.__test.B).then(()=>true);')
    check('second window remembers its B override',0)
    execute("window.__test.second.document.getElementById('zen-ws-item-light').doCommand();")
    check('second-window menu writes its workspace',1)
    saved=execute("return JSON.parse(Services.prefs.getStringPref('mod.zensiteappearancetoggle.workspacemap'));")
    assert saved[ids['A']]==1 and saved[ids['B']]==1
    execute('window.__test.second.close();')
    # Restart only the exact disposable profile created by this test. This
    # verifies persisted defaults with an Essential selected in a new session.
    execute('Services.prefs.savePrefFile(null);')
    c.command('Marionette:Quit',{'flags':['eAttemptQuit']});c.sock.close();c=None
    p.wait(timeout=15)
    p=subprocess.Popen([args.zen,'-headless','-no-remote','-marionette','--remote-allow-system-access','-profile',str(profile)],env=dict(os.environ,MOZ_DISABLE_CONTENT_SANDBOX='1'),stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    for _ in range(60):
        time.sleep(.5)
        try:c=marionette.Client();break
        except (ConnectionRefusedError,socket.timeout):pass
    if not c:raise RuntimeError('Disposable restart unavailable')
    execute('return gZenWorkspaces.promiseInitialized.then(()=>true);')
    execute('''window.__test={...arguments[0],selections:0,workspaceEvents:0};let opt={triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()};window.__test.essential=gBrowser.addTab('about:blank',opt);gZenPinnedTabManager.addToEssentials(window.__test.essential);gBrowser.selectedTab=window.__test.essential;''',ids)
    switch('A');select('essential')
    execute('''let sandbox=Cu.Sandbox(window,{sandboxPrototype:window,wantXrays:false});Cu.evalInSandbox(arguments[0],sandbox);return true;''',source)
    check('persisted Light default after native browser restart',1)
    result['passed']=len(result['checks'])
except Exception as e:result['error']=repr(e);raise
finally:
    if c:
        try:c.command('Marionette:Quit',{'flags':['eAttemptQuit']})
        except Exception:pass
        c.sock.close()
    try:p.wait(timeout=15)
    except subprocess.TimeoutExpired:p.terminate();p.wait(timeout=10)
    log.close()
    out=ROOT/'verification';out.mkdir(exist_ok=True)
    dest=out/('native-'+profile.name.removeprefix('native-')+'.json')
    dest.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print('Saved',dest,flush=True)
