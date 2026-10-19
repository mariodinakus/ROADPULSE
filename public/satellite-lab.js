/* ROADPULSE 4.1 Satellite Observatory + locally trained parking pattern lab.
 * Archival Sentinel-2 scene metadata fetched from a fixed server proxy; imagery from Esri
 * is NOT time-synchronised with listed STAC scenes. No autonomous CV or background trainer.
 */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),CORE=()=>window.RoadPulseSatelliteLearningCore;
 const DATA_KEY='roadpulse.satelliteLearning.v1';
 const seenKey='roadpulse.satelliteScenesSeen.v1';
 const STATE={coord:{lat:40.63544,lon:22.9368},place:'Λαδάδικα, Θεσσαλονίκη',scenes:[],index:0,checkedAt:null,loading:false,loadingSeq:0,records:[],loadedOnce:false,seen:[]};
 const el=()=>window.RoadPulseState?.lang!=='en';
 const t=(a,b)=>el()?a:b;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=(v,n=0)=>Number(v).toLocaleString(el()?'el-GR':'en-GB',{maximumFractionDigits:n});
 const stamp=(s)=>{try{return new Intl.DateTimeFormat(el()?'el-GR':'en-GB',{timeZone:'Europe/Athens',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s))}catch{return '—'}};
 const nowLocal=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').slice(0,16);
 function persist(){
  try{localStorage.setItem(DATA_KEY,JSON.stringify(STATE.records));return true}catch{return false}
 }
 function saved(){
  try{return CORE().sanitize(JSON.parse(localStorage.getItem(DATA_KEY)||'[]'))}catch{return []}
 }
 function saveSeen(){
  try{localStorage.setItem(seenKey,JSON.stringify(STATE.seen.slice(-100)))}catch{}
 }
 function hydrateSeen(){
  try{const raw=JSON.parse(localStorage.getItem(seenKey)||'[]');STATE.seen=Array.isArray(raw)?raw.filter(v=>typeof v==='string').slice(-100):[]}catch{STATE.seen=[]}
 }
 function catalogueStatus(message){const e=$('satLabStatus');if(e)e.textContent=message;}
 function sceneDisplay(){
  const scenes=STATE.scenes,index=Number($('satSceneRange')?.value||0);
  const chosen=scenes[Math.max(0,Math.min(index,scenes.length-1))];
  const host=$('satSceneDetails');if(!host)return;
  const scroll=$('satSceneRange');
  if(scroll){scroll.max=String(Math.max(0,scenes.length-1));scroll.disabled=!scenes.length;scroll.value=String(Math.max(0,Math.min(index,scenes.length-1)))}
  if(!chosen){
   host.innerHTML='<p>'+t('Δεν υπάρχουν ακόμη καταχωρημένες λήψεις για την επιλεγμένη περιοχή/περίοδο ή η υπηρεσία δεν απάντησε.','No indexed acquisitions returned for this area/time window, or the catalog could not respond.')+'</p>';return;
  }
  const hours=(Date.now()-Date.parse(chosen.captureAt))/3600000,age=hours<24?fmt(Math.max(0,hours),1)+' h':fmt(hours/24,1)+' '+t('ημέρες','days');
  const cloud=chosen.cloudPercent==null?'—':fmt(chosen.cloudPercent,1)+'%';
  const url=chosen.sourceUrl&&chosen.sourceUrl.startsWith('https://earth-search.aws.element84.com/')?chosen.sourceUrl:null;
  host.innerHTML='<div class="sat-scene-kpis"><div><small>'+t('Χρόνος λήψης','Acquired')+'</small><strong>'+esc(stamp(chosen.captureAt))+'</strong></div>'+
   '<div><small>'+t('Ηλικία λήψης','Age')+'</small><strong>'+esc(age)+'</strong></div><div><small>'+t('Νέφωση σκηνής','Scene cloud cover')+'</small><strong>'+esc(cloud)+'</strong></div>'+
   '<div><small>'+t('Ελάχιστο pixel','Smallest pixel')+'</small><strong>10 m</strong></div></div>'+
   '<p>'+t('Sentinel-2: χρήσιμη για περιβαλλοντική/αστική ανάλυση, ΑΚΑΤΑΛΛΗΛΗ για τον εντοπισμό αυτοκινήτων ή ελεύθερων θέσεων. Η δορυφορική βάση Esri είναι διαφορετική εικόνα, χωρίς γνωστό χρόνο λήψης.','Sentinel-2: useful for environmental/urban context but NOT capable of spotting individual cars or empty bays. The Esri satellite basemap is a different image of unknown capture date.')+'</p>'+
   (url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+t('Άνοιγμα πρωτογενούς καταχώρισης ↗','View source STAC record ↗')+'</a>':'');
  $('satScenePosition').textContent=(index+1)+' / '+scenes.length;
 }
 function renderModel(){
  const out=$('satLearningSummary');if(!out||!CORE())return;
  const c=CORE(),q=STATE.coord,cell=c.grid(q.lat,q.lon);
  const coverage=c.coverage(STATE.records,cell);
  const queryAt=new Date().toISOString(),model=c.estimate(STATE.records,{...q,at:queryAt});
  const backtest=c.backtest(STATE.records,q);
  const history=STATE.records.filter(r=>r.cell===cell).slice(-6).reverse();
  out.innerHTML='<div class="sat-learning-grid"><div><small>'+t('Επιβεβαιωμένες καταγραφές','Verified input records')+'</small><b>'+fmt(coverage.count)+'</b></div>'+
   '<div><small>'+t('Διαφορετικές ημέρες','Separate days')+'</small><b>'+fmt(coverage.days)+'</b></div>'+
   '<div><small>'+t('Από εικόνες υψηλής ανάλυσης','From high-res image review')+'</small><b>'+fmt(coverage.imageryCounts)+'</b></div>'+
   '<div><small>'+t('Από αυτοψίες','Eyewitness counts')+'</small><b>'+fmt(coverage.fieldCounts)+'</b></div></div>'+
   '<div class="sat-learning-result">'+(model?
    '<strong>'+t('Εκτιμώμενη πληρότητα','Estimated occupancy')+': '+fmt(model.occupiedPercent)+'%</strong><span>'+t('Εύρος ευαισθησίας','Sensitivity range')+' '+fmt(model.low)+'–'+fmt(model.high)+'% · '+t('όχι πιθανότητα ελεύθερης θέσης','not chance of finding a bay')+'</span>':
    '<strong>'+t('Μοντέλο: ανεπαρκή δεδομένα','Model: insufficient data')+'</strong><span>'+t('Χρειάζονται ≥8 καταγραφές σε ≥3 ημέρες και παρόμοιες ώρες, στην ίδια ζώνη ~260 μ.','Requires ≥8 observations over ≥3 days and similar hours in the same ~260m grid.')+'</span>')+'</div>'+
   '<div class="sat-learning-result"><strong>'+t('Ιστορική αξιολόγηση','Historical backtest')+'</strong><span>'+
   (backtest.ready?t('Μέσο απόλυτο σφάλμα','Mean absolute error')+': '+fmt(backtest.maePercentagePoints,1)+' '+t('ποσοστιαίες μονάδες','percentage points')+' · '+fmt(backtest.evaluated)+' '+t('επαληθεύσεις','holdout evaluations'):
     t('Δεν υπάρχουν αρκετά εκτός δείγματος δεδομένα για αξιολόγηση.','Insufficient historical out-of-sample comparisons for quality assessment.'))+'</span></div>'+
   '<p class="sat-learning-foot">'+t('Τοπική μάθηση μόνο σε αυτή τη συσκευή. Δεν υπάρχει κοινή βάση, αυτόματη αναγνώριση αυτοκινήτων ή συνεχής εκπαίδευση στον server.','Local learning on this device only. No shared model, automatic car detection or background server training exists.')+'</p>'+
   (history.length?'<details><summary>'+t('Πρόσφατες μετρήσεις','Recent observations')+'</summary>'+
    history.map(r=>'<p class="sat-history">'+esc(stamp(r.at))+' · '+fmt(r.free)+'/'+fmt(r.total)+' '+t('κενές','free')+' · '+esc(r.origin==='licensed-imagery'?t('Χειροκίνητη ανάλυση αδειοδοτημένης εικόνας','Human-verified licensed image'):t('Αυτοψία','Eyewitness'))+'</p>').join('')+'</details>':'');
 }
 function locale(){
  if(!$('satLabRoot'))return;
  $('satLabTitle').textContent=t('Satellite Observatory & Learning Lab','Satellite Observatory & Learning Lab');
  $('satLabIntro').textContent=t('Ελέγχουμε πραγματικούς χρόνους λήψεων Sentinel-2, αλλά δεν μετατρέπουμε τη χαμηλή ανάλυση σε ψεύτικες κενές θέσεις. Οι νέες επιβεβαιωμένες παρατηρήσεις εκπαιδεύουν ένα τοπικό στατιστικό μοντέλο.','Explore authentic Sentinel-2 acquisition timestamps without pretending the pixels show available bays. Add verified counts to train a local statistical occupancy model.');
  $('satRefresh').textContent=t('↻ Έλεγχος νέων λήψεων','↻ Refresh acquisitions');
  $('satCloudCaption').textContent=t('Ιστορικές λήψεις για','Historical acquisitions near');
  $('satTimelineLabel').textContent=t('Χρονογραμμή ημερομηνιών λήψης (μεταδεδομένα, όχι εναλλαγή εικόνας)','Acquisition timeline (metadata, not image switching)');
  $('satLearnTitle').textContent=t('Εκπαίδευση από αληθινές μετρήσεις','Train with real verified counts');
  $('satLearnIntro').textContent=t('Επίλεξε αυτοψία ή χειροκίνητα επαληθευμένη εικόνα υψηλής ανάλυσης με άδεια. Δεν γίνεται αυτόματη μέτρηση από εικόνα.','Use an eyewitness count or manually checked, licensed very-high-resolution imagery. No automated counting from satellite pixels.');
  $('satSourceLabel').textContent=t('Πηγή μέτρησης','Observation origin');
  $('satSourceField').textContent=t('Αυτοψία επιτόπου','Eyewitness on site');
  $('satSourceImagery').textContent=t('Αδειοδοτημένη εικόνα + χειροκίνητη καταμέτρηση','Licensed image + human-verified counts');
  $('satAtLabel').textContent=t('Χρόνος μέτρησης (ώρα συσκευής)','Observation time (device local time)');
  $('satTotalLabel').textContent=t('Θέσεις που καταμετρήθηκαν','Total counted bays');
  $('satFreeLabel').textContent=t('Από αυτές, κενές','Of those, free');
  $('satSceneIdLabel').textContent=t('Αναγνωριστικό λήψης/εικόνας','Image/capture identifier');
  $('satGsdLabel').textContent=t('Ανάλυση εικόνας (μέτρα/pixel, ≤0.5)','Image pixel size (meters/pixel, ≤0.5)');
  $('satRightsLabel').textContent=t('Επιβεβαιώνω ότι έχω άδεια χρήσης της εικόνας και ότι μέτρησα οπτικά τις θέσεις.','I confirm I have rights to use this imagery and personally verified the counts.');
  $('satSubmit').textContent=t('Αποθήκευση πραγματικής παρατήρησης ↗','Save real observation ↗');
  $('satMonitoring').textContent=t('Ο δημόσιος κατάλογος ελέγχεται όταν ανοίγεις την εφαρμογή και ανά 30 λεπτά όσο είναι ανοιχτή. Δεν υπάρχει συνεχής κάμερα ή εγγύηση λήψεων κάθε 15 λεπτά.','The public catalog is queried on page load and every 30 minutes while open. There is no continuous camera or guarantee of a new capture every 15 minutes.');
  $('satSource').dispatchEvent(new Event('change'));
  $('satCloudArea').textContent=STATE.place;
  sceneDisplay();renderModel();
 }
 async function loadScenes(){
  STATE.loading=true;const run=++STATE.loadingSeq;
  catalogueStatus(t('Ανάκτηση πραγματικών χρονικών μεταδεδομένων από Earth Search…','Fetching acquisition metadata from Earth Search…'));
  const loc=STATE.coord;
  try{
   const p=new URLSearchParams({lat:loc.lat.toFixed(5),lon:loc.lon.toFixed(5),days:'60'});
   const resp=await fetch('/api/satellite-scenes?'+p,{headers:{Accept:'application/json'}});
   if(!resp.ok)throw Error('catalogue_'+resp.status);
   const data=await resp.json();
   if(run!==STATE.loadingSeq)return;
   STATE.scenes=Array.isArray(data.items)?data.items:[];
   STATE.index=0;
   STATE.checkedAt=data.checkedAt||new Date().toISOString();
   const known=new Set(STATE.seen),newItems=STATE.scenes.filter(s=>!known.has(s.id)).length;
   for(const scene of STATE.scenes)if(typeof scene.id==='string')STATE.seen.push(scene.id);
   STATE.seen=[...new Set(STATE.seen)].slice(-100);saveSeen();
   catalogueStatus(t('Κατάλογος ελέγχθηκε ','Catalog checked ')+stamp(STATE.checkedAt)+
    ' · '+fmt(STATE.scenes.length)+' '+t('λήψεις 60 ημερών','scenes over 60 days')+
    ' · '+fmt(STATE.loadedOnce?newItems:0)+' '+t('νέες από τελευταίο έλεγχο','new since previous check'));
   STATE.loadedOnce=true;
   sceneDisplay();
  }catch{
   if(run!==STATE.loadingSeq)return;
   catalogueStatus(t('Η υπηρεσία δορυφορικού καταλόγου δεν απάντησε. Δεν εμφανίζουμε επινοημένες λήψεις.','Satellite catalogue currently unavailable. No synthetic acquisitions are displayed.'));
   STATE.scenes=[];sceneDisplay();
  }finally{if(run===STATE.loadingSeq)STATE.loading=false;}
 }
 function sourceChange(){
  const imagery=$('satSource')?.value==='licensed-imagery';
  const panel=$('satImageryInputs');
  if(panel)panel.hidden=!imagery;
 }
 function submit(e){
  e.preventDefault();
  const note=$('satFormMessage');
  try{
   const origin=$('satSource').value,at=new Date($('satAt').value).toISOString();
   const sample={origin,lat:STATE.coord.lat,lon:STATE.coord.lon,at,
     total:Number($('satTotal').value),free:Number($('satFree').value)};
   if(origin==='licensed-imagery'){
    sample.sceneId=$('satSceneId').value.trim();sample.gsdMeters=Number($('satGsd').value);
    sample.captureAt=at;sample.licensed=$('satRights').checked;sample.manuallyVerified=$('satRights').checked;
   }
   STATE.records=CORE().append(STATE.records,sample);
   if(!persist())throw Error(t('Δεν έγινε τοπική αποθήκευση.','Local storage unavailable.'));
   note.textContent=t('Η παρατήρηση αποθηκεύτηκε. Το τοπικό μοντέλο υπολογίστηκε ξανά.','Observation saved. Local model updated.');
   note.dataset.error='false';renderModel();
   window.dispatchEvent(new Event('roadpulse:learning-updated'));
  }catch(err){note.textContent=String(err.message||err);note.dataset.error='true';}
 }
 function init(){
  const host=$('satelliteLabMount');if(!host||!CORE())return;
  hydrateSeen();STATE.records=saved();
  host.innerHTML='<section id="satLabRoot" class="sat-lab"><div class="sat-kicker">ROADPULSE · SATELLITE LEARNING 4.1</div>'+
   '<h3 id="satLabTitle"></h3><p id="satLabIntro"></p>'+
   '<div class="sat-lab-head"><div><small id="satCloudCaption"></small><strong id="satCloudArea"></strong></div><button id="satRefresh" type="button"></button></div>'+
   '<p id="satLabStatus" class="sat-status" role="status"></p>'+
   '<label class="sat-timeline"><span id="satTimelineLabel"></span><input type="range" id="satSceneRange" min="0" max="0" value="0" step="1"/><small id="satScenePosition">—</small></label>'+
   '<div id="satSceneDetails" class="sat-scene-details"></div><div class="sat-archive-note" id="satMonitoring"></div>'+
   '<div class="sat-separator"></div><h4 id="satLearnTitle"></h4><p id="satLearnIntro"></p><div id="satLearningSummary"></div>'+
   '<form id="satLearningForm" class="sat-learning-form"><label><span id="satSourceLabel"></span><select id="satSource"><option id="satSourceField" value="eyewitness"></option><option id="satSourceImagery" value="licensed-imagery"></option></select></label>'+
   '<label><span id="satAtLabel"></span><input id="satAt" type="datetime-local" required/></label>'+
   '<div class="sat-count-row"><label><span id="satTotalLabel"></span><input type="number" id="satTotal" min="1" max="250" value="12" required/></label>'+
   '<label><span id="satFreeLabel"></span><input type="number" id="satFree" min="0" max="250" value="3" required/></label></div>'+
   '<div id="satImageryInputs" hidden><label><span id="satSceneIdLabel"></span><input id="satSceneId" type="text" maxlength="100" placeholder="Licensed capture ID"/></label>'+
   '<label><span id="satGsdLabel"></span><input id="satGsd" type="number" min="0.05" max="0.5" step="0.01" value="0.30"/></label>'+
   '<label class="sat-checkbox"><input id="satRights" type="checkbox"/><span id="satRightsLabel"></span></label></div>'+
   '<button id="satSubmit" type="submit"></button><p class="sat-form-message" id="satFormMessage" role="status"></p></form></section>';
  $('satAt').value=nowLocal();
  $('satSource').addEventListener('change',sourceChange);
  $('satSceneRange').addEventListener('input',sceneDisplay);
  $('satRefresh').addEventListener('click',loadScenes);
  $('satLearningForm').addEventListener('submit',submit);
  $('langBtn')?.addEventListener('click',()=>setTimeout(locale,0));
  window.addEventListener('roadpulse:parking-destination',e=>{
   const lat=Number(e.detail?.lat),lon=Number(e.detail?.lon);
   if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
   STATE.coord={lat,lon};STATE.place=String(e.detail?.name||t('Επιλεγμένη περιοχή','Selected area')).slice(0,90);
   $('satCloudArea').textContent=STATE.place;STATE.scenes=[];STATE.index=0;STATE.loadingSeq++;STATE.loading=false;sceneDisplay();renderModel();loadScenes();
  });
  window.addEventListener('roadpulse:city',()=>{
   if(STATE.place.includes('Λαδάδικα')&&$('streetDestination')?.value.includes('Λαδάδικα'))return;
   const c=window.RoadPulseState?.center;
   if(Number.isFinite(c?.lat)&&Number.isFinite(c?.lon)&&Math.hypot(c.lat-STATE.coord.lat,c.lon-STATE.coord.lon)>.01){
    STATE.coord={lat:c.lat,lon:c.lon};STATE.place=t('Επιλεγμένη περιοχή','Selected area');$('satCloudArea').textContent=STATE.place;renderModel();loadScenes();
   }
  });
  window.addEventListener('storage',e=>{if(e.key===DATA_KEY){STATE.records=saved();renderModel();window.dispatchEvent(new Event('roadpulse:learning-updated'));}});
  locale();loadScenes();
  setInterval(()=>{if(document.visibilityState==='visible')loadScenes()},30*60*1000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();