"""Configure regressions against the real pinned Sine renderer and full CSS.

Stages current settings source in an owned offline profile, without writing any
generated product files. Does not load the toolbar/adapters or touch everyday Zen.
"""
import base64,hashlib,json,shutil,time,traceback
from native_support import Browser,ROOT

out=ROOT/'.backup-scratch/native-settings'/str(time.time_ns())
out.mkdir(parents=True,exist_ok=True)
result={'sineCommit':'fb0bd4ca6af888f10648e126947f7d1f82228433','checks':[],'geometry':[]}
source='(function(){"use strict";const SAT_SITE_RULES='+ (ROOT/'src/site-rules.json').read_text(encoding='utf-8')+';\n'+'\n'.join((ROOT/('src/'+p+'.js')).read_text(encoding='utf-8') for p in ['appearance-policy','appearance-browser','appearance-settings'])+'\n})();'

def check(name,actual,want=True):
    result['checks'].append({'name':name,'actual':actual,'expected':want,'passed':actual==want})
    print(name,actual,flush=True)
    assert actual==want,(name,actual,want)

def geometry(b,name):
    value=b.content('''const d=document.querySelector('.sineItemPreferenceDialog');const r=d.getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},width:r.width,height:r.height,clientWidth:d.clientWidth,scrollWidth:d.scrollWidth,clientHeight:d.clientHeight,scrollHeight:d.scrollHeight};''')
    value['name']=name;result['geometry'].append(value)
    b.select_content();shot=b.c.command('WebDriver:TakeScreenshot',{'full':False,'hash':False})
    (out/(name+'.png')).write_bytes(base64.b64decode(shot['value']))
    check(name+' avoids horizontal clipping',value['scrollWidth']<=value['clientWidth'])
    return value

try:
 with Browser() as b:
    result['identity']=b.c.identity
    result['settingsSourceSHA256']=hashlib.sha256((ROOT/'src/appearance-settings.js').read_bytes()).hexdigest()
    mod=json.loads((ROOT/'theme.json').read_text(encoding='utf-8'));mod.update(enabled=True,origin='external',supportsUnload=True)
    mod['scripts']={'sine/JS/appearance-settings.uc.js':mod['scripts']['sine/JS/appearance-settings.uc.js']}
    chrome=b.profile/'chrome';mods=chrome/'sine-mods';target=mods/mod['id'];target.mkdir(parents=True)
    for folder in ['sine','chrome']:shutil.copytree(ROOT/folder,target/folder)
    (target/'sine/JS/appearance-settings.uc.js').write_text(source,encoding='utf-8')
    shutil.copy2(ROOT/'preferences.json',target/'preferences.json')
    (mods/'mods.json').write_text(json.dumps({mod['id']:mod}),encoding='utf-8')
    manifest=chrome/'sat-test.manifest';manifest.write_text('content userscripts '+(ROOT/'.backup-scratch/sine-fixture/src').as_uri()+'/\ncontent sine '+mods.as_uri()+'/\n',encoding='utf-8')
    store={'version':1,'sites':{'domain:example.com':'dark'},'workspaceSites':{'A':{'domain:example.com':'light'}},'groups':{}}
    b.chrome('''let f=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);f.initWithPath(arguments[0]);Components.manager.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(f);
      Services.prefs.setBoolPref('sine.allow-unsafe-js',true);
      Services.prefs.setStringPref('mod.zensiteappearancetoggle.scope','workspace');
      Services.prefs.setStringPref('mod.zensiteappearancetoggle.state',arguments[1]);
      Services.prefs.setStringPref('mod.zensiteappearancetoggle.workspacemap','{"inactive":2}');
      window.__manager=ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs').default;return window.__manager.rebuildMods();''',str(manifest),json.dumps(store))
    b.navigate('about:preferences')
    b.chrome('''let w=gBrowser.selectedBrowser.contentWindow;let list=w.document.createXULElement('vbox');list.id='sineModsList';w.document.body.appendChild(list);
      const link=w.document.createElementNS('http://www.w3.org/1999/xhtml','link');link.rel='stylesheet';link.href='chrome://userscripts/content/styles/settings.css';w.document.head.append(link);return window.__manager.loadMods(w);''')
    b.chrome('return window.__manager.rebuildMods();');time.sleep(.3)
    check('Configure display does not migrate stored legacy scope',b.chrome("return Services.prefs.getStringPref('mod.zensiteappearancetoggle.scope');"),'workspace')
    check('legacy scope displays website within workspace',b.content("return document.getElementById('sat-scope').value;"),'workspace-site')
    check('scope has only two website remembering modes',b.content("return [...document.getElementById('sat-scope').options].map(o=>o.value);"),['workspace-site','site'])
    check('legacy workspace choices remain visible and inactive',b.content("return !!document.querySelector('[data-sat-scope=workspace] button')&&document.querySelector('[data-sat-scope=workspace]').textContent.includes('inactive');"))
    b.content("document.querySelector('[data-sat-scope=workspace] button').click();")
    check('removing legacy choice does not change website records',b.chrome("return JSON.parse(Services.prefs.getStringPref('mod.zensiteappearancetoggle.state')).sites['domain:example.com']==='dark'&&Services.prefs.getStringPref('mod.zensiteappearancetoggle.workspacemap')==='{}';"))
    b.content("document.querySelector('.sineItemConfigureButton').click();")
    # Missing Sine locale registration in the isolated manager-only page leaves
    # Close untranslated; give it its real English label for screenshot geometry.
    b.content("document.querySelector('.sineItemPreferenceDialogTopBar button').textContent='Close';")
    for w,h in [(1366,768),(1920,1080),(800,600),(520,650)]:
        b.context('chrome');b.c.command('WebDriver:SetWindowRect',{'width':w,'height':h});time.sleep(.35)
        m=geometry(b,f'configure-{w}x{h}')
        if w==1366:check('normal window closed Advanced fits two saved records',m['scrollHeight']<=m['clientHeight'])
    b.content("document.documentElement.dir='rtl';document.getElementById('sat-advanced-settings').open=true;")
    geometry(b,'configure-advanced-rtl-520x650')
    b.content("document.documentElement.dir='ltr';")
    check('all native icon options are preserved',b.content("return document.querySelectorAll('#sat-settings-panel menulist').length;"),5)
    check('native override rows folded',b.content("return document.querySelectorAll('#sat-icon-overrides menulist').length;"),3)
    b.context('chrome');b.c.command('WebDriver:SetWindowRect',{'width':1366,'height':768});time.sleep(.35)
    b.content("document.querySelector('.sineItemPreferenceDialog').scrollTop=10000;")
    geometry(b,'configure-advanced-bottom-1366x768')
    b.content("let e=document.querySelector('#mod-zensiteappearancetoggle-override-moon menulist');e.setAttribute('value','1');e.dispatchEvent(new Event('command',{bubbles:true}));")
    check('folded native dropdown retains actual Sine write handler',b.chrome("return Services.prefs.getIntPref('mod.zensiteappearancetoggle.override.moon');"),1)
    b.content("let input=document.querySelector('[data-sat-scope=site] select');input.value='light';input.dispatchEvent(new Event('change',{bubbles:true}));")
    check('shared saved-choice edit leaves workspace choice unchanged',b.chrome("let s=JSON.parse(Services.prefs.getStringPref('mod.zensiteappearancetoggle.state'));return s.sites['domain:example.com']==='light'&&s.workspaceSites.A['domain:example.com']==='light';"))
    b.content("let input=document.querySelector('[data-sat-scope=workspace-site] select');input.value='inherit';input.dispatchEvent(new Event('change',{bubbles:true}));")
    check('browser default removes only addressed workspace exception',b.chrome("let s=JSON.parse(Services.prefs.getStringPref('mod.zensiteappearancetoggle.state'));return !s.workspaceSites.A['domain:example.com']&&s.sites['domain:example.com']==='light';"))
    b.chrome("Services.prefs.setIntPref('layout.css.prefers-color-scheme.content-override',0);")
    check('external default changes still synchronize',b.content("return document.getElementById('sat-browser-default').value;"),'0')
    b.content("let e=document.getElementById('sat-browser-default');e.value='2';e.dispatchEvent(new Event('change',{bubbles:true}));")
    check('Configure changes the real native default',b.chrome("return Services.prefs.getIntPref('layout.css.prefers-color-scheme.content-override');"),2)
    # Exercise arrival after mounting using real renderer-generated native nodes.
    b.content("window.__satSettings.stop();window.__rows=[...document.querySelector('.sineItemPreferenceDialogContent').children];window.__rows.forEach(row=>row.remove());")
    b.content(source)
    b.content("const host=document.querySelector('.sineItemPreferenceDialogContent');window.__rows.forEach(row=>host.append(row));")
    time.sleep(.1)
    check('late native preference nodes are organized',b.content("return document.querySelectorAll('#sat-settings-panel menulist').length===5&&document.querySelectorAll('#sat-icon-overrides menulist').length===3;"))
    check('late native nodes retain identity',b.content("return window.__rows.filter(r=>r.id.includes('override')).every(r=>r.closest('#sat-icon-overrides'));"))
    b.content("window.__satSettings.stop();")
    check('cleanup restores exact native rows in original order',b.content("return [...document.querySelector('.sineItemPreferenceDialogContent').children].every((r,i)=>r===window.__rows[i])&&document.querySelector('.sineItemPreferenceDialogContent').children.length===window.__rows.length;"))
    check('cleanup removes owned panel and stylesheet',b.content("return !document.getElementById('sat-settings-panel')&&!document.getElementById('sat-settings-style');"))
    # Real native command handler must still write after restoration. Its
    # rebuildMods(false,false) refreshes styles but deliberately does not reload
    # JS; request an actual JS rebuild separately to verify recreation.
    b.content("let e=document.querySelector('#mod-zensiteappearancetoggle-override-moon menulist');e.setAttribute('value','2');e.dispatchEvent(new Event('command',{bubbles:true}));")
    time.sleep(.3)
    check('restored native dropdown retains actual Sine write handler',b.chrome("return Services.prefs.getIntPref('mod.zensiteappearancetoggle.override.moon');"),2)
    b.chrome('return window.__manager.rebuildMods();');time.sleep(.3)
    check('Sine rebuild recreates one panel and one owned stylesheet',b.content("return document.querySelectorAll('#sat-settings-panel').length===1&&document.querySelectorAll('#sat-settings-style').length===1;"))
except Exception as e:result['error']=repr(e);traceback.print_exc()
finally:
    (out/'native-settings.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(out/'native-settings.json',flush=True)
if result.get('error'):raise SystemExit(1)
