"""Exercise the pinned Sine manager in an owned, offline disposable profile.

Uses actual rebuild/unload and Configure rendering APIs, without running Sine's
installer, updater, marketplace or modifying the Zen installation.
"""
import json,time,shutil,hashlib,traceback
from native_support import Browser,ROOT
result={'sineCommit':'fb0bd4ca6af888f10648e126947f7d1f82228433','checks':[]}
receipts=ROOT/'.backup-scratch/native-contracts';receipts.mkdir(parents=True,exist_ok=True)
out=receipts/('native-sine-'+str(time.time_ns())+'.json')
def check(name,actual,want):
 result['checks'].append(dict(name=name,actual=actual,expected=want,passed=actual==want))
 print(name,actual,flush=True);assert actual==want,(name,actual,want)
try:
 with Browser() as b:
  result['identity']=b.c.identity
  mod=json.loads((ROOT/'theme.json').read_text());mod.update(enabled=True,origin='external',supportsUnload=True)
  chrome=b.profile/'chrome';mods=chrome/'sine-mods';target=mods/mod['id'];target.mkdir(parents=True)
  for folder in ['sine','chrome']:shutil.copytree(ROOT/folder,target/folder)
  shutil.copy2(ROOT/'preferences.json',target/'preferences.json')
  result['sourceSHA256']=hashlib.sha256((target/'sine/JS/zen-colorscheme-toggle.uc.js').read_bytes()).hexdigest()
  result['settingsSHA256']=hashlib.sha256((target/'sine/JS/appearance-settings.uc.js').read_bytes()).hexdigest()
  (mods/'mods.json').write_text(json.dumps({mod['id']:mod}),encoding='utf-8')
  manifest=chrome/'sat-test.manifest'
  manifest.write_text('content userscripts '+(ROOT/'.backup-scratch/sine-fixture/src').as_uri()+'/\ncontent sine '+mods.as_uri()+'/\n',encoding='utf-8')
  b.chrome('''let f=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);f.initWithPath(arguments[0]);Components.manager.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(f);
    Services.prefs.setBoolPref('sine.allow-unsafe-js',true);Services.prefs.setIntPref('layout.css.prefers-color-scheme.content-override',1);
    Services.prefs.setStringPref('mod.zensiteappearancetoggle.workspacemap',JSON.stringify({[gZenWorkspaces.activeWorkspace]:2}));
    window.__legacyBefore=Services.prefs.getStringPref('mod.zensiteappearancetoggle.workspacemap');
    window.__manager=ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs').default;
    return window.__manager.rebuildMods();''',str(manifest));time.sleep(.3)
  check('actual Sine loader creates toolbar',b.chrome('return !!window.__zenSiteAppearanceToggle;'),True)
  check('Sine leaves about blank inherited despite retained legacy workspace Dark',b.chrome('return gBrowser.selectedBrowser.browsingContext.prefersColorSchemeOverride;'),'none')
  check('loading old saved choices does not rewrite them',b.chrome("return Services.prefs.getStringPref('mod.zensiteappearancetoggle.workspacemap')===window.__legacyBefore;"),True)
  b.navigate('about:preferences')
  b.chrome('''let w=gBrowser.selectedBrowser.contentWindow;let list=w.document.createXULElement('vbox');list.id='sineModsList';w.document.body.appendChild(list);return window.__manager.loadMods(w);''')
  b.chrome('return window.__manager.rebuildMods();');time.sleep(.3)
  check('actual Sine Configure renderer receives SAT controls',b.content("return !!document.querySelector('[mod-id=zen-site-appearance-toggle] .sineItemPreferenceDialogContent #sat-browser-default');"),True)
  b.content("document.querySelector('.sineItemConfigureButton').click();")
  check('Sine Configure dialog opens',b.content("return document.querySelector('.sineItemPreferenceDialog').open;"),True)
  b.content("let e=document.getElementById('sat-browser-default');e.value='0';e.dispatchEvent(new Event('change',{bubbles:true}));")
  check('Configure writes native preference through actual loader',b.chrome("return Services.prefs.getIntPref('layout.css.prefers-color-scheme.content-override');"),0)
  b.chrome('return window.__manager.rebuildMods();');time.sleep(.3)
  check('Sine rebuild keeps one settings panel',b.content("return document.querySelectorAll('#sat-settings-panel').length;"),1)
  check('Sine rebuild keeps one toolbar widget',b.chrome("return document.querySelectorAll('#zen-colorscheme-toggle').length;"),1)
  b.chrome("return IOUtils.readJSON(arguments[0]).then(mods=>window.__manager.toggleTheme(mods,'zen-site-appearance-toggle'));",str(mods/'mods.json'));time.sleep(.5)
  check('Sine disable removes toolbar and controller',b.chrome("return !window.__zenSiteAppearanceToggle&&!document.getElementById('zen-colorscheme-toggle');"),True)
  check('Sine disable removes settings panel',b.content("return document.querySelectorAll('#sat-settings-panel').length;"),0)
  check('Sine disable releases owned override',b.chrome('return gBrowser.selectedBrowser.browsingContext.prefersColorSchemeOverride;'),'none')
  check('Sine disable preserves browser default',b.chrome("return Services.prefs.getIntPref('layout.css.prefers-color-scheme.content-override');"),0)
  b.chrome("return IOUtils.readJSON(arguments[0]).then(mods=>window.__manager.toggleTheme(mods,'zen-site-appearance-toggle'));",str(mods/'mods.json'));time.sleep(.5)
  check('Sine reenable restores controller while nonwebsite preferences page stays inherited',b.chrome("return !!window.__zenSiteAppearanceToggle&&gBrowser.selectedBrowser.browsingContext.prefersColorSchemeOverride==='none';"),True)
  check('Sine reenable retains original legacy workspace map',b.chrome("return Services.prefs.getStringPref('mod.zensiteappearancetoggle.workspacemap')===window.__legacyBefore;"),True)
  check('Sine reenable restores one settings panel',b.content("return document.querySelectorAll('#sat-settings-panel').length;"),1)
  b.content("document.querySelector('.sineItemPreferenceDialog').close();document.querySelector('.sineItemConfigureButton').click();")
  check('Configure reopens with the saved native default',b.content("return document.querySelector('.sineItemPreferenceDialog').open&&document.getElementById('sat-browser-default').value==='0';"),True)
except Exception as e:result['error']=repr(e);traceback.print_exc()
finally:
 result['sourceFileUnchangedAtEnd']=hashlib.sha256((ROOT/'sine/JS/zen-colorscheme-toggle.uc.js').read_bytes()).hexdigest()==result.get('sourceSHA256')
 result['settingsFileUnchangedAtEnd']=hashlib.sha256((ROOT/'sine/JS/appearance-settings.uc.js').read_bytes()).hexdigest()==result.get('settingsSHA256')
 out.write_text(json.dumps(result,indent=2),encoding='utf-8');print(out,flush=True)
if result.get('error'):raise SystemExit(1)
