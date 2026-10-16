/* ROADPULSE 3.4 · two independent, clearly labelled civic labs. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const lang=()=>window.RoadPulseState?.lang==='en'?'en':'el';
 const gr=()=>lang()==='el';
 const txt=(el,en)=>gr()?el:en;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const messages={
  hero:['Η πόλη σε αριθμούς.','Read the city in numbers.'],
  subtitle:['Δύο ανεξάρτητα μοντέλα: ζήτηση στάθμευσης και πραγματική επιβράδυνση σε δείγματα δρόμων.','Two independent models: assumed parking demand and observed slowing on sampled roads.'],
  liveBadge:['LIVE ROAD DATA','LIVE ROAD DATA'],
  trafficTitle:['Πόσο πιέζονται οι δρόμοι;','How much are roads slowing down?'],
  trafficDesc:['Σύγκριση τωρινής ταχύτητας με την ταχύτητα ελεύθερης ροής σε έως 5 κοντινά οδικά τμήματα.','Current versus free-flow speeds from up to five nearby road segments.'],
  noData:['Δεν έχουν φορτωθεί δεδομένα','Data not loaded'],
  notForecast:['Τωρινή εικόνα, όχι πρόβλεψη','Current snapshot, not a forecast'],
  currentSpeed:['Τρέχουσα ταχύτητα','Current speed'],freeFlowSpeed:['Ελεύθερη ροή','Free-flow speed'],roadSamples:['Δείγματα δρόμων','Road samples'],
  segmentHeading:['Επιβράδυνση ανά δείγμα','Slowdown by sample'],
  segmentHelp:['0 = φυσιολογική ροή · 100 = πλήρης διακοπή','0 = normal flow · 100 = stopped'],
  clickLoad:['Πάτησε «Ανανέωση» για πραγματικές μετρήσεις.','Press refresh for observed road speeds.'],
  loadLive:['↻ Φόρτωση ζωντανής κίνησης','↻ Load live road speeds'],
  sampledNotCitywide:['Τοπικό δείγμα · όχι μέσος όρος πόλης','Local sample · not a citywide average'],
  methodNote:['Ο δείκτης είναι ο μέσος όρος ποσοστιαίας μείωσης ταχύτητας στα διαθέσιμα δείγματα. Δεν αποτελεί πρόβλεψη, χρόνο διαδρομής ή ποσοστό κορεσμού ολόκληρης της Θεσσαλονίκης.','The index averages percentage speed reductions across available samples. It is not a future forecast, route travel time or the congestion rate of the entire city.'],
  readMethod:['Πηγή / τεκμηρίωση TomTom ↗','TomTom data / API documentation ↗']
 };
 let mode='parking',last=null,lastCoords=null,busy=false,reqNumber=0,lastLoadAt=0;
 function gpsCenter(){
  const c=window.RoadPulseState?.center||{lat:40.634,lon:22.944};
  return {lat:Number(c.lat),lon:Number(c.lon)};
 }
 function key(c){return c.lat.toFixed(3)+','+c.lon.toFixed(3)}
 function statusLabel(score){
  return score>=70?txt('Πολύ έντονη επιβράδυνση','Severe slowing'):
    score>=40?txt('Σημαντική επιβράδυνση','Significant slowing'):
    score>=15?txt('Ήπια επιβράδυνση','Mild slowing'):txt('Σχετικά ομαλή ροή στα δείγματα','Relatively smooth sampled traffic');
 }
 function colorFor(score){return score>=70?'high':score>=40?'medium':'low'}
 function updatePeek(){
  if(!last||!lastCoords||lastCoords!==key(gpsCenter())){
    $('peekTraffic').textContent='—';
    $('peekTrafficDesc').textContent=txt('Άνοιξε για live μέτρηση','Open for live data');
  } else {
    $('peekTraffic').textContent=last.slowdownIndex+'/100';
    $('peekTrafficDesc').textContent=txt('TomTom · ', 'TomTom · ')+last.sampleCount+'/5';
  }
 }
 function localize(){
  document.querySelectorAll('[data-pressure-i18n]').forEach(node=>{
    const pair=messages[node.dataset.pressureI18n];if(pair)node.textContent=pair[gr()?0:1];
  });
  $('peekParkingDesc').textContent=txt('Υποθετικό μοντέλο','Scenario-based model');
  if(!last)$('peekTrafficDesc').textContent=txt('Άνοιξε για live μέτρηση','Open for live data');
  if(last)renderLive(last);
  $('trafficPressureArea').textContent=txt('Σημείο ανάλυσης: ','Analysis centre: ')+coordsDescription();
 }
 function coordsDescription(){
  const p=gpsCenter();
  return p.lat.toFixed(4)+', '+p.lon.toFixed(4);
 }
 function select(which){
  mode=which==='traffic'?'traffic':'parking';
  for(const [name,btnId,panelId] of [['parking','labParking','parkingPressurePanel'],['traffic','labTraffic','trafficPressurePanel']]){
   const on=name===mode;
   const b=$(btnId),panel=$(panelId);
   b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;
   b.classList.toggle('active',on);
   panel.hidden=!on;
  }
  if(mode==='parking'){
   window.RoadPulseCivic?.forecast();
  }else {
   $('trafficPressureArea').textContent=txt('Σημείο ανάλυσης: ','Analysis centre: ')+coordsDescription();
   if(!last||lastCoords!==key(gpsCenter())||Date.now()-lastLoadAt>120000)load();
   else renderLive(last);
  }
 }
 function renderLive(data){
  if(!data||!Array.isArray(data.segments))return;
  const score=Number(data.slowdownIndex);
  $('trafficPressureScore').textContent=score;
  $('trafficScoreDial').style.setProperty('--pressure',score);
  $('trafficScoreDial').dataset.level=colorFor(score);
  $('trafficSeverity').textContent=statusLabel(score);
  const iso=Date.parse(data.asOf),time=Number.isFinite(iso)?new Intl.DateTimeFormat(gr()?'el-GR':'en-GB',{timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'}).format(iso):'—';
  $('trafficPressureTime').textContent=txt('Τελευταία μέτρηση: ','Last sampled: ')+time;
  $('trafficCurrentSpeed').textContent=data.currentKmh+' km/h';
  $('trafficFreeSpeed').textContent=data.freeFlowKmh+' km/h';
  $('trafficSampleCount').textContent=data.sampleCount+' / '+data.requestedSamples;
  $('trafficSourceStatus').textContent='● TOMTOM LIVE';
  $('trafficSegmentBars').innerHTML=data.segments.map(s=>{
   const val=Math.min(100,Math.max(0,Number(s.slowdownPercent)||0));
   const name=txt('Δείγμα ','Sample ')+s.id,quality=s.confidence==null?'':txt(' · εμπιστοσύνη ',' · confidence ')+s.confidence+'%';
   const closed=s.closed?txt(' · ΚΛΕΙΣΤΟΣ ΔΡΟΜΟΣ',' · ROAD CLOSED'):'';
   return '<div class="flow-sample"><div class="flow-sample-head"><b>'+escape(name)+'</b><span>'+val+'%'+escape(closed)+'</span></div><div class="flow-track"><span class="flow-fill '+colorFor(val)+'" style="width:'+val+'%"></span></div><small>'+s.currentSpeed+' / '+s.freeFlowSpeed+' km/h'+escape(quality)+'</small></div>';
  }).join('');
  $('trafficPressureArea').textContent=txt('Σημείο ανάλυσης: ','Analysis centre: ')+coordsDescription();
  updatePeek();
 }
 async function load(force=false){
  const center=gpsCenter(),k=key(center);
  if(busy)return;
  if(!force&&last&&lastCoords===k&&Date.now()-lastLoadAt<120000){renderLive(last);return;}
  busy=true;
  const btn=$('refreshTrafficPressure'),error=$('trafficPressureError');
  btn.disabled=true;
  $('trafficSourceStatus').textContent=txt('Φόρτωση…','Loading…');
  error.hidden=true;
  const generation=++reqNumber;
  try{
   const q=new URLSearchParams({lat:center.lat.toFixed(5),lon:center.lon.toFixed(5)});
   const response=await fetch('/api/pressure?'+q,{headers:{Accept:'application/json'}});
   const result=await response.json();
   if(!response.ok)throw Error(result?.error||'Unable to retrieve road flow');
   if(generation!==reqNumber||k!==key(gpsCenter()))return;
   last=result;lastCoords=k;lastLoadAt=Date.now();
   renderLive(result);
  }catch(err){
   if(generation!==reqNumber)return;
   const previous=last&&lastCoords===k;
   $('trafficSourceStatus').textContent=txt('ΜΗ ΔΙΑΘΕΣΙΜΟ','UNAVAILABLE');
   if(!previous){
    $('trafficPressureScore').textContent='—';$('trafficCurrentSpeed').textContent='—';
    $('trafficFreeSpeed').textContent='—';$('trafficSampleCount').textContent='—';
    $('trafficSeverity').textContent=txt('Δεν υπάρχουν επιβεβαιωμένες μετρήσεις','No verified flow data available');
    $('trafficSegmentBars').textContent=txt('Δεν εμφανίζεται εκτίμηση χωρίς δεδομένα TomTom.','No invented values when TomTom data is unavailable.');
   }
   error.textContent=previous?txt('Αποτυχία ανανέωσης. Τα προηγούμενα δεδομένα είναι παλιότερα.','Refresh failed; previous snapshot may be stale.'):txt('Δεν έγινε σύνδεση με το TomTom Flow. Δοκίμασε αργότερα.','TomTom Flow could not be reached. Try later.');
   error.hidden=false;
  }finally{busy=false;btn.disabled=false;}
 }
 function attach(){
  $('labParking')?.addEventListener('click',()=>select('parking'));
  $('labTraffic')?.addEventListener('click',()=>select('traffic'));
  $('refreshTrafficPressure')?.addEventListener('click',()=>load(true));
  for(const id of ['labParking','labTraffic'])$(id)?.addEventListener('keydown',e=>{
   if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
   e.preventDefault();
   const next=id==='labParking'?'traffic':'parking';select(next);$(next==='traffic'?'labTraffic':'labParking').focus();
  });
  document.addEventListener('click',e=>{
   const b=e.target.closest('[data-pressure-tab]');
   if(b){select(b.dataset.pressureTab);return;}
   if(e.target.closest('[data-view="forecast"]'))select(mode);
  });
  window.addEventListener('roadpulse:parking-pressure',e=>{
   if(!e.detail)return;
   const val=Math.max(0,Math.min(100,Number(e.detail.score)||0));
   $('peekParking').textContent=val+'/100';
  });
  window.addEventListener('roadpulse:city',()=>{
   last=null;lastCoords=null;lastLoadAt=0;reqNumber++;
   updatePeek();
   $('trafficSourceStatus').textContent='—';
   $('trafficPressureScore').textContent='—';
   $('trafficSeverity').textContent=txt('Επίλεξε ενημέρωση για την περιοχή','Load local road samples');
   $('trafficSegmentBars').textContent=txt('Περιμένουμε νέα μετρημένα δεδομένα για το επιλεγμένο σημείο.','Waiting for flow data for the selected point.');
   $('trafficPressureArea').textContent=txt('Σημείο ανάλυσης: ','Analysis centre: ')+coordsDescription();
   if(mode==='traffic'&&window.RoadPulseState?.view==='forecast')load();
  });
  $('langBtn')?.addEventListener('click',localize);
  localize();
  updatePeek();
  window.RoadPulseCivic?.forecast();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach);else attach();
 window.RoadPulsePressureLabs={select,refresh:()=>load(true)};
})();
