/* Runs in about:preferences, without browser-window globals. */
(function settings(){
  window.__satSettings?.stop();
  const doc=window.document,html='http://www.w3.org/1999/xhtml';
  const {PrivateBrowsingUtils}=ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs');
  const privateWindow=PrivateBrowsingUtils.isContentWindowPrivate(window);
  let panel=null,refreshPanel=()=>{},stopped=false,icons=null,overrides=null,message=null;
  const nativeRows=new Map(),pendingUndo=new Set();
  const el=(tag,text)=>{const e=doc.createElementNS(html,tag);if(text)e.textContent=text;return e;};
  const style=el('style');style.id='sat-settings-style';
  style.textContent=`
    [mod-id="zen-site-appearance-toggle"] .sineItemPreferenceDialog {
      width:min(720px,calc(100vw - 32px))!important;min-width:0!important;
      max-width:calc(100vw - 32px)!important;max-height:calc(100vh - 32px)!important;
      overflow-y:auto;padding:18px!important;
    }
    [mod-id="zen-site-appearance-toggle"] .sineItemPreferenceDialogContent {width:100%;min-width:0;max-width:none;}
    [mod-id="zen-site-appearance-toggle"] .sineItemPreferenceDialogContent>* {width:auto;padding:0;box-sizing:border-box;}
    [mod-id="zen-site-appearance-toggle"] .sineItemPreferenceLabel {white-space:normal;overflow-wrap:anywhere;min-width:0;}
    [mod-id="zen-site-appearance-toggle"] .sineItemPreferenceDialogContent hbox {min-width:0;gap:10px;}
    [mod-id="zen-site-appearance-toggle"] .sineItemPreferenceDialogContent menulist {flex:0 0 auto;min-width:170px;max-width:52%;margin-inline:0;}
    #sat-settings-panel {display:grid;gap:10px;padding:0;font-size:14px;line-height:1.45;}
    #sat-settings-panel h3 {font-size:15px;margin:0 0 8px;}
    #sat-settings-panel p {margin:6px 0 0;}
    #sat-settings-panel .sat-section {display:block;margin:0;padding-bottom:10px;border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent);}
    #sat-settings-panel .sat-choice {display:grid;grid-template-columns:minmax(0,1fr) 210px;align-items:center;gap:12px;}
    #sat-settings-panel select,#sat-settings-panel input {box-sizing:border-box;min-width:0;width:100%;margin:0;padding:6px 10px;}
    #sat-settings-panel details {border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:6px;padding:10px 12px;}
    #sat-settings-panel summary {font-weight:600;cursor:pointer;}
    #sat-settings-panel details[open]>summary {margin-bottom:10px;}
    #sat-settings-panel .sat-record {display:grid;grid-template-columns:minmax(0,1fr) 180px;align-items:center;gap:10px;padding:5px 0;}
    #sat-settings-panel .sat-record-label {overflow-wrap:anywhere;}
    #sat-settings-panel .sat-muted {opacity:.75;font-size:13px;}
    #sat-settings-panel hbox {margin:0 0 7px;}
    #sat-settings-panel button {margin-inline:0;}
    #sat-settings-message:empty {display:none;}
    @media(max-width:600px) {
      #sat-settings-panel .sat-choice,#sat-settings-panel .sat-record {grid-template-columns:1fr;gap:4px;}
      [mod-id="zen-site-appearance-toggle"] .sineItemPreferenceDialogContent hbox {flex-wrap:wrap;}
      [mod-id="zen-site-appearance-toggle"] .sineItemPreferenceDialogContent menulist {max-width:100%;}
    }
  `;
  doc.head.appendChild(style);
  function workspaceLabel(id){
    try{return Services.wm?.getMostRecentWindow('navigator:browser')?.gZenWorkspaces?.getWorkspaceFromId(id)?.name||'Saved workspace ('+id+')';}
    catch{return 'Saved workspace ('+id+')';}
  }
  function guard(action){return (...args)=>{if(stopped||privateWindow)return;try{action(...args)?.catch?.(e=>{if(!stopped)message.textContent=e.message;});}catch(e){message.textContent=e.message;}};}
  function setupRuntime(){
    for(const browser of Services.wm?.getEnumerator('navigator:browser')||[]){
      if(PrivateBrowsingUtils.isWindowPrivate(browser))continue;
      const setup=browser.__zenSiteAppearanceToggle?.siteSetup;
      if(typeof setup?.records==='function'&&typeof setup?.undo==='function')return setup;
    }
    return null;
  }
  function organiseNative(){
    if(!panel?.isConnected)return;
    const host=panel.parentElement;
    for(const row of [...host.children]){
      if(row===panel||nativeRows.has(row))continue;
      const controls=[...row.querySelectorAll('menulist,checkbox,input,select,button')];
      nativeRows.set(row,{host,hidden:row.hidden,controls:controls.map(control=>({control,disabled:control.disabled,attribute:control.getAttribute('disabled')}))});
      const basic=['mod-zensiteappearancetoggle-iconset','mod-zensiteappearancetoggle-lighticon'].includes(row.id);
      if(basic)icons.appendChild(row);
      else if(controls.length)overrides.appendChild(row);
      else row.hidden=true;
      if(privateWindow){
        for(const control of controls){control.disabled=true;control.setAttribute('disabled','true');}
        row.addEventListener('click',blockPrivate,true);row.addEventListener('command',blockPrivate,true);
      }
    }
  }
  function blockPrivate(event){event.preventDefault();event.stopImmediatePropagation();}
  function mount(){
    if(stopped)return;
    if(panel?.isConnected){organiseNative();return;}
    const host=doc.querySelector('[mod-id="zen-site-appearance-toggle"] .sineItemPreferenceDialogContent');if(!host)return;
    panel=el('section');panel.id='sat-settings-panel';
    const section=(title,id)=>{const s=el('section');s.className='sat-section';if(id)s.id=id;s.appendChild(el('h3',title));panel.appendChild(s);return s;};
    function select(parent,id,label,options){
      const row=el('label',label),input=el('select');row.className='sat-choice';input.id=id;
      for(const [value,text]of options){const o=el('option',text);o.value=value;input.appendChild(o);}
      row.appendChild(input);parent.appendChild(row);return input;
    }
    const defaultSection=section('Browser default');
    const defaults=select(defaultSection,'sat-browser-default','Appearance without a saved choice',[[2,'System'],[1,'Light'],[0,'Dark']]);
    defaultSection.appendChild(el('p','System follows your device. Website setup makes supported websites follow this appearance automatically.'));
    const remember=section('Remember website choices');
    const hasWorkspaces=Services.appinfo?.name?.toLowerCase().includes('zen');
    const scope=select(remember,'sat-scope','Save toolbar choices',hasWorkspaces?[['workspace-site','Within each workspace'],['site','Share across workspaces']]:[['site','This website']]);
    remember.appendChild(el('p','The toolbar automatically saves Light or Dark for the website. Right-click for System (follow your device) or Use browser default (remove the saved exception).'));
    const savedSection=section('Saved appearance choices'),saved=el('div');saved.id='sat-saved-choices';savedSection.appendChild(saved);
    icons=section('Toolbar icons','sat-toolbar-icons');
    icons.appendChild(el('p','Sun or Sparkle = Light · Moon = Dark. System follows your device; Use browser default follows the default chosen above.'));
    const advanced=el('details');advanced.id='sat-advanced-settings';advanced.appendChild(el('summary','Advanced: site grouping and icon overrides'));panel.appendChild(advanced);
    advanced.appendChild(el('h3','Site grouping'));
    advanced.appendChild(el('p','Grouping uses domain names and bundled host aliases; it does not learn from browsing. Add an exact hostname rule to join a known group or keep it separate. Rules apply across workspaces.'));
    const row=el('label','Exact hostname'),hostname=el('input');row.className='sat-choice';hostname.id='sat-group-host';hostname.type='text';hostname.placeholder='shop.example.com';row.appendChild(hostname);advanced.appendChild(row);
    const groups=select(advanced,'sat-group-target','Group',[['automatic','Automatic'],['independent','Keep hostname separate']]);
    const preview=el('p');preview.id='sat-group-preview';advanced.appendChild(preview);
    const button=el('button','Apply grouping');button.type='button';button.id='sat-group-apply';advanced.appendChild(button);
    const existing=el('ul');existing.id='sat-saved-groups';advanced.appendChild(existing);
    overrides=el('section');overrides.className='sat-section';overrides.id='sat-icon-overrides';overrides.appendChild(el('h3','Individual icon overrides'));advanced.appendChild(overrides);
    const websiteSetup=el('details');websiteSetup.id='sat-website-setup';websiteSetup.appendChild(el('summary','Website setup'));
    const setupRecords=el('div');websiteSetup.appendChild(setupRecords);advanced.appendChild(websiteSetup);
    message=el('p');message.id='sat-settings-message';message.setAttribute('role','status');panel.appendChild(message);
    const label=v=>({dark:'Dark',light:'Light',system:'System',inherit:'the browser default'})[v||'inherit'];
    function previewChoice(){
      try{
        if(!hostname.value.trim()){preview.textContent='Enter a hostname to preview its group and saved appearance.';return;}
        const s=satRead(),target=groups.value==='automatic'?null:groups.value==='independent'?'host:'+new URL('https://'+hostname.value.trim()).hostname:groups.value;
        const next=AppearancePolicy.setGrouping(s,hostname.value.trim(),target);
        const site=AppearancePolicy.recogniseSite('https://'+hostname.value.trim(),{baseDomain:h=>Services.eTLD.getBaseDomainFromHost(h),userRules:next.groups});
        const detail=scope.value==='site'?'Shared choice: '+label(s.sites[site.key])+'.':
          Object.entries(s.workspaceSites).filter(([,choices])=>choices[site.key]).map(([id,choices])=>workspaceLabel(id)+': '+label(choices[site.key])).join('; ')||'No workspace has a saved choice; the browser default applies.';
        preview.textContent=`Group: ${site.label}. ${detail} Earlier choices are retained. Non-default ports keep separate choices.`;
      }catch(e){message.textContent=e.message;}
    }
    function record(context,title,value,inactive=false){
      const row=el('div');row.className='sat-record';row.dataset.satScope=context.scope;
      if(context.siteKey)row.dataset.satSite=context.siteKey;if(context.workspaceId)row.dataset.satWorkspace=context.workspaceId;
      const text=el('span',title);text.className='sat-record-label';row.appendChild(text);
      if(inactive){
        const remove=el('button','Remove legacy choice');remove.type='button';remove.disabled=privateWindow;
        remove.addEventListener('click',guard(()=>{satWrite(AppearancePolicy.setChoice(satRead(),context,'inherit'));}));row.appendChild(remove);
      }else{
        const input=el('select');input.setAttribute('aria-label',title+' appearance');input.disabled=privateWindow;
        for(const [key,text]of [['inherit','Use browser default'],['light','Light'],['dark','Dark'],['system','System']]){const o=el('option',text);o.value=key;input.appendChild(o);}
        input.value=value;input.addEventListener('change',guard(()=>satWrite(AppearancePolicy.setChoice(satRead(),context,input.value))));row.appendChild(input);
      }
      saved.appendChild(row);
    }
    refreshPanel=()=>{
      if(!panel?.isConnected||stopped)return;
      const nativeDefault=Services.prefs.getIntPref(SAT_PREF,2);
      defaults.value=String(nativeDefault===0||nativeDefault===1?nativeDefault:2);
      const nativeScope=Services.prefs.getStringPref(SAT_PREFIX+'scope','workspace-site');
      scope.value=hasWorkspaces&&nativeScope!=='site'?'workspace-site':'site';
      try{
        const s=satRead(),selected=groups.value;
        const keys=new Set([...Object.keys(s.sites),...Object.values(s.groups),...Object.values(s.workspaceSites).flatMap(Object.keys)]);
        while(groups.options.length>2)groups.remove(2);
        for(const key of [...keys].sort()){const o=el('option',key.replace(/^[^:]+:/,''));o.value=key;groups.appendChild(o);}
        groups.value=[...groups.options].some(o=>o.value===selected)?selected:'automatic';
        existing.replaceChildren();
        for(const [host,key]of Object.entries(s.groups)){const li=el('li'),edit=el('button',host+' → '+key.replace(/^[^:]+:/,''));edit.type='button';edit.disabled=privateWindow;edit.addEventListener('click',()=>{hostname.value=host;groups.value=key;previewChoice();hostname.focus();});li.appendChild(edit);existing.appendChild(li);}
        saved.replaceChildren();
        for(const [siteKey,value]of Object.entries(s.sites))record({scope:'site',siteKey},siteKey.replace(/^[^:]+:/,'')+' · Shared across workspaces'+(scope.value==='site'?'':' (inactive in this mode)'),value);
        for(const [workspaceId,choices]of Object.entries(s.workspaceSites))for(const [siteKey,value]of Object.entries(choices))record({scope:'workspace-site',workspaceId,siteKey},workspaceLabel(workspaceId)+' · '+siteKey.replace(/^[^:]+:/,'')+(scope.value==='workspace-site'?'':' (inactive in this mode)'),value);
        for(const [workspaceId,value]of Object.entries(s.workspaces))record({scope:'workspace',workspaceId},workspaceLabel(workspaceId)+' · '+label(value)+' · Legacy whole-workspace choice (inactive)',value,true);
        if(!saved.childElementCount){const empty=el('p','No saved choices. Toggle the toolbar on a website to remember its appearance.');empty.className='sat-muted';saved.appendChild(empty);}
        setupRecords.replaceChildren();
        const runtime=setupRuntime();
        if(!runtime)setupRecords.appendChild(el('p','Reopen a normal browser window to view and undo website setup.'));
        else{
          setupRecords.appendChild(el('p','Undo restores the website theme preference that automatic setup changed. Saved toolbar choices stay intact.'));
          const records=runtime.records();
          if(!records.length)setupRecords.appendChild(el('p','No website settings have been changed by this mod.'));
          for(const item of records){
            const row=el('div');row.className='sat-record';const text=el('span',item.label);text.className='sat-record-label';row.appendChild(text);
            const undo=el('button','Undo website setup');undo.type='button';undo.disabled=privateWindow||pendingUndo.has(item.id);
            undo.addEventListener('click',guard(async()=>{
              if(pendingUndo.has(item.id))return;pendingUndo.add(item.id);undo.disabled=true;
              try{await runtime.undo(item.id);if(!stopped)message.textContent='Website setup undone.';}
              finally{pendingUndo.delete(item.id);if(!stopped)refreshPanel();}
            }));row.appendChild(undo);setupRecords.appendChild(row);
          }
        }
        previewChoice();
      }catch(e){message.textContent=e.message;}
    };
    defaults.addEventListener('change',guard(()=>Services.prefs.setIntPref(SAT_PREF,Number(defaults.value))));
    scope.addEventListener('change',guard(()=>Services.prefs.setStringPref(SAT_PREFIX+'scope',scope.value)));
    groups.addEventListener('change',previewChoice);hostname.addEventListener('input',previewChoice);
    button.addEventListener('click',guard(()=>{
      const current=satRead();let target=groups.value==='automatic'?null:groups.value;
      if(target==='independent')target='host:'+new URL('https://'+hostname.value.trim()).hostname;
      satWrite(AppearancePolicy.setGrouping(current,hostname.value.trim(),target));message.textContent='Grouping saved. Existing appearance choices have been retained.';
    }));
    host.prepend(panel);refreshPanel();organiseNative();
    if(privateWindow){
      for(const control of panel.querySelectorAll('input,select,button'))control.disabled=true;
      message.textContent='Change saved configuration from a normal window. Toolbar choices in private windows are temporary.';
    }
  }
  const observer=new MutationObserver(mount);observer.observe(doc.documentElement,{childList:true,subtree:true});
  const update=()=>refreshPanel();Services.prefs.addObserver(SAT_PREFIX,update);Services.prefs.addObserver(SAT_PREF,update);
  const api={stop(){
    if(stopped)return;stopped=true;observer.disconnect();
    Services.prefs.removeObserver(SAT_PREFIX,update);Services.prefs.removeObserver(SAT_PREF,update);window.removeEventListener('unload',api.stop);
    for(const [row,snapshot]of nativeRows){
      row.removeEventListener('click',blockPrivate,true);row.removeEventListener('command',blockPrivate,true);
      for(const {control,disabled,attribute}of snapshot.controls){control.disabled=disabled;if(attribute===null)control.removeAttribute('disabled');else control.setAttribute('disabled',attribute);}
      if(row.isConnected&&snapshot.host.isConnected){row.hidden=snapshot.hidden;snapshot.host.appendChild(row);}
    }
    nativeRows.clear();panel?.remove();style.remove();if(window.__satSettings===api)delete window.__satSettings;
  }};
  window.__satSettings=api;window.addEventListener('unload',api.stop,{once:true});window.addUnloadListener?.(api.stop);mount();
})();
