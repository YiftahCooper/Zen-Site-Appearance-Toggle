const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PREF = 'layout.css.prefers-color-scheme.content-override';
const MAP = 'mod.zensiteappearancetoggle.workspacemap';
const ID = 'zen-colorscheme-toggle';
const sources = [
  'sine/JS/zen-colorscheme-toggle.uc.js',
  'chrome/JS/moon-sparkle/zen-colorscheme-toggle-sparkle.uc.js',
  'chrome/JS/moon-sun/zen-colorscheme-toggle-sun.uc.js',
];

class Events {
  listeners = new Map();
  addEventListener(type, fn) { const a = this.listeners.get(type) || []; a.push(fn); this.listeners.set(type, a); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== fn)); }
  emit(type, detail = {}) { for (const fn of this.listeners.get(type) || []) fn({ type, target: this, ...detail }); }
}
class Element extends Events {
  attrs = new Map();
  constructor(doc) { super(); this.ownerDocument = doc; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  appendChild(e) { this.ownerDocument.elements.set(e.id, e); }
  querySelector() { return this.icon || (this.icon = new Element(this.ownerDocument)); }
}

function environment(source, options = {}) {
  const shared = options.shared || { prefs: new Map(), windows: new Set(), widget: null, writes: [] };
  if (!shared.prefs.has(PREF)) shared.prefs.set(PREF, options.pref ?? 3);
  if (options.defaults) shared.prefs.set(MAP, JSON.stringify(options.defaults));
  const win = new Events();
  win.closed = false;
  const doc = { readyState: 'complete', defaultView: win, elements: new Map(),
    getElementById(id) { return this.elements.get(id) || null; },
    createXULElement() { return new Element(this); } };
  win.document = doc;
  doc.elements.set('toolbar-context-menu', new Element(doc));
  const tabContainer = new Events();
  let tabWorkspace = options.essential ? null : (options.workspace ?? 'A');
  win.gBrowser = { tabContainer, selectedTab: { getAttribute: () => tabWorkspace } };
  let ready;
  const workspaceListeners = new Set();
  if (!options.noZen) win.gZenWorkspaces = { activeWorkspace: options.workspace ?? 'A', promiseInitialized: new Promise(r => { ready = r; }),
    addChangeListeners: fn => workspaceListeners.add(fn), removeChangeListeners: fn => workspaceListeners.delete(fn) };
  win.setTimeout = fn => { fn(); return 1; };
  win.matchMedia = () => ({ matches: options.systemDark ?? false });
  shared.windows.add(win);
  const prefs = {
    getIntPref: (k, d) => shared.prefs.get(k) ?? d,
    getStringPref: (k, d) => shared.prefs.get(k) ?? d,
    setIntPref(k, v) { shared.prefs.set(k, v); shared.writes.push([k, v]); },
    setStringPref(k, v) { shared.prefs.set(k, v); },
    addObserver() {}, removeObserver() {},
  };
  const CUI = { windows: shared.windows, AREA_NAVBAR: 'navbar',
    createWidget(config) {
      if (shared.widget) throw new Error('Widget already exists');
      shared.widget = config;
      config.source = 'api';
      for (const w of shared.windows) createButton(w);
      return config;
    },
    getWidget() { return shared.widget; },
  };
  function createButton(w) {
    if (w.document.getElementById(ID)) return;
    const btn = new Element(w.document); btn.id = ID;
    w.document.elements.set(ID, btn);
    shared.widget?.onCreated?.(btn);
  }
  const UC_API = { Utils: { createWidget(config) {
    if (shared.widget) throw new Error('Widget already exists');
    return CUI.createWidget(config);
  } },
    Runtime: { startupFinished: () => Promise.resolve() },
    Windows: { forEach: fn => { for (const w of shared.windows) fn(w.document); } } };
  win.UC_API = UC_API;
  if (shared.widget) createButton(win);
  const context = vm.createContext({ window: win, document: doc, gBrowser: win.gBrowser,
    ...(win.gZenWorkspaces ? { gZenWorkspaces: win.gZenWorkspaces } : {}),
    Services: { prefs }, CustomizableUI: CUI, UC_API, setTimeout: win.setTimeout, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', source), 'utf8'), context);
  return { shared, win, doc, ready,
    select(essential) { tabWorkspace = essential ? null : win.gZenWorkspaces?.activeWorkspace; tabContainer.emit('TabSelect'); },
    switchTo(id) { win.gZenWorkspaces.activeWorkspace = id; for (const fn of workspaceListeners) fn({workspace:{uuid:id}}); },
    click() { const btn = doc.getElementById(ID); const event = { target: btn, currentTarget: btn, view: win };
      if (shared.widget.onCommand) shared.widget.onCommand(event); else shared.widget.callback(event, event.target.ownerGlobal); },
    menu(value) { doc.getElementById('zen-ws-item-' + value).emit('command'); },
    pref: () => shared.prefs.get(PREF),
  };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

for (const source of sources) {
  test(`${source}: selecting Essentials preserves the session override`, async () => {
    const e = environment(source); await flush(); e.click(); assert.equal(e.pref(), 0);
    const count = e.shared.writes.length;
    for (let i = 0; i < 3; i++) { e.select(true); assert.equal(e.pref(), 0); e.select(false); assert.equal(e.pref(), 0); }
    assert.equal(e.shared.writes.length, count, 'same-workspace selection must not rewrite the global preference');
  });
  test(`${source}: workspace changes apply defaults with an Essential selected`, async () => {
    const e = environment(source, { essential: true, defaults: { A: 2, B: 1 } }); await flush();
    assert.equal(e.pref(), 0); e.switchTo('B'); assert.equal(e.pref(), 1); e.switchTo('A'); assert.equal(e.pref(), 0);
  });
  test(`${source}: manual override from Essentials belongs to the active workspace`, async () => {
    const e = environment(source, { essential: true }); await flush(); e.click(); assert.equal(e.pref(), 0);
    e.select(false); assert.equal(e.pref(), 0); e.switchTo('B'); assert.equal(e.pref(), 3); e.switchTo('A'); assert.equal(e.pref(), 0);
  });
  test(`${source}: context-menu defaults from Essentials persist for the workspace`, async () => {
    const e = environment(source, { essential: true }); await flush(); e.menu('dark');
    assert.equal(JSON.parse(e.shared.prefs.get(MAP)).A, 2); e.switchTo('B'); assert.equal(e.pref(), 3); e.switchTo('A'); assert.equal(e.pref(), 0);
    const restart = environment(source, { essential: true, defaults: JSON.parse(e.shared.prefs.get(MAP)) }); await flush(); assert.equal(restart.pref(), 0);
  });
  test(`${source}: unknown startup workspace preserves the preference until initialized`, async () => {
    const e = environment(source, { workspace: '', essential: true, pref: 1, defaults: { A: 2 } }); await flush();
    assert.equal(e.pref(), 1); e.win.gZenWorkspaces.activeWorkspace = 'A'; e.ready(); await flush(); assert.equal(e.pref(), 0);
  });
  test(`${source}: Firefox retains its global appearance and manual toggle`, async () => {
    const e = environment(source, { noZen: true, pref: 0 }); await flush(); assert.equal(e.pref(), 0); e.click(); assert.equal(e.pref(), 3); e.click(); assert.equal(e.pref(), 0);
  });
  test(`${source}: dark-system two-state toggle remains Light then Auto`, async () => {
    const e = environment(source, { systemDark: true }); await flush(); e.click(); assert.equal(e.pref(), 1); e.select(true); assert.equal(e.pref(), 1); e.click(); assert.equal(e.pref(), 3);
  });
  test(`${source}: shared widget commands use the clicked window's workspace`, async () => {
    const a = environment(source); await flush();
    const b = environment(source, { shared: a.shared, workspace: 'B', essential: true }); await flush(); b.click(); assert.equal(b.pref(), 0);
    b.switchTo('C'); assert.equal(b.pref(), 3); b.switchTo('B'); assert.equal(b.pref(), 0);
    a.switchTo('D'); a.switchTo('A'); assert.equal(a.pref(), 3, 'window B must not put its override into window A');
    b.menu('light'); assert.equal(JSON.parse(b.shared.prefs.get(MAP)).B, 1);
  });
}
