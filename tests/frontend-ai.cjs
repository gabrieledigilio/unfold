// Browser-independent integration checks. This intentionally does not claim DOM,
// layout, accessibility-tree, or WebGL coverage.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const dir = path.join(__dirname, '../public');
const content = JSON.parse(fs.readFileSync(path.join(dir, 'content.json')));
const objects = JSON.parse(fs.readFileSync(path.join(dir, 'objects.json')));
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (body, status = 200) => ({ok: status >= 200 && status < 300, status, json: async () => body});
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };

async function boot({search='?view=explore&object=macbook',introGate=null,catalogFailure=false,catalogGate=null}={}) {
  const nodes = new Map(), listeners = {}, windowListeners={}, storage = new Map(), network = [], urls = [], calls = [], log = [], photoUrls = [], revokedUrls = [], intros=[];
  const {validateBlueprint}=await import(path.join(dir,'blueprint-schema.mjs'));
  let doc, fetchHandler = () => response({configured:false, model:'gemma-4-31b-it'}), now=10000, timerSequence=0, hangImageDecode=false;
  const timers=new Map();
  const createTimer=(fn,ms,repeat)=>{const id=++timerSequence;timers.set(id,{fn,ms,repeat,next:now+ms});return id;};
  const advance=ms=>{const target=now+ms;for(;;){const due=[...timers].filter(([,timer])=>timer.next<=target).sort((a,b)=>a[1].next-b[1].next)[0];if(!due)break;const [id,timer]=due;now=timer.next;if(timer.repeat)timer.next+=timer.ms;else timers.delete(id);timer.fn();}now=target;};
  class Element {
    constructor() { this.dataset={}; this.attrs={}; this.style={setProperty(){}}; this.innerHTML=''; this.textContent=''; this.value=''; this.id=''; this.isConnected=true; this.classList={add(){},remove(){},toggle(){}}; }
    setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];}
    focus(){doc.activeElement=this;} contains(){return false;} replaceWith(){} append(){} remove(){}
    querySelector(){return null;} querySelectorAll(){return [];} addEventListener(){} scrollIntoView(){} setSelectionRange(){}
    getContext(){return {drawImage(){},fillRect(){},fillStyle:''};}
    toDataURL(){return 'data:image/jpeg;base64,/9j/2wBDAAAAAA==';}
  }
  doc={body:new Element(),activeElement:null,createElement:()=>new Element(),querySelector:s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s);},querySelectorAll:()=>[],addEventListener:(t,f)=>(listeners[t]??=[]).push(f)};
  class Viewer {
    constructor(el,opt){this.options=opt;this.objectId=opt.objectId;this.disposed=false;calls.push(['create',opt.objectId]);queueMicrotask(()=>opt.onReady());}
    setTheme(v){this.theme=v;} select(v){this.selected=v;} setSeparation(v){this.separation=v;} setActivity(v){this.activity=v;}
    setAutoRotate(v){this.options.onAutoRotateChange(v);} setActive(v){this.active=v;}
    setView(v){this.view=v;calls.push(['camera',v]);this.options.onAutoRotateChange(false);}
    zoomBy(v){calls.push(['zoom',v]);} pressTrackpad(){calls.push(['press']);} reset(){calls.push(['reset']);}
    destroy(){this.disposed=true;calls.push(['destroy',this.objectId]);}
  }
  function createIntroParticles(host,options){const instance={host,options,disposed:false,setTheme(v){this.theme=v;},setActive(v){this.active=v;},setPaused(v){this.paused=v;},destroy(){this.disposed=true;}};intros.push(instance);options.onObjectChange('macbook');return instance;}
  const introModule=()=>introGate?introGate.promise.then(()=>({createIntroParticles})):Promise.resolve({createIntroParticles});
  class TestURL extends URL { static createObjectURL(){const url='blob:local-test-photo-'+photoUrls.length;photoUrls.push(url);return url;} static revokeObjectURL(url){revokedUrls.push(url);} }
  class TestImage { constructor(){this.naturalWidth=2048;this.naturalHeight=1024;} set src(value){if(!hangImageDecode)queueMicrotask(()=>this.onload?.());} }
  const sandbox={document:doc,URL:TestURL,URLSearchParams,Set,Map,AbortController,DOMException,Blob,queueMicrotask,
    console:{log:(...v)=>log.push(v),error:(...v)=>log.push(v),warn:(...v)=>log.push(v)},
    setTimeout:(fn,ms)=>createTimer(fn,ms,false),clearTimeout:id=>timers.delete(id),
    setInterval:(fn,ms)=>createTimer(fn,ms,true),clearInterval:id=>timers.delete(id),performance:{now:()=>now},
    Image:TestImage,
    matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>{fn();return 0;},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    location:{search,href:'https://example.test/'+search},history:{replaceState:(a,b,url)=>urls.push(String(url))},
    fetch:async (url,options={})=>{if(String(url).startsWith('content')||String(url).startsWith('objects')){if(catalogGate)await catalogGate.promise;return response(String(url).startsWith('content')?content:objects,catalogFailure?503:200);}network.push({url,options});return fetchHandler(url,options);},
    window:{scrollTo(){},addEventListener:(name,fn)=>windowListeners[name]=fn},Viewer,validateBlueprint,introModule};
  sandbox.globalThis=sandbox;
  const code=fs.readFileSync(path.join(dir,'app.js'),'utf8')
    .replace(/import\('\.\/viewer\.js\?v=\d+'\)/,'Promise.resolve({ObjectViewer:Viewer})')
    .replace(/import\('\.\/intro-particles\.js\?v=\d+'\)/,'introModule()')
    .replace(/import\('\.\/blueprint-schema\.mjs\?v=\d+'\)/,'Promise.resolve({validateBlueprint})')
    .replace(/\}\)\(\);\s*$/, 'globalThis.test={generated,progress,state,ai,catalog,runtime,introRuntime,homeState,objects,allConcepts,allSources,render,choosePart,chooseObject,separation,openModal,closeModal,questionPanel,askQuestion,applySceneActions,contextSnapshot,contextSignature,invalidateQuestion,guardQuestionContext,apiRequest,refreshStatus,connectGemma,resizePhoto,analyzePhoto,photoModal,gemmaModal,cancelPhoto,choosePhoto,acceptPhotoFiles};})();');
  vm.createContext(sandbox);vm.runInContext(code,sandbox);
  await tick();await tick();
  if(sandbox.test.state.view==='explore'&&!catalogFailure)assert.equal(sandbox.test.runtime.status,'ready','reference explorer must boot without an API key');
  return {t:sandbox.test,doc,storage,network,urls,calls,log,photoUrls,revokedUrls,timers,advance,Element,intros,
    setFetch(fn){fetchHandler=fn;},
    setImageHang(value){hangImageDecode=value;},
    click(action,value,extra={}){const el=new Element();el.dataset={action,value,...extra};for(const f of listeners.click||[])f({target:{closest:()=>el}});},
    input(id,value){for(const f of listeners.input||[])f({target:{id,value}});},
    change(id,files){const target={id,files,value:'chosen-file'};for(const f of listeners.change||[])f({target});return target;},
    dispatch(name,event={}){for(const f of listeners[name]||[])f(event);},
    pop(search){sandbox.location.search=search;windowListeners.popstate();},
    html:()=>doc.querySelector('#product-shell').innerHTML};
}

(async()=>{
  {
    const pitch=await boot({search:''});
    assert.equal(pitch.t.state.view,'pitch','bare URL opens the presentation');
    assert.equal(pitch.calls.length,0);assert.equal(pitch.intros.length,0);
    assert.match(pitch.html(),/We spend hours/);
    pitch.click('pitch-back');assert.match(pitch.html(),/We spend hours/);
    const key=key=>pitch.dispatch('keydown',{key,target:{matches:()=>false,closest:()=>null},preventDefault(){}});
    key('ArrowRight');assert.match(pitch.html(),/what happens inside/);
    key('ArrowLeft');assert.match(pitch.html(),/We spend hours/);
    for(let i=0;i<3;i++)pitch.click('pitch-next');
    assert.match(pitch.html(),/MEET THE OBJECT ATLAS/);
    pitch.click('pitch-next');await tick();assert.equal(pitch.t.state.view,'home');
    assert.match(pitch.html(),/home-photo-upload/);assert.equal(pitch.intros.length,1);
    pitch.click('view','pitch');assert.match(pitch.html(),/We spend hours/);
    key('Escape');assert.equal(pitch.t.state.view,'home');
    const failed=await boot({search:'?view=pitch',catalogFailure:true});
    assert.equal(failed.t.state.view,'pitch');assert.match(failed.html(),/We spend hours/);
    failed.click('pitch-skip');assert.equal(failed.t.state.view,'home');
    assert.match(failed.html(),/Example objects could not load/);
  }
  {
  const home=await boot({search:'?view=home'}), start=home.t;
  assert.equal(start.state.view,'home','explicit home URL opens the upload screen');
  assert.equal(home.calls.length,0,'home does not create the interactive WebGL explorer');
  assert.equal(home.intros.length,1,'catalog and connection refreshes reuse the intro instance');
  assert.match(home.html(),/id="home-photo-upload" type="file"/);
  assert.match(home.html(),/See how<br>\s*it works/);
  assert.ok(home.urls.every(url=>!new URL(url).searchParams.has('object')),'home URLs do not reopen an old object');
  const intro=home.intros[0];assert.equal(intro.active,true);
  const beforeCaption=home.html();intro.options.onObjectChange('lamp');
  assert.equal(home.doc.querySelector('[data-intro-name]').textContent,'Desk lamp');
  assert.equal(home.html(),beforeCaption,'animation captions update without rebuilding the screen');
  intro.options.onObjectChange('<script>');assert.equal(start.introRuntime.object,'lamp');
  home.click('theme','paper');assert.equal(intro.theme,'paper');assert.equal(home.intros.length,1);
  home.click('intro-motion');assert.equal(intro.paused,true);
  home.doc.hidden=true;home.dispatch('visibilitychange');assert.equal(intro.active,false);
  home.doc.hidden=false;home.dispatch('visibilitychange');assert.equal(intro.active,true);assert.equal(intro.paused,true);
  const upload={name:'my-lamp.jpg',type:'image/jpeg',size:2400};
  let prevented=0;
  const drop=(files,types=['Files'])=>home.dispatch('drop',{dataTransfer:{types,files},preventDefault(){prevented++;}});
  drop([],['text/uri-list']);assert.equal(prevented,0,'link and text drags remain ordinary browser interactions');
  drop([upload,upload]);assert.equal(start.state.modal,null);assert.match(start.homeState.error,/one photo/);
  drop([{...upload,type:'image/gif'}]);assert.equal(start.state.modal,null);assert.match(start.homeState.error,/JPG/);
  drop([{...upload,size:16*1024*1024}]);assert.equal(start.state.modal,null);
  drop([upload]);assert.equal(start.state.modal,'photo');assert.equal(start.ai.photo.file,upload);
  assert.equal(intro.active,false,'preview modal pauses the background animation');
  assert.equal(home.network.filter(r=>r.url==='/api/analyze').length,0,'drop only creates a local preview');
  const selectedPreview=start.state.previewUrl;
  await start.analyzePhoto();assert.equal(start.state.modal,'gemma');
  assert.equal(start.ai.photo.file,upload);assert.equal(start.state.previewUrl,selectedPreview);
  home.setFetch(()=>response({ok:true,model:'gemma-4-26b-a4b-it'}));
  await start.connectGemma({querySelector:()=>({value:'intro-test-key'})});
  assert.equal(start.state.modal,'photo');assert.equal(start.ai.photo.file,upload);
  assert.equal(home.network.filter(r=>r.url==='/api/analyze').length,0,'connecting preserves the selected image for explicit generation');
  start.closeModal();assert.equal(intro.active,true);assert.ok(home.revokedUrls.includes(selectedPreview));
  const picker=home.change('home-photo-upload',[upload]);assert.equal(start.state.modal,'photo','native file-picker change uses the same preview flow');
  assert.equal(picker.value,'','the same photo can be selected again after closing the preview');
  start.closeModal();home.click('object','drill');await tick();
  assert.equal(start.state.view,'explore');assert.equal(start.runtime.instance.objectId,'drill');assert.equal(intro.disposed,true);
  home.click('view','home');await tick();assert.equal(start.runtime.instance,null);assert.equal(home.intros.length,2);
  home.pop('?object=lamp&part=led');await tick();assert.equal(start.state.view,'explore');assert.equal(start.state.part,'led');
  home.pop('?view=home');await tick();assert.equal(start.state.view,'home');assert.equal(start.runtime.instance,null);
  const implicit=await boot({search:'?object=drill&part=motor'});assert.equal(implicit.t.state.view,'explore');assert.equal(implicit.t.state.part,'motor');
  const explicitHome=await boot({search:'?view=home&object=macbook'});assert.equal(explicitHome.t.state.view,'home');assert.equal(explicitHome.calls.length,0);
  for(const view of ['atlas','collection']){const routed=await boot({search:'?view='+view});assert.equal(routed.t.state.view,view);assert.equal(routed.intros.length,0);}
  const gate=deferred(),loadingIntro=await boot({search:'?view=home',introGate:gate});
  loadingIntro.click('object','lamp');gate.resolve();await tick();
  assert.equal(loadingIntro.intros.length,0,'late animation import cannot mount on the explorer');
  loadingIntro.click('view','home');await tick();assert.equal(loadingIntro.intros.length,1);
  const brokenGate=deferred(),fallback=await boot({search:'?view=home',introGate:brokenGate});brokenGate.reject(new Error('Unavailable'));await tick();
  assert.equal(fallback.t.introRuntime.status,'failed');fallback.change('home-photo-upload',[upload]);
  assert.equal(fallback.t.state.modal,'photo','file upload remains available if animation cannot load');
  const missingCatalog=await boot({search:'?view=home',catalogFailure:true});
  assert.equal(missingCatalog.t.state.view,'home');assert.match(missingCatalog.html(),/Example objects could not load/);
  missingCatalog.change('home-photo-upload',[upload]);assert.equal(missingCatalog.t.state.modal,'photo','upload remains available if references cannot load');
  missingCatalog.t.closeModal();missingCatalog.click('view','collection');missingCatalog.click('view','explore');
  assert.equal(missingCatalog.t.state.view,'collection','Saved empty-state cannot bypass the missing-reference guard');
  }
  const h=await boot(), {t}=h;
  const key='test-key-for-memory-only-checks';
  const sourceId=[...t.allSources.keys()][0];
  const sceneResult={answer:'A motor turns electrical energy into motion. <script>unsafe()</script>',actions:[{type:'connectObject',objectId:'drill',partId:'motor',conceptId:'electromagnetism'},{type:'setActivity',value:.6},{type:'setCamera',view:'front'}],sourceIds:[sourceId,'invented-source'],model:'gemma-4-31b-it'};
  h.input('object-question','Show me how the motor works');
  await t.askQuestion();
  assert.equal(t.state.modal,'gemma');
  assert.equal(h.network.filter(r=>r.url==='/api/explore').length,0,'missing key must not send a paid inference');
  assert.match(t.gemmaModal(),/type="password"/);
  assert.match(t.gemmaModal(),/Not saved/);
  const field={value:key};
  h.setFetch((url)=>url==='/api/connect'?response({ok:true,model:'gemma-4-31b-it'}):response(sceneResult));
  const connectionTask=t.connectGemma({querySelector:()=>field});
  assert.ok([...h.timers.values()].some(timer=>timer.ms===60000&&!timer.repeat),'connection deadline stays at 60 seconds');
  await connectionTask;
  assert.equal(field.value,'','key input is cleared on submission');
  assert.equal(t.ai.key,key);
  assert.equal(t.state.modal,null);
  const connection=h.network.find(r=>r.url==='/api/connect');
  assert.equal(connection.options.headers['X-Gemma-Api-Key'],key);
  assert.equal(connection.options.body,'{}');
  const firstQuestion=t.askQuestion();
  assert.ok([...h.timers.values()].some(timer=>timer.ms===60000&&!timer.repeat),'question deadline stays at 60 seconds');
  await firstQuestion;await tick();
  assert.equal(t.state.object,'drill');assert.equal(t.state.part,'motor');assert.equal(t.state.concept,'electromagnetism');
  assert.equal(t.state.activity,.6);assert.equal(t.state.separation,1);assert.equal(t.runtime.instance.view,'front');
  assert.equal(t.ai.history.length,2);assert.equal(t.ai.answer.sourceIds.length,1);
  assert.match(t.questionPanel(),/&lt;script&gt;/);assert.doesNotMatch(t.questionPanel(),/<script>/);
  assert.ok(t.questionPanel().includes(t.allSources.get(sourceId).url.replaceAll('&','&amp;')),'answer references use curated source URLs');
  assert.doesNotMatch(JSON.stringify([...h.storage])+h.html()+t.gemmaModal()+JSON.stringify(h.urls)+JSON.stringify(h.log),new RegExp(key),'test key must not appear in storage, markup, history URLs or logs');
  for(const request of h.network){assert.ok(!request.url.includes(key));assert.ok(!String(request.options.body).includes(key));assert.ok(String(request.url).startsWith('/api/'),'credential-bearing calls stay same-origin');}

  const before=t.contextSignature();
  assert.equal(t.applySceneActions([{type:'evaluate',code:'unsafe()'},{type:'selectPart',partId:'invented-part'},{type:'setCamera',view:'javascript:unsafe()'},{type:'setActivity',value:NaN},{type:'selectConcept',conceptId:'invented-concept'}]),0);
  assert.equal(t.contextSignature(),before,'unknown actions and IDs cannot change the scene');
  t.applySceneActions([{type:'setActivity',value:1000}]);assert.equal(t.state.activity,1,'even bypassed server output stays bounded');
  t.applySceneActions([{type:'selectPart',partId:'motor'},{type:'setSeparation',value:0}]);
  assert.equal(t.state.part,null,'closing a model clears hidden internal selection');assert.equal(t.state.concept,null);

  for(const change of [()=>t.chooseObject('lamp'),()=>t.choosePart('power'),()=>t.separation(.2),()=>h.input('activity',20),()=>h.click('camera','top'),()=>h.click('zoom','in')]){
    t.chooseObject('drill');await tick();t.ai.input='Show the motor';
    const pending=deferred();h.setFetch(()=>pending.promise);
    const task=t.askQuestion();assert.equal(t.ai.busy,true);
    const request=h.network.at(-1);change();const after=t.contextSignature();
    assert.equal(request.options.signal.aborted,true,'manual scene change cancels an outstanding question');
    pending.resolve(response(sceneResult));await task;await tick();
    assert.equal(t.contextSignature(),after,'late response cannot overwrite the new scene');
    assert.equal(t.ai.busy,false);
  }
  t.chooseObject('macbook');await tick();
  t.applySceneActions([{type:'connectObject',objectId:'lamp'},{type:'setCamera',view:'top'}]);
  t.chooseObject('drill');await tick();
  assert.notEqual(t.runtime.instance.view,'top','a pending AI camera must not affect a subsequent manual object selection');

  h.setFetch(()=>response({error:{code:'rate_limited',message:'Please wait and try again.'}},429));
  t.ai.input='Explain this';await t.askQuestion();assert.match(t.ai.error,/Please wait/);assert.equal(t.ai.busy,false);
  t.choosePart('motor');assert.equal(t.state.part,'motor','reference controls remain usable when provider fails');

  const blueprint={version:1,title:'Coffee cup <script>unsafe()</script>',summary:'A ceramic vessel. <img src=x onerror=unsafe()>',parts:[
    {id:'cup-body',label:'Cup body',description:'The hollow shell holds liquid.',principle:'Its walls support the liquid under gravity.',construction:'Clay is formed and fired.',observed:true,shape:'cylinder',size:[2,2,2],position:[0,0,0],rotation:[0,0,0],explode:[0,0,0]},
    {id:'cup-handle',label:'Handle <img src=x onerror=unsafe()>',description:'A curved grip.',principle:'The grip keeps fingers away from the hot wall.',construction:'The handle joins the body before firing.',observed:true,shape:'torus',size:[1,1,.3],position:[1.4,0,0],rotation:[0,0,0],explode:[1,0,0]},
    {id:'cup-liner',label:'Glaze',description:'A typical surface layer, inferred from this view.',principle:'A glassy surface reduces porosity.',construction:'A glaze is fired onto the clay.',observed:false,shape:'cylinder',size:[1.8,1.8,1.8],position:[0,0,0],rotation:[0,0,0],explode:[0,1,0]}
  ],connections:[{from:'cup-body',to:'cup-handle',label:'Transfers the weight <script>unsafe()</script>'},{from:'cup-body',to:'cup-liner',label:'Protects the porous surface'}]};
  const analysis={identification:'Coffee cup',match:'unsupported',objectId:null,summary:'A cup with a handle is visible.',visibleParts:['handle','rim'],blueprint,model:'gemma-4-26b-a4b-it'};
  const file={name:'private-cup-photo.jpg',type:'image/jpeg',size:100000};
  const referenceGate=deferred(),earlyPhoto=await boot({search:'?view=home',catalogGate:referenceGate,catalogFailure:true});
  earlyPhoto.change('home-photo-upload',[file]);earlyPhoto.t.ai.key=key;earlyPhoto.setFetch(()=>response(analysis));
  await earlyPhoto.t.analyzePhoto();await tick();
  assert.equal(earlyPhoto.t.state.object,'generated','home can generate while reference files are still loading');
  assert.equal(earlyPhoto.intros[0].disposed,true,'successful home generation destroys the decorative animation');
  const earlyViewer=earlyPhoto.t.runtime.instance;referenceGate.resolve();await tick();
  assert.equal(earlyPhoto.t.runtime.instance,earlyViewer);assert.match(earlyPhoto.html(),/has-generated/);
  assert.doesNotMatch(earlyPhoto.html(),/class="load-error"/,'a late reference failure cannot erase a generated study');
  t.openModal('photo');const beforeUpload=h.network.length;t.choosePhoto(file);
  const firstPhotoUrl=t.state.previewUrl, previousViewer=t.runtime.instance;
  assert.equal(h.network.length,beforeUpload,'choosing a file is local preview only');
  assert.match(t.photoModal(),/Generate blueprint/);assert.match(t.photoModal(),/sends a resized photo to Google/);
  h.setFetch(()=>response(analysis));const firstGeneration=t.analyzePhoto();
  assert.ok([...h.timers.values()].some(timer=>timer.ms===110000&&!timer.repeat),'photo generation has a separate 110-second client deadline');
  assert.ok([...h.timers.values()].some(timer=>timer.ms===1000&&timer.repeat),'elapsed status refreshes once per second');
  await firstGeneration;await tick();
  assert.equal(t.ai.photo.progressTimer,null);assert.equal(t.ai.photo.timeout,null);assert.equal([...h.timers.values()].filter(timer=>timer.repeat).length,0,'completion clears elapsed updates');
  assert.equal(t.state.object,'generated','an object outside presets creates its own blueprint');
  assert.equal(t.state.modal,null,'successful generation opens the workspace directly');
  assert.equal(t.state.layer,'model');assert.equal(t.state.separation,.5);
  assert.equal(t.generated.blueprint.title,blueprint.title);assert.equal(t.generated.photoUrl,firstPhotoUrl);
  assert.equal(previousViewer.disposed,true,'previous viewer is disposed before installing generated geometry');
  assert.equal(t.runtime.instance.options.blueprint,t.generated.blueprint);
  assert.equal(t.ai.photo.file,null);assert.equal(t.state.previewUrl,null);
  assert.ok(!h.revokedUrls.includes(firstPhotoUrl),'the generated photo retains its active blob URL');
  assert.match(h.html(),/has-generated/);assert.match(h.html(),/approximate geometry/);
  assert.match(h.html(),/&lt;script&gt;/);assert.doesNotMatch(h.html(),/<script>|<img src=x/);
  assert.doesNotMatch(h.html(),/data-action="save"|data-action="photo-model"/);
  const upload=h.network.at(-1);assert.equal(upload.url,'/api/analyze');assert.equal(JSON.parse(upload.options.body).image.mimeType,'image/jpeg');
  assert.ok(!upload.options.body.includes(file.name),'filename is not sent to the provider');
  t.choosePart('cup-body');assert.match(h.html(),/CONNECTED PARTS/);assert.match(h.html(),/Visible in photo/);
  assert.doesNotMatch(h.html(),/<script>|<img src=x/);
  h.click('part','cup-liner');assert.match(h.html(),/Inferred component/);
  t.separation(0);assert.equal(t.state.part,'cup-liner','selected inferred geometry stays inspectable when assembled');
  h.click('mode','assembly');assert.match(h.html(),/A glaze is fired/);
  h.click('layer','photo');assert.match(h.html(),new RegExp(firstPhotoUrl));assert.match(h.html(),/Your uploaded photo/);
  h.click('layer','model');
  t.openModal('sources');assert.match(h.doc.querySelector('#modal-root').innerHTML,/&lt;img/);t.closeModal();
  const selectedSignature=t.contextSignature();
  assert.equal(t.applySceneActions([{type:'connectObject',objectId:'drill',partId:'motor'},{type:'setActivity',value:1},{type:'selectConcept',conceptId:'electromagnetism'}]),0);
  assert.equal(t.contextSignature(),selectedSignature,'generated scenes reject preset-only actions');
  h.setFetch(()=>response({answer:'The handle carries the load.',actions:[{type:'selectPart',partId:'cup-handle'},{type:'setCamera',view:'front'},{type:'connectObject',objectId:'drill'}],sourceIds:[sourceId],model:'gemma-4-26b-a4b-it'}));
  t.ai.input='Explain the handle';await t.askQuestion();
  assert.equal(t.state.object,'generated');assert.equal(t.state.part,'cup-handle');assert.equal(t.runtime.instance.view,'front');
  assert.equal(t.ai.answer.sourceIds.length,0,'generated studies cannot cite unrelated preset sources');
  const questionBody=JSON.parse(h.network.at(-1).options.body);
  assert.equal(questionBody.context.objectId,'generated');assert.equal(questionBody.context.conceptId,null);assert.equal(questionBody.context.activity,0);
  assert.deepEqual(questionBody.blueprint,blueprint,'generated questions include the validated geometry');
  assert.ok(!JSON.stringify(questionBody).includes(firstPhotoUrl),'follow-up questions send blueprint data without the source photo URL');
  assert.doesNotMatch(JSON.stringify([...h.storage])+JSON.stringify(h.urls)+JSON.stringify(h.log),/cup-body|cup-handle|Coffee cup|private-cup|blob:local-test-photo|test-key-for-memory-only-checks/,'photo, identity, geometry and key are not persisted or logged');
  const generatedUrl=new URL(h.urls.at(-1));assert.equal(generatedUrl.searchParams.get('object'),null);assert.equal(generatedUrl.searchParams.get('part'),null);
  const storedBeforeSave=JSON.stringify([...h.storage]);h.click('save');assert.equal(JSON.stringify([...h.storage]),storedBeforeSave);
  t.chooseObject('lamp');await tick();assert.match(h.html(),/data-value="generated"/);assert.equal(t.generated.photoUrl,firstPhotoUrl);
  t.chooseObject('generated');await tick();assert.equal(t.runtime.instance.options.blueprint.title,blueprint.title,'session study can be reopened from the object rail');
  t.openModal('photo');t.choosePhoto(file);
  h.setFetch(()=>response({identification:'Unclear object',match:'uncertain',objectId:null,summary:'Try another view.',visibleParts:[],blueprint:null}));
  await t.analyzePhoto();assert.equal(t.state.modal,'photo');assert.equal(t.state.object,'generated');assert.equal(t.generated.photoUrl,firstPhotoUrl);
  assert.match(t.photoModal(),/closer photo of one object/);assert.doesNotMatch(t.photoModal(),/data-action="photo-model"/);
  h.setFetch(()=>response({...analysis,blueprint:{...blueprint,parts:[{...blueprint.parts[0],shape:'script'},blueprint.parts[1]]}}));
  await t.analyzePhoto();assert.match(t.ai.photo.error,/incomplete blueprint/);assert.equal(t.generated.photoUrl,firstPhotoUrl);
  assert.equal(t.ai.photo.file,file,'invalid model output retains the selected photo for retry');
  assert.equal(t.ai.photo.progressTimer,null);assert.equal(t.ai.photo.timeout,null);
  for(const code of ['OUTPUT_TRUNCATED','INVALID_JSON','INVALID_GEOMETRY','INVALID_BLUEPRINT']){
    h.setFetch(()=>response({error:{code:'invalid_response',message:'The blueprint was incomplete. Try again.',diagnostics:{providerStatus:200,providerCode:code,model:'gemma-4-26b-a4b-it',attempts:2,finishReason:'<script>'+key+'</script>',textLength:key,raw:file.name,image:'/9j/2wBDAAAAAA=='}}},502));
    await t.analyzePhoto();assert.match(t.photoModal(),/Generation details/);assert.match(t.photoModal(),new RegExp(code));assert.match(t.photoModal(),/2 attempts/);
    assert.doesNotMatch(t.photoModal(),/<details[^>]*open|<script>|test-key-for-memory-only-checks|\/9j\/2wBDAAAAAA==/,'details stay collapsed and omit unknown provider fields');
    assert.equal(t.ai.photo.file,file);assert.equal(t.ai.photo.progressTimer,null);assert.equal(t.ai.photo.timeout,null);
  }
  const slowGeneration=deferred();h.setFetch((url,options)=>{options.signal.addEventListener('abort',()=>slowGeneration.reject(new DOMException('Aborted','AbortError')),{once:true});return slowGeneration.promise;});
  const slowTask=t.analyzePhoto();await tick();
  assert.equal(t.ai.photo.diagnostics,'','a retry clears old generation diagnostics');
  h.advance(24000);assert.equal(h.doc.querySelector('[data-photo-progress]').textContent,'Generating blueprint · 24s');
  h.advance(12000);assert.equal(h.doc.querySelector('[data-photo-progress]').textContent,'Still generating · 36s');
  assert.doesNotMatch(t.photoModal(),/Mapping the shape|[0-9]+%/,'elapsed status does not invent processing stages or completion percentages');
  h.advance(73999);assert.equal(h.network.at(-1).options.signal.aborted,false);
  h.advance(1);await slowTask;
  assert.match(t.ai.photo.error,/took too long/);assert.equal(t.ai.photo.file,file,'timeout retains photo for another generation attempt');
  assert.equal(t.ai.photo.progressTimer,null);assert.equal(t.ai.photo.timeout,null);assert.equal([...h.timers.values()].filter(timer=>timer.repeat).length,0);
  const stoppedProgress=h.doc.querySelector('[data-photo-progress]').textContent;h.advance(5000);assert.equal(h.doc.querySelector('[data-photo-progress]').textContent,stoppedProgress,'elapsed updates stop after timeout');
  for(const stopDecode of [()=>h.click('cancel-photo'),()=>h.advance(110000)]){
    h.setImageHang(true);t.openModal('photo');t.choosePhoto(file);const beforeDecode=h.network.length;
    const decodeTask=t.analyzePhoto();await tick();const decodeUrl=h.photoUrls.at(-1);
    assert.equal(h.network.length,beforeDecode,'a pending decode does not send an API request');
    stopDecode();await decodeTask;
    assert.equal(t.ai.photo.busy,false);assert.equal(t.ai.photo.progressTimer,null);assert.equal(t.ai.photo.timeout,null);
    assert.ok(h.revokedUrls.includes(decodeUrl),'aborting a hung image decode releases its temporary URL');
    assert.equal(t.ai.photo.file,file);h.setImageHang(false);
  }
  for(const cancel of [()=>h.click('cancel-photo'),()=>t.choosePhoto({...file,name:'replacement.jpg'}),()=>t.closeModal(),()=>h.click('disconnect-gemma')]){
    t.ai.key=key;t.openModal('photo');t.choosePhoto(file);const abandonedUrl=t.state.previewUrl;const pending=deferred();h.setFetch(()=>pending.promise);const task=t.analyzePhoto();await tick();
    const request=h.network.at(-1);cancel();assert.equal(request.options.signal.aborted,true);
    assert.equal(t.ai.photo.progressTimer,null);assert.equal(t.ai.photo.timeout,null);assert.equal([...h.timers.values()].filter(timer=>timer.repeat).length,0,'cancel, replace, close and disconnect clear photo timers immediately');
    pending.resolve(response({...analysis,blueprint:{...blueprint,title:'Stale blueprint'}}));await task;
    assert.equal(t.ai.photo.result,null,'replaced, closed or disconnected photo ignores late results');
    assert.equal(t.generated.blueprint.title,blueprint.title);assert.equal(t.generated.photoUrl,firstPhotoUrl);
    if(t.state.previewUrl!==abandonedUrl)assert.ok(h.revokedUrls.includes(abandonedUrl),'replaced/closed previews release their blob URLs');
  }
  t.ai.key=key;t.closeModal();t.ai.input='Old photo question';const staleQuestion=deferred();
  h.setFetch((url)=>url==='/api/explore'?staleQuestion.promise:response({...analysis,blueprint:{...blueprint,title:'New cup'}}));
  const oldQuestionTask=t.askQuestion();const oldQuestionRequest=h.network.at(-1);
  t.openModal('photo');t.choosePhoto(file);const secondPhotoUrl=t.state.previewUrl,oldGeneratedViewer=t.runtime.instance;
  await t.analyzePhoto();await tick();
  assert.equal(oldGeneratedViewer.disposed,true);assert.equal(oldQuestionRequest.options.signal.aborted,true);
  assert.ok(h.revokedUrls.includes(firstPhotoUrl),'replacing generated study releases the prior photo URL');
  assert.equal(t.generated.photoUrl,secondPhotoUrl);assert.equal(t.generated.blueprint.title,'New cup');
  staleQuestion.resolve(response(sceneResult));await oldQuestionTask;
  assert.equal(t.state.object,'generated');assert.equal(t.ai.answer,null,'old generated answers cannot contaminate a replacement study');
  t.chooseObject('lamp');t.ai.input='Explain this lamp';h.setFetch(()=>response({answer:'LEDs emit light.',actions:[],sourceIds:[]}));await t.askQuestion();
  assert.equal(Object.hasOwn(JSON.parse(h.network.at(-1).options.body),'blueprint'),false,'preset questions do not send a stored generated study');
  t.openModal('gemma');h.click('disconnect-gemma');assert.equal(t.ai.key,'');
  assert.doesNotMatch(JSON.stringify([...h.storage])+JSON.stringify(h.urls)+JSON.stringify(h.log),new RegExp(key));
  t.closeModal();t.openModal('photo');t.choosePhoto(file);await t.analyzePhoto();
  assert.equal(t.state.modal,'gemma');assert.equal(t.ai.connectReturn,'photo');
  h.setFetch(()=>response({ok:true,model:'gemma-4-31b-it'}));await t.connectGemma({querySelector:()=>({value:key})});
  assert.equal(t.state.modal,'photo','photo analysis returns to the selected photo after connection');
  assert.equal(t.ai.photo.file,file);
  const retryHarness=await boot(), retryState=retryHarness.t;
  retryState.openModal('gemma');
  retryHarness.setFetch(()=>response({error:{code:'provider_unavailable',message:'Google could not serve either Gemma model.',diagnostics:{providerStatus:503,providerCode:'UNAVAILABLE',model:'gemma-4-26b-a4b-it',attempts:3}}},503));
  await retryState.connectGemma({querySelector:()=>({value:key})});
  assert.equal(retryState.ai.key,'','failed connection must not be marked connected');
  assert.equal(retryState.ai.connectRetryKey,key,'transient retry uses only closure memory');
  assert.match(retryState.gemmaModal(),/data-action="retry-connect"/);
  assert.match(retryState.gemmaModal(),/Google 503/);
  assert.doesNotMatch(retryState.gemmaModal()+JSON.stringify([...retryHarness.storage])+JSON.stringify(retryHarness.urls)+JSON.stringify(retryHarness.log),new RegExp(key));
  retryHarness.setFetch(()=>response({ok:true,model:'gemma-4-26b-a4b-it'}));
  await retryState.connectGemma(null,retryState.ai.connectRetryKey);
  assert.equal(retryState.ai.model,'gemma-4-26b-a4b-it');
  assert.equal(retryState.ai.connectRetryKey,'');
  await retryState.apiRequest('/api/explore',{});
  assert.equal(retryHarness.network.at(-1).options.headers['X-Gemma-Model'],'gemma-4-26b-a4b-it','requests reuse the actual successful model');
  retryHarness.setFetch(()=>response({configured:false,model:'gemma-4-31b-it'}));
  await retryState.refreshStatus();assert.equal(retryState.ai.model,'gemma-4-26b-a4b-it','background status cannot overwrite an established connection model');
  retryState.openModal('gemma');retryHarness.click('disconnect-gemma');
  retryHarness.setFetch(()=>response({error:{code:'provider_unavailable',message:'Try again.'}},503));
  await retryState.connectGemma({querySelector:()=>({value:key})});
  retryState.closeModal();assert.equal(retryState.ai.connectRetryKey,'','closing clears the unverified retry key');
  retryState.openModal('gemma');
  retryHarness.setFetch(()=>response({error:{code:'invalid_key',message:'Replace this key.'}},401));
  await retryState.connectGemma({querySelector:()=>({value:key})});
  assert.equal(retryState.ai.connectRetryKey,'','authentication failures do not retain a retry key');
  console.log('PASS: photo-first home, deep links, drop/picker validation, local-preview gating, intro lifecycle and failure fallbacks, early generation with late reference failure, no-key setup, connection, memory-only key handling, question-to-scene actions, escaped answers, real source links, action bounds, stale question/camera prevention, provider errors, explicit photo generation, custom-object blueprint rendering, generated Q&A scope, escaped generated content, memory-only study and photo lifecycle, uncertain/invalid blueprint handling, stale photo/question cancellation, disconnect/reconnect, transient connection retry, safe generation diagnostics, independent photo deadline, true elapsed status and timer cleanup, and successful-model reuse. Mocked network/DOM only; no live Gemma or browser/WebGL claim.');
})().catch(error=>{console.error(error);process.exitCode=1;});
