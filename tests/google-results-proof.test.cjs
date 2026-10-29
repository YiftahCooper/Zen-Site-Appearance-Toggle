const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../.backup-scratch/test-tools/node_modules/jsdom');
const source=fs.readFileSync(require.resolve('./native_google_results.py'),'utf8').match(/SAMPLE=r'''([\s\S]*?)'''/)[1];
function sample(url,html){
 const dom=new JSDOM('<input name="q">'+html,{url}),w=dom.window;
 w.matchMedia=()=>({matches:false});w.Element.prototype.getClientRects=()=>[{width:150,height:100}];
 for(const image of w.document.images){Object.defineProperty(image,'naturalWidth',{value:Number(image.dataset.testWidth??200)});Object.defineProperty(image,'naturalHeight',{value:Number(image.dataset.testHeight??150)});}
 try{return new Function('document','location','getComputedStyle','matchMedia','URL',source)(w.document,w.location,w.getComputedStyle.bind(w),w.matchMedia,URL);}finally{w.close();}
}
test('footer help links and a search field do not prove Search results',()=>{
 assert.equal(sample('https://www.google.com/search?q=flowers','<main>No results</main><footer><a href="https://help.example.net">Help</a></footer>').results,false);
});
test('Images preview buttons require a real loaded thumbnail and external source within a result card',()=>{
 const card='<div id="search"><div data-attrid="images universal" data-docid="fixture" data-lpage="https://flowers.example.org"><div data-img-wrapper><a><div data-preview-id><div role="button"><img src="flower.jpg"></div></div></a></div><a href="/goto?url=opaque">Flower source</a></div></div>';
 const url='https://www.google.com/search?q=flowers&udm=2';
 assert.equal(sample(url,card).results,true);
 for(const invalid of [
  card.replace('data-docid="fixture"',''),
  card.replace('https://flowers.example.org','https://www.google.com'),
  card.replace('data-img-wrapper','unrelated-wrapper'),
  card.replace('role="button"','role="presentation"'),
  card.replace('<img ','<img data-test-width="1" data-test-height="1" '),
  card.replace('<img ','<img data-test-width="16" data-test-height="16" '),
  card.replace('id="search"','id="footer"'),
  card.replace('<img ','<img style="visibility:hidden" ')
 ])assert.equal(sample(url,invalid).results,false);
 assert.equal(sample('https://www.google.com/search?q=flowers',card).results,false);
});
test('a lookalike route outside the Google origin cannot prove results',()=>{
 assert.equal(sample('https://example.org/search?q=flowers','<div id="search"><a href="https://example.net"><h3>Flowers</h3></a></div>').results,false);
});
test('Images needs displayed image result evidence, not merely udm=2 or a text result',()=>{
 assert.equal(sample('https://www.google.com/search?q=flowers&udm=2','<div id="search"><a href="https://example.net"><h3>Flowers</h3></a></div>').results,false);
});
test('positive result evidence stays within the results region and matches its mode',()=>{
 assert.equal(sample('https://www.google.com/search?q=flowers','<div id="search"><a href="https://example.net"><h3>Flowers</h3></a></div>').results,true);
 assert.equal(sample('https://www.google.com/search?q=flowers&udm=2','<div id="search"><a href="https://www.google.com/imgres?imgurl=https://example.net/a.jpg"><img src="a.jpg"></a></div>').results,true);
});
test('Google opaque goto result requires a heading and an external website citation',()=>{
 const result='<div id="search"><a href="/goto?url=opaque-google-result"><h3>Flowers</h3><cite>https://flowers.example.org › catalogue</cite></a></div>';
 assert.equal(sample('https://www.google.com/search?q=flowers',result).results,true);
 assert.equal(sample('https://www.google.com/search?q=flowers',result.replace('<cite>https://flowers.example.org › catalogue</cite>','')).results,false);
 assert.equal(sample('https://www.google.com/search?q=flowers',result.replace('https://flowers.example.org','https://www.google.com')).results,false);
 assert.equal(sample('https://www.google.com/search?q=flowers',result.replace('<h3>Flowers</h3>','')).results,false);
 assert.equal(sample('https://www.google.com/search?q=flowers',result.replace('id="search"','id="footer"')).results,false);
});
