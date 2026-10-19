/* ROADPULSE 4.0 — destination-aware Street Parking Finder.
 * No automated scraping of satellite tiles. No false live vacancy/probability claims.
 * OSM street geometry + assumption-driven traffic/parking demand + optional local field observations.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const S={enabled:false,items:[],lots:[],busy:false,selected:null,request:0,lastCenter:null,destination:'',searched:false};
const state=()=>window.RoadPulseState||{};
const greek=()=>state().lang!=='en';
const t=(el,en)=>greek()?el:en;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const raster=()=>window.RoadPulseRasterActive;
const core=()=>window.RoadPulseStreetCore;
const n=(v,d=0)=>Number(v).toLocaleString(greek()?'el-GR':'en-GB',{maximumFractionDigits:d});
const names={
 promising:['Πιο υποσχόμενος','More promising'],
 mixed:['Μέτρια προτεραιότητα','Medium priority'],
 difficult:['Χαμηλή προτεραιότητα','Low priority'],
 restricted:['Πιθανοί περιορισμοί','Possible restrictions'],
 unknown:['Άγνωστη νομιμότητα','Unknown eligibility']
};
const label=k=>names[k]?.[greek()?0:1]||names.unknown[greek()?0:1];
const tone=k=>({promising:'#13b67c',mixed:'#f0a72b',difficult:'#eb6866',restricted:'#7e8ea4',unknown:'#7e8ea4'})[k]||'#7e8ea4';
function planned(){
 const v=$('streetArrival')?.value||'';
 const m=v.match(/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)$/);
 if(!m)return null;
 const hour=Number(m[2])+Number(m[3])/60;if(hour>=24)return null;
 return {date:m[1],hour,raw:v};
}
function center(){
 const p=raster()?.getCenter();
 if(Number.isFinite(p?.lat)&&Number.isFinite(p?.lon))return p;
 return state().center||{lat:40.63544,lon:22.9368};
}
function parkingLink(lat,lon){
 return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(Number(lat).toFixed(6)+','+Number(lon).toFixed(6))+'&travelmode=driving';
}
function timeLabel(){
 const p=planned();return p?p.raw.replace('T',' '):'—';
}
function status(s){if($('streetStatus'))$('streetStatus').textContent=s;}
function observationInfo(road,when){
 const evidence=window.RoadPulseEvidenceCore;
 if(!evidence||!when)return null;
 try{
  const raw=JSON.parse(localStorage.getItem('roadpulse.parking.evidence.v1')||'[]');
  const records=evidence.sanitizeRecords(raw);
  const predicted=evidence.forecast(records,{lat:road.lat,lon:road.lon,kind:'street',at:new Date(when.raw).toISOString()});
  return predicted.points[0]?.result||null;
 }catch{return null;}
}
function predictionFor(road,when,where){
 const base=core().priority(road,{...when,lat:road.lat,lon:road.lon});
 const obs=observationInfo(road,when);
 if(base.score===null||!obs)return {...base,observations:null};
 const score=Math.max(3,Math.min(95,Math.round(base.score+(50-obs.occupiedPercent)*0.20)));
 return {...base,score,tier:score>=56?'promising':score>=37?'mixed':'difficult',
  observations:{count:obs.sampleCount,days:obs.days,occupiedPercent:obs.occupiedPercent},calibrated:false};
}
function repaint(){
 const m=raster();
 if(typeof m?.setStreets==='function')m.setStreets(S.enabled?S.items:[],r=>{S.selected=String(r.id);render();});
}
function rerank(){
 if(!S.enabled||!S.items.length)return;
 const when=planned();if(!when||!core())return;
 S.items=S.items.map(item=>({...item,...predictionFor(item,when,S.lastCenter)}));
 repaint();render();
}
function card(road){
 const selected=S.selected===String(road.id);
 const score=road.score===null?'—':n(road.score)+'/100';
 const name=road.name||t('Ανώνυμο οδικό τμήμα','Unnamed road segment');
 const trust=road.status==='tagged'?t('OSM: δηλωμένη στάθμευση','OSM: mapped parking'):
   road.status==='unknown'?t('Νομιμότητα μη επιβεβαιωμένη','Legal status unverified'):
   t('Πιθανός περιορισμός','Possible restriction');
 const seen=road.observations?
  '<small>'+t('Τοπικά δείγματα: ','Local samples: ')+n(road.observations.count)+' / '+n(road.observations.days)+' '+t('ημέρες','days')+'</small>':'';
 return '<article class="street-result'+(selected?' selected':'')+'"><button type="button" data-street="'+esc(road.id)+'" class="street-result-select">'+
  '<span class="street-color" style="background:'+tone(road.tier)+'"></span><span class="street-result-copy"><b>'+esc(name)+'</b><small>'+esc(label(road.tier))+' · '+n(road.distanceKm*1000)+'m '+t('ευθεία','straight-line')+'</small>'+seen+'</span>'+
  '<strong>'+score+'</strong></button><div class="street-result-meta">'+esc(trust)+'</div><a href="'+parkingLink(road.lat,road.lon)+'" target="_blank" rel="noopener noreferrer" class="street-route">'+t('Διαδρομή ↗','Navigate ↗')+'</a></article>';
}
function facility(p){
 const kind=p.fee==='free'?t('OSM: δωρεάν (δήλωση)','OSM: free (mapped)'):p.fee==='paid'?t('OSM: επί πληρωμή','OSM: paid'):t('Τιμή άγνωστη','Price unknown');
 const km=core().distanceKm(S.lastCenter.lat,S.lastCenter.lon,p.lat,p.lon);
 return '<article class="street-facility"><div><b>'+esc(p.name||t('Οργανωμένο πάρκινγκ','Mapped parking facility'))+'</b><small>'+esc(kind)+' · '+n(km,2)+' km '+t('ευθεία','straight line')+' · '+t('διαθεσιμότητα άγνωστη','vacancies unknown')+'</small></div><a href="'+parkingLink(p.lat,p.lon)+'" target="_blank" rel="noopener noreferrer">'+t('Πήγαινε ↗','Navigate ↗')+'</a></article>';
}
function render(){
 const root=$('streetResults');if(!root)return;
 if(!S.enabled){root.innerHTML='';return;}
 if(S.busy){root.innerHTML='<p class="street-empty">'+t('Φόρτωση δεδομένων OSM…','Loading OSM data…')+'</p>';return;}
 const usable=S.items.filter(r=>r.score!==null&&r.tier!=='restricted'&&r.tier!=='unknown');
 const unique=new Set();
 const best=[...usable].sort((a,b)=>(b.score||0)-(a.score||0)||a.distanceKm-b.distanceKm).filter(r=>{
  const key=(r.name||r.id).toLowerCase();if(unique.has(key))return false;unique.add(key);return true;
 });
 const extra=S.items.length-usable.length;
 root.innerHTML='<div class="street-results-heading"><b>'+t('Προτεινόμενοι δρόμοι αναζήτησης','Suggested streets to search')+'</b><small>'+
 n(best.length)+' '+t('υποψήφιοι δρόμοι','candidate roads')+' · '+n(extra)+' '+t('άγνωστα/περιορισμένα τμήματα','unknown/restricted segments')+'</small></div>'+
 (best.length?best.slice(0,10).map(card).join(''):'<p class="street-empty">'+t('Δεν υπάρχουν επαρκή στοιχεία εδώ. Δοκίμασε μεγαλύτερη περιοχή ή οργανωμένο parking.','Not enough mapped evidence. Try another area or a parking facility.')+'</p>')+
 '<h4 class="street-facilities-title">'+t('Εναλλακτικά οργανωμένα πάρκινγκ','Alternative parking facilities')+'</h4>'+
 (S.lots.length?S.lots.slice(0,6).map(facility).join(''):'<p class="street-empty">'+t('Δεν επιστράφηκαν χώροι από OSM. Δες και το THESi.','No OSM facilities returned. Check THESi as well.')+'</p>')+
 '<div class="street-disclaimer">'+t('Οι τιμές 0–100 είναι συγκριτικοί, υποθετικοί δείκτες αναζήτησης. ΔΕΝ είναι ποσοστά πιθανότητας εύρεσης θέσης. Η δορυφορική εικόνα είναι αρχείου, χωρίς γνωστή ώρα λήψης και χωρίς ανίχνευση αυτοκινήτων. Κάθε δρόμος χρειάζεται έλεγχο επιτόπιας σήμανσης.','Scores 0–100 are relative, assumption-based search rankings, NOT probabilities of finding a free bay. Satellite imagery is archival, without verified capture time or vehicle detection. Always check on-site parking restrictions.')+'</div>';
 learningInfo();
}
function learningInfo(){
 const el=$('streetLearning');if(!el)return;
 const c=window.RoadPulseEvidenceCore,here=S.lastCenter||{lat:40.63544,lon:22.9368};
 if(!c){el.textContent=t('Δεν υπάρχει μοντέλο αυτοψιών.','Field observation model not available.');return;}
 let records=[];
 try{records=c.sanitizeRecords(JSON.parse(localStorage.getItem('roadpulse.parking.evidence.v1')||'[]'));}catch{}
 const total=records.length;
 const covered=records.filter(r=>r.kind==='street'&&r.cell===c.grid(here.lat,here.lon));
 const days=new Set(covered.map(r=>r.at.slice(0,10))).size;
 let bt={ready:false};
 try{bt=c.backtest(records,{lat:here.lat,lon:here.lon,kind:'street'});}catch{}
 el.textContent=t('LEARNING LAB · ','LEARNING LAB · ')+n(total)+t(' αυτοψίες σε αυτή τη συσκευή · ',' local observations on this device · ')+n(covered.length)+
  t(' στον επιλεγμένο τομέα σε ',' in the destination area across ')+n(days)+t(' ημέρες. ',' days. ')+
  (bt.ready?t('Ιστορικό σφάλμα πληρότητας: ','Historical occupancy error: ')+n(bt.maePercentagePoints,1)+t(' ποσοστιαίες μονάδες (μικρό, μεροληπτικό δείγμα). ',' percentage points (small, biased sample). '):
  t('Ανεπαρκή δείγματα για αξιόπιστη αξιολόγηση. ','Not enough data for a meaningful backtest. '))+
  t('Δεν υπάρχει συνεχής εκπαίδευση ή live ανάλυση δορυφόρου.','No continuous training or live satellite analysis is active.');
}
function language(){
 $('streetHeading').textContent=t('Βρες πού να ψάξεις για πάρκινγκ','Find where to search for parking');
 $('streetDestLabel').textContent=t('Πού θέλεις να πας;','Where are you going?');
 $('streetArrivalLabel').textContent=t('Πότε θα φτάσεις;','When will you arrive?');
 $('streetDestination').placeholder=t('π.χ. Λαδάδικα, Θεσσαλονίκη','e.g. Ladadika, Thessaloniki');
 $('streetFind').textContent=t('Ανάλυση δρόμων ↗','Analyze streets ↗');
 $('streetToggle').textContent=S.enabled?t('Απόκρυψη χρωματισμού','Hide street colors'):t('Χρωματισμός δρόμων','Color streets');
 $('streetSatellite').textContent=t('▧ Δορυφορικό υπόβαθρο','▧ Satellite background');
 $('streetLadadika').textContent=t('Λαδάδικα','Ladadika');
 $('streetObservation').textContent=t('Καταχώριση αυτοψίας ↗','Add field observation ↗');
 $('streetExplanation').textContent=t('Ο χρωματισμός βασίζεται σε διαθέσιμους δρόμους OSM, ώρα άφιξης και υποθετικά μοτίβα ζήτησης. Με επαρκείς δικές σου αυτοψίες συνυπολογίζονται τα τοπικά δείγματα. Δεν υπάρχει live δορυφορική ανίχνευση.','Colors combine OSM street context, arrival time, and uncalibrated demand scenarios. Sufficient local observations can influence estimates. No live satellite vehicle detection.');
 learningInfo();
 $('streetMapShortcut').textContent=t('Ⓟ Βρες θέση κοντά στον προορισμό ↗','Ⓟ Find parking near destination ↗');
 if(S.enabled)render();
}
async function loadAt(c,destination){
 if(!core())return;
 if(!Number.isFinite(c.lat)||!Number.isFinite(c.lon))return;
 const id=++S.request;S.busy=true;S.enabled=true;S.lastCenter={lat:c.lat,lon:c.lon};S.destination=destination;S.selected=null;
 S.items=[];S.lots=[];
 $('streetToggle').textContent=t('Απόκρυψη χρωματισμού','Hide street colors');
 status(t('Εντοπισμός δρόμων και parking από OpenStreetMap…','Finding OSM streets and parking facilities…'));
 render();repaint();
 const p=new URLSearchParams({lat:c.lat.toFixed(5),lon:c.lon.toFixed(5),radius:'850'});
 const lots=new URLSearchParams({lat:c.lat.toFixed(5),lon:c.lon.toFixed(5),radius:'1500'});
 raster()?.setView(c.lat,c.lon,16);
 const [streetsResult,lotsResult]=await Promise.allSettled([
   fetch('/api/streets?'+p,{headers:{Accept:'application/json'}}).then(async r=>{if(!r.ok)throw Error('Street data HTTP '+r.status);return r.json()}),
   fetch('/api/parking?'+lots,{headers:{Accept:'application/json'}}).then(async r=>{if(!r.ok)throw Error('Parking data HTTP '+r.status);return r.json()})
 ]);
 if(id!==S.request)return;
 S.busy=false;
 const when=planned();
 if(streetsResult.status==='fulfilled'){
  const rows=Array.isArray(streetsResult.value.items)?streetsResult.value.items:[];
  S.items=rows.map(r=>({...r,...(when?predictionFor(r,when,c):core().priority(r,{lat:c.lat,lon:c.lon,hour:12}))}));
 } else S.items=[];
 if(lotsResult.status==='fulfilled')S.lots=(lotsResult.value.items||[]).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&!['no','private','customers','permit'].includes(x.access||'')).sort((a,b)=>a.distanceKm-b.distanceKm);
 else S.lots=(state().parking||[]).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)).slice(0,10);
 repaint();render();
 if(streetsResult.status==='rejected')status(t('Δεν απάντησε το OSM για δρόμους. Οι πραγματικά κενές θέσεις παραμένουν άγνωστες.','OSM street lookup failed. Actual free spaces remain unknown.'));
 else status(t('Ανάλυση για ','Analysis for ')+destination+' · '+timeLabel()+' · '+t('OSM, όχι live δορυφόρος','OSM, not live satellite'));
}
async function search(){
 const name=$('streetDestination').value.trim();
 if(name.length<2){status(t('Γράψε προορισμό.','Enter a destination.'));return;}
 const manual=/λαδ[αά]δικ|ladadik/i.test(name);
 if(manual){await loadAt({lat:40.63544,lon:22.9368},t('Λαδάδικα, Θεσσαλονίκη','Ladadika, Thessaloniki'));return;}
 status(t('Αναζήτηση διεύθυνσης…','Searching destination…'));
 try{
  const q=new URLSearchParams({q:name,lang:greek()?'el':'en',lat:'40.635',lon:'22.94'});
  const r=await fetch('/api/search?'+q,{headers:{Accept:'application/json'}});if(!r.ok)throw Error();
  const j=await r.json(),hit=j.items?.find(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon));
  if(!hit)throw Error();await loadAt({lat:hit.lat,lon:hit.lon},hit.name||name);
 }catch{status(t('Η γεωκωδικοποίηση απέτυχε. Δοκίμασε «Λαδάδικα».','Geocoding failed. Try Ladadika.'));}
}
function init(){
 const mount=$('streetSearchMount');if(!mount||!core())return;
 mount.innerHTML='<section class="street-finder" aria-label="Street parking search"><div class="street-finder-kicker">ROADPULSE · PARKING FINDER 4.0</div>'+
 '<h3 id="streetHeading"></h3><p id="streetExplanation"></p>'+
 '<label class="street-field"><span id="streetDestLabel"></span><input id="streetDestination" type="search" value="Λαδάδικα, Θεσσαλονίκη" autocomplete="off" maxlength="100"/></label>'+
 '<div class="street-row"><label class="street-field"><span id="streetArrivalLabel"></span><input id="streetArrival" type="datetime-local"/></label><button id="streetFind" class="street-primary" type="button"></button></div>'+
 '<div class="street-actions"><button id="streetLadadika" type="button"></button><button id="streetToggle" type="button"></button><button id="streetSatellite" type="button"></button></div>'+
 '<div class="street-legend"><span><i style="background:#13b67c"></i>'+t('Καλύτερη σχετική προτεραιότητα','Higher relative priority')+'</span><span><i style="background:#f0a72b"></i>'+t('Μέτρια','Medium')+'</span><span><i style="background:#eb6866"></i>'+t('Χαμηλή','Low')+'</span><span><i style="background:#7e8ea4"></i>'+t('Άγνωστο','Unknown')+'</span></div>'+
 '<p id="streetStatus" class="street-status" role="status"></p><div id="streetResults"></div>'+
 '<div id="streetLearning" class="street-learning"></div><button id="streetObservation" class="street-observation" type="button"></button></section>';
 const date=new Date(Date.now()+30*60000);
 $('streetArrival').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).replace(' ','T').slice(0,16);
 $('streetFind').addEventListener('click',search);
 $('streetDestination').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
 $('streetArrival').addEventListener('change',rerank);
 $('streetLadadika').addEventListener('click',()=>{$('streetDestination').value='Λαδάδικα, Θεσσαλονίκη';loadAt({lat:40.63544,lon:22.9368},t('Λαδάδικα, Θεσσαλονίκη','Ladadika, Thessaloniki'));});
 $('streetToggle').addEventListener('click',()=>{S.enabled=!S.enabled;language();if(S.enabled){if(S.items.length)repaint();else search();}else{S.request++;S.busy=false;repaint();status(t('Ο χρωματισμός είναι κρυμμένος.','Street colors hidden.'));}});
 $('streetSatellite').addEventListener('click',()=>document.querySelector('[data-map-style="satellite"]')?.click());
 $('streetObservation').addEventListener('click',()=>{
  const btn=document.querySelector('.top-nav [data-view="forecast"]')||document.querySelector('.mobile-dock [data-view="forecast"]');
  btn?.click();window.RoadPulsePressureLabs?.select('parking');
  setTimeout(()=>$('evidenceRoot')?.scrollIntoView({behavior:'smooth',block:'start'}),50);
 });
 $('streetResults').addEventListener('click',e=>{
  const btn=e.target.closest('[data-street]');if(!btn)return;
  const road=S.items.find(r=>String(r.id)===btn.dataset.street);if(!road)return;
  S.selected=String(road.id);raster()?.setView(road.lat,road.lon,17);render();
 });
 $('streetMapShortcut')?.addEventListener('click',()=>{
  (document.querySelector('.top-nav [data-view="parking"]')||document.querySelector('.mobile-dock [data-view="parking"]'))?.click();
  if(!S.enabled)$('streetFind')?.click();
 });
 $('langBtn')?.addEventListener('click',()=>setTimeout(language,0));
 window.addEventListener('roadpulse:raster-ready',repaint);
 language();
 status(t('Επίλεξε Λαδάδικα ή γράψε προορισμό για ανάλυση.','Choose Ladadika or enter a destination.'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();