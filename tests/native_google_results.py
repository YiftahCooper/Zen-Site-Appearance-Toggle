"""Real Search/Images acceptance in a visible fresh disposable profile.

Stops on a Google challenge unless explicitly allowed to wait for the user to
complete it; never attempts to bypass it. No existing profile or authentication
is used. Website settings are changed only in this fixture.
"""
import ast,hashlib,json,os,re,shutil,sys,time,traceback
from pathlib import Path
from native_support import Browser,ROOT

SAMPLE=r'''
const u=new URL(location.href),styles=[document.body,document.documentElement].filter(Boolean).map(e=>getComputedStyle(e).backgroundColor);
const images=u.searchParams.get('udm')==='2',root=document.querySelector('#search'),google=u.origin==='https://www.google.com';
const visible=e=>e&&[...e.getClientRects()].some(r=>r.width>0&&r.height>0)&&getComputedStyle(e).visibility!=='hidden';
function external(a){try{let r=new URL(a.href);if(r.origin===u.origin&&r.pathname==='/url')r=new URL(r.searchParams.get('q')||r.searchParams.get('url'));return r.protocol==='https:'&&!/(^|\.)google\.[a-z.]+$/.test(r.hostname)&&r.hostname!==u.hostname;}catch{return false;}}
function citedRedirect(a){try{const r=new URL(a.href),cite=a.querySelector('cite');if(r.origin!==u.origin||r.pathname!=='/goto'||!r.searchParams.get('url')||!visible(cite))return false;
 const address=cite.textContent.trim().match(/^https:\/\/[^\s›]+/);return !!address&&external({href:address[0]});}catch{return false;}}
const anchors=root?[...root.querySelectorAll('a[href]')]:[];
const textResults=anchors.filter(a=>visible(a)&&visible(a.querySelector('h3'))&&(external(a)||citedRedirect(a))).length;
const linkedImageResults=anchors.filter(a=>{const image=a.querySelector('img');let imageLink=false;try{const r=new URL(a.href);imageLink=r.origin===u.origin&&r.pathname==='/imgres'&&r.searchParams.has('imgurl');}catch{}
 return visible(a)&&visible(image)&&image.naturalWidth>=80&&image.naturalHeight>=60&&(imageLink||external(a));}).length;
const previewCards=root?[...root.querySelectorAll('[data-attrid="images universal"][data-docid][data-lpage]')]:[];
const previewImageResults=previewCards.filter(card=>{
 const preview=card.querySelector('[data-img-wrapper] [data-preview-id] [role="button"]'),image=preview?.querySelector('img');
 return visible(card)&&visible(preview)&&visible(image)&&image.naturalWidth>=80&&image.naturalHeight>=60&&external({href:card.getAttribute('data-lpage')});
}).length;
const imageResults=linkedImageResults+previewImageResults;
return {origin:u.origin,path:u.pathname,query:u.pathname==='/search'?u.searchParams.get('q'):null,images,
 challenged:u.pathname.startsWith('/sorry')||!!document.querySelector('form[action*="/sorry/"],iframe[src*="recaptcha"]'),
 search:!!document.querySelector('textarea[name=q],input[name=q]'),
 results:google&&(images?imageResults>0:textResults>0),resultEvidence:{textResults,imageResults,linkedImageResults,previewImageResults},
 resultStructure:anchors.slice(0,30).map(a=>{let path;try{path=new URL(a.href).pathname;}catch{}const img=a.querySelector('img');return {path,heading:!!a.querySelector('h3'),citation:!!a.querySelector('cite'),visible:!!visible(a),image:img?{width:img.naturalWidth,height:img.naturalHeight,visible:!!visible(img)}:null};}),
 dark:matchMedia('(prefers-color-scheme:dark)').matches,backgrounds:styles,
 pcs:[...new Set([...document.querySelectorAll('[data-pcs]')].map(e=>e.getAttribute('data-pcs')))]};
'''

def rendered(sample,dark):
    background=None
    for text in sample['backgrounds']:
        numbers=[float(n) for n in re.findall(r'[\d.]+',text)]
        if len(numbers)==4 and 0<numbers[3]<1:return False
        if len(numbers)==3 or len(numbers)==4 and numbers[3]==1:
            background=numbers[:3];break
    return sample['dark']==dark and sample['pcs']==['2' if dark else '1'] and background is not None and all(v<65 if dark else v>=235 for v in background)

def operation_status(sample,state):
    if sample['challenged']:return 'blocked-by-google-challenge'
    if state.get('error'):return 'failed'
    return 'ready'

def real_results(sample,images):
    return sample['origin']=='https://www.google.com' and sample['path']=='/search' and sample['query']=='flowers' and sample['images']==images and sample['search'] and sample['results']


def verify_prior_search(receipt,source_sha):
    expected=['Search has the requested real results page','Search remains on real results after saved-choice application']
    for mode in ['light','dark','light']:
        expected += ['Search renders '+mode,'Search preserves real search results and result type','Search leaves browser default Dark']
    checks=receipt.get('checks',[])[:len(expected)]
    if receipt.get('sourceSHA256')!=source_sha or [c.get('name') for c in checks]!=expected or not all(c.get('pass') is True for c in checks):
        raise RuntimeError('Prior Search receipt does not verify this candidate; refusing to skip Search')
    samples=[s for s in receipt.get('samples',[]) if s.get('stage')=='Search light']
    if len(samples)!=2 or not all(real_results(s,False) and rendered(s,False) for s in samples):
        raise RuntimeError('Prior Search Light samples are missing or invalid')

def run():
    options=set(sys.argv[1:])
    if options-{'--validate-only','--allow-manual-challenge','--images-only'}:raise RuntimeError('Unsupported argument; existing profiles cannot be supplied')
    images_only='--images-only' in options
    source_sha=hashlib.sha256((ROOT/'sine/JS/zen-colorscheme-toggle.uc.js').read_bytes()).hexdigest()
    search_key=None
    if images_only:
        groups=json.loads((ROOT/'src/site-rules.json').read_text(encoding='utf-8'))['groups']
        search_key=next(g['key'] for g in groups if 'www.google.com' in g['hosts'])
        print('Independent Images fixture seeded with Google Light. This does not prove Search or a Search-to-Images transition.',flush=True)
    if '--validate-only' in options:
        ast.parse(Path(__file__).read_text(encoding='utf-8'));print('Search/Images diagnostic syntax passed; no browser started.');return 0
    allow_manual='--allow-manual-challenge' in options
    for key in ['SAT_NATIVE_BINARY','MOZ_DISABLE_CONTENT_SANDBOX']:os.environ.pop(key,None)
    os.environ['SAT_NATIVE_CONTENT_SANDBOX']='1';os.environ['SAT_NATIVE_HEADFUL']='1'
    output=ROOT/'.backup-scratch/google-results';output.mkdir(parents=True,exist_ok=True)
    out=output/('native-google-results-'+str(time.time_ns())+'.json')
    result={'checks':[],'samples':[],'status':'running','sourceSHA256':source_sha}
    if images_only:result.update({'fixture':'Fresh disposable profile seeded with Google Light; previous Search operations are not repeated','seedSiteKey':search_key})
    def save():out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    def check(name,ok):
        result['checks'].append({'name':name,'pass':bool(ok)});save();print(name,bool(ok),flush=True)
        if not ok:raise RuntimeError(name)
    def wait(b):
        for _ in range(600):
            state=b.chrome('return {busy:window.__zenSiteAppearanceToggle.busy,error:window.__satError||null};')
            if not state['busy']:
                return state
            time.sleep(.1)
        return {'error':'Toolbar operation did not finish within 60 seconds'}
    def manual_challenge(b,label,images):
        if not allow_manual:return None
        print('ACTION NEEDED: Complete Google\'s challenge in the separate disposable Zen window. Keep the flowers query. Do not use your everyday window. Checks resume automatically when the requested results appear; timeout is five minutes.',flush=True)
        result['status']='waiting-for-human-challenge';save()
        started=time.monotonic();unrecognized=0
        while time.monotonic()-started<300:
            if b.p.poll() is not None:raise RuntimeError('Disposable test window closed during manual challenge')
            time.sleep(1)
            try:sample=b.content(SAMPLE)
            except Exception as error:
                result['manualWaitLastError']=str(error);save()
                continue # A navigation can briefly invalidate the content context.
            result['manualWaitLastSample']=sample;save()
            if real_results(sample,images) and not sample['challenged']:
                sample['stage']=label+' after manual challenge';result['samples'].append(sample)
                result.setdefault('manualChallenges',[]).append({'stage':label,'seconds':round(time.monotonic()-started,1),'completed':True})
                result['status']='running';save();print('Requested results are visible; resuming appearance checks.',flush=True);return sample
            unrecognized=0 if sample['challenged'] else unrecognized+1
            if unrecognized>=10:
                raise RuntimeError('Challenge is no longer present, but the requested results were not recognized for ten samples; inspect manualWaitLastSample before retrying')
        result.setdefault('manualChallenges',[]).append({'stage':label,'completed':False});save()
        print('Manual challenge wait ended without verified results; no acceptance recorded.',flush=True);return None
    try:
        with Browser(network=True) as b:
            result['identity']=b.c.identity;save()
            mods=b.profile/'chrome/sine-mods';target=mods/'zen-site-appearance-toggle';target.mkdir(parents=True);shutil.copytree(ROOT/'sine',target/'sine')
            if images_only:
                seed={'version':1,'sites':{search_key:'light'},'workspaceSites':{},'groups':{}}
                b.chrome("Services.prefs.setStringPref('mod.zensiteappearancetoggle.state',arguments[0]);",json.dumps(seed))
            manifest=b.profile/'chrome/site-test.manifest';manifest.write_text('content sine '+mods.as_uri()+'/\n',encoding='utf-8')
            b.chrome("const f=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);f.initWithPath(arguments[0]);Components.manager.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(f);Services.prefs.setIntPref('layout.css.prefers-color-scheme.content-override',0);Services.prefs.setStringPref('mod.zensiteappearancetoggle.scope','site');Services.scriptloader.loadSubScriptWithOptions('chrome://sine/content/zen-site-appearance-toggle/sine/JS/zen-colorscheme-toggle.uc.js',{target:window,ignoreCache:true});",str(manifest))
            first_key=search_key
            for images in ([True] if images_only else [False,True]):
                label='Images' if images else 'Search';print('Opening real Google '+label+' results in the disposable window.',flush=True)
                b.navigate('https://www.google.com/search?hl=en&q=flowers'+('&udm=2' if images else ''));time.sleep(.5)
                sample=b.content(SAMPLE);sample['stage']=label+' arrival';result['samples'].append(sample);save()
                if sample['challenged']:
                    sample=manual_challenge(b,label,images)
                    if sample is None:
                        result['status']='blocked-by-google-challenge';print('Google returned a challenge; stopping without bypass or acceptance.',flush=True);return 2
                check(label+' has the requested real results page',real_results(sample,images))
                state=wait(b);sample=b.content(SAMPLE);sample['stage']=label+' ready';sample['toolbar']=state;result['samples'].append(sample);save()
                status=operation_status(sample,state)
                if status=='blocked-by-google-challenge':result['status']=status;return 2
                if status=='failed':raise RuntimeError(state['error'])
                check(label+' remains on real results after saved-choice application',real_results(sample,images))
                context=b.chrome('return window.__zenSiteAppearanceToggle.controller.currentContext();')
                if first_key is None:first_key=context['siteKey']
                else:
                    check('Search and Images share the same saved website identity',context['siteKey']==first_key)
                    check('Images inherits the '+('seeded Google' if images_only else 'choice made on Search')+' Light choice',b.chrome("return window.__zenSiteAppearanceToggle.controller.choice();")=='light')
                for mode in ['light','dark','light']:
                    for attempt in range(2):
                        b.chrome('void window.__zenSiteAppearanceToggle.choose(arguments[0]);',mode);state=wait(b)
                        sample=b.content(SAMPLE);sample['stage']=label+' '+mode;sample['toolbar']=state;result['samples'].append(sample);save()
                        status=operation_status(sample,state)
                        if status=='blocked-by-google-challenge':
                            if attempt==0 and manual_challenge(b,label+' '+mode,images) is not None:continue
                            result['status']='blocked-by-google-challenge';print('Google challenged a theme navigation; stopping.',flush=True);return 2
                        if status=='failed':raise RuntimeError(state['error'])
                        break
                    check(label+' renders '+mode,rendered(sample,mode=='dark'))
                    check(label+' preserves real search results and result type',real_results(sample,images))
                    check(label+' leaves browser default Dark',b.chrome("return Services.prefs.getIntPref('layout.css.prefers-color-scheme.content-override');")==0)
            result['status']='passed';return 0
    except Exception as error:
        result['status']='failed';result['error']=repr(error);traceback.print_exc();return 1
    finally:save();print(out,flush=True)

if __name__=='__main__':raise SystemExit(run())
