/* Runs in about:preferences, without browser-window globals. */
(function settings(){
  window.__satSettings?.stop();
  const doc=window.document,html='http://www.w3.org/1999/xhtml';let panel=null,refreshPanel=()=>{},stopped=false;
  const el=(tag,text)=>{const e=doc.createElementNS(html,tag);if(text)e.textContent=text;return e;};
  function mount(){
    if(stopped||panel?.isConnected)return;
    const host=doc.querySelector('[mod-id="zen-site-appearance-toggle"] .sineItemPreferenceDialogContent');if(!host)return;
    panel=el('section');panel.id='sat-settings-panel';panel.style.cssText='display:grid;gap:10px;padding:12px 0';
    panel.appendChild(el('h3','Remember website appearance'));
    function select(id,label,options){
      const row=el('label',label+' '),input=el('select');input.id=id;
      for(const [value,text]of options){const o=el('option',text);o.value=value;input.appendChild(o);}
      row.appendChild(input);panel.appendChild(row);return input;
    }
    const defaults=select('sat-browser-default','Browser default',[[2,'System'],[1,'Light'],[0,'Dark']]);
    const hasWorkspaces=Services.appinfo?.name?.toLowerCase().includes('zen');
    const scope=select('sat-scope','Remember choices',hasWorkspaces?[['workspace','Per workspace'],['site','Per site'],['workspace-site','Per site within each workspace']]:[['site','Per site']]);
    panel.appendChild(el('p','The toolbar saves your choice for this scope. Use browser default removes an exception. Websites with their own explicit theme settings may need to be set to follow the device.'));
    panel.appendChild(el('h3','Site grouping'));
    const row=el('label','Exact hostname '),hostname=el('input');hostname.id='sat-group-host';hostname.type='text';hostname.placeholder='shop.example.com';row.appendChild(hostname);panel.appendChild(row);
    const groups=select('sat-group-target','Group',[['automatic','Automatic'],['independent','Keep this hostname separate']]);
    const preview=el('p');preview.id='sat-group-preview';panel.appendChild(preview);
    const button=el('button','Apply grouping');button.type='button';button.id='sat-group-apply';panel.appendChild(button);
    const existing=el('ul');existing.id='sat-saved-groups';panel.appendChild(existing);
    const message=el('p');message.id='sat-settings-message';message.setAttribute('role','status');panel.appendChild(message);
    function previewChoice(){
      try{
        if(!hostname.value.trim()){preview.textContent='Enter a hostname to preview its group and remembered appearance.';return;}
        const s=satRead(),target=groups.value==='automatic'?null:groups.value==='independent'?'host:'+new URL('https://'+hostname.value.trim()).hostname:groups.value;
        const next=AppearancePolicy.setGrouping(s,hostname.value.trim(),target);
        const site=AppearancePolicy.recogniseSite('https://'+hostname.value.trim(),{baseDomain:h=>Services.eTLD.getBaseDomainFromHost(h),userRules:next.groups});
        const label=v=>({dark:'Dark',light:'Light',system:'System',inherit:'the browser default'})[v||'inherit'];
        let detail;
        if(scope.value==='workspace')detail='Per workspace is selected, so grouping does not change the workspace appearance.';
        else if(scope.value==='site')detail='This site will use '+label(s.sites[site.key])+'.';
        else {
          const saved=Object.entries(s.workspaceSites).filter(([,choices])=>choices[site.key]);
          let workspaces;
          try{workspaces=Services.wm?.getMostRecentWindow('navigator:browser')?.gZenWorkspaces;}catch{}
          detail=saved.length?saved.map(([id,choices],i)=>`${workspaces?.getWorkspaceFromId(id)?.name||'Saved workspace '+(i+1)}: ${label(choices[site.key])}`).join('; ')+'. Other workspaces use the browser default.':'No workspace has a saved choice for this group; the browser default applies.';
        }
        preview.textContent=`Group: ${site.label}. ${detail} Grouping applies across workspaces; earlier choices are retained. Non-default ports keep separate choices.`;
      }catch(e){message.textContent=e.message;}
    }
    refreshPanel=()=>{
      // Zen's native chooser uses 2 for System; legacy Firefox Auto is 3.
      // Display either as System without changing the stored preference.
      const nativeDefault=Services.prefs.getIntPref(SAT_PREF,2);
      defaults.value=String(nativeDefault===0||nativeDefault===1?nativeDefault:2);
      scope.value=hasWorkspaces?Services.prefs.getStringPref(SAT_PREFIX+'scope','workspace'):'site';
      try{
        const s=satRead(),selected=groups.value;
        const keys=new Set([...Object.keys(s.sites),...Object.values(s.groups),...Object.values(s.workspaceSites).flatMap(Object.keys)]);
        while(groups.options.length>2)groups.remove(2);
        for(const key of [...keys].sort()){const o=el('option',key.replace(/^[^:]+:/,''));o.value=key;groups.appendChild(o);}
        groups.value=[...groups.options].some(o=>o.value===selected)?selected:'automatic';
        existing.replaceChildren();
        for(const [host,key]of Object.entries(s.groups)){const li=el('li');const edit=el('button',host+' → '+key.replace(/^[^:]+:/,''));edit.type='button';edit.addEventListener('click',()=>{hostname.value=host;groups.value=key;previewChoice();hostname.focus();});li.appendChild(edit);existing.appendChild(li);}
        previewChoice();
      }catch(e){message.textContent=e.message;}
    };
    defaults.addEventListener('change',()=>Services.prefs.setIntPref(SAT_PREF,Number(defaults.value)));
    scope.addEventListener('change',()=>Services.prefs.setStringPref(SAT_PREFIX+'scope',scope.value));
    groups.addEventListener('change',previewChoice);hostname.addEventListener('input',previewChoice);
    button.addEventListener('click',()=>{
      try{
        const current=satRead();let target=groups.value==='automatic'?null:groups.value;
        if(target==='independent')target='host:'+new URL('https://'+hostname.value.trim()).hostname;
        satWrite(AppearancePolicy.setGrouping(current,hostname.value.trim(),target));message.textContent='Grouping saved. Existing appearance choices have been retained.';refreshPanel();
      }catch(e){message.textContent=e.message;}
    });
    host.prepend(panel);refreshPanel();
    const {PrivateBrowsingUtils}=ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs');
    if(PrivateBrowsingUtils.isContentWindowPrivate(window)){
      for(const control of panel.querySelectorAll('input,select,button'))control.disabled=true;
      message.textContent='Change saved configuration from a normal window. Toolbar choices in private windows are temporary.';
    }
  }
  const observer=new MutationObserver(mount);observer.observe(doc.documentElement,{childList:true,subtree:true});
  const update=()=>refreshPanel();Services.prefs.addObserver(SAT_PREFIX,update);Services.prefs.addObserver(SAT_PREF,update);
  const api={stop(){if(stopped)return;stopped=true;observer.disconnect();Services.prefs.removeObserver(SAT_PREFIX,update);Services.prefs.removeObserver(SAT_PREF,update);window.removeEventListener('unload',api.stop);panel?.remove();if(window.__satSettings===api)delete window.__satSettings;}};
  window.__satSettings=api;window.addEventListener('unload',api.stop,{once:true});window.addUnloadListener?.(api.stop);mount();
})();
