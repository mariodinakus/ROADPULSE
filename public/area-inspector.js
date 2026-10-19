/* ROADPULSE 3.8 — Area Intelligence.
 * Orange circles are provider-reported incidents, NOT parking vacancy indicators.
 * Live sample and two forecast scenarios are distinctly labelled.
 * No imagery recognition and no scraped THESi occupancy. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const gr=()=>window.RoadPulseState?.lang!=='en';
 const t=(el,en)=>gr()?el:en;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
 const fmt=(v,d=0)=>Number(v).toLocaleString(gr()?'el-GR':'en-GB',{maximumFractionDigits:d});
 const asDate=iso=>{const ms=Date.parse(iso);return Number.isFinite(ms)?new Intl.DateTimeFormat(gr()?'el-GR':'en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Athens'}).format(new Date(ms)):'—'};
 const engine=()=>window.RoadPulsePrediction;
 const field=()=>window.RoadPulseEvidenceCore;
 const distance=(a,b,c,d)=>{
  const k=Math.PI/180,dx=(c-a)*k,dy=(d-b)*k;
  return 12742*Math.asin(Math.min(1,Math.sqrt(Math.sin(dx/2)**2+Math.cos(a*k)*Math.cos(c*k)*Math.sin(dy/2)**2)));
 };
 let current=null,live=null,busy=false,generation=0;
 const kindName=kind=>({
  accident:t('Τροχαίο ατύχημα','Traffic accident'),
  roadWorks:t('Οδικά έργα','Road works'),
  roadClosed:t('Κλειστός δρόμος','Road closure'),
  laneClosed:t('Κλειστή λωρίδα','Lane closure'),
  jam:t('Κυκλοφοριακή συμφόρηση','Traffic congestion')
 })[kind]||t('Κυκλοφοριακό συμβάν','Traffic incident');
 function clock(when,zone){
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',
   hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(when);
  const v=k=>p.find(x=>x.type===k)?.value;
  return {date:v('year')+'-'+v('month')+'-'+v('day'),hour:Number(v('hour')),
   weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(v('weekday'))};
 }
 function tile(minutes,point,unit){
   return '<div class="area-intel-horizon"><small>'+(minutes===0?t('Τώρα','Now'):'+'+minutes+'m')+
    '</small><b>'+(point?fmt(point.score)+unit:'—')+'</b><span>'+(point?fmt(point.low)+'–'+fmt(point.high):'—')+'</span></div>';
 }
 function plan(){
  const p=current,model=engine();
  if(!p||!model)return null;
  try{
   const centre=model.locality(p.lat,p.lon),rain=!!$('pressureRain')?.checked,event=!!$('pressureEvent')?.checked;
   const buckets=[0,30,60,120].map(minutes=>{
    const moment=new Date(Date.now()+minutes*60000);
    const c=clock(moment,centre.zone);
    const result=model.parkingForecast({date:c.date,lat:p.lat,lon:p.lon,rain,event});
    return {minutes,detail:result.points[c.hour],hour:c.hour,weekday:c.weekday};
   });
   const first=buckets[0],w=first.weekday,hr=first.hour;
   const base=model.parkingHour(hr,w,0,false,false);
   const local=model.parkingHour(hr,w,centre.centrality,false,false);
   const withRain=model.parkingHour(hr,w,centre.centrality,rain,false);
   const adjusted=model.parkingHour(hr,w,centre.centrality,rain,event);
   const extra=local-base,weather=withRain-local,eventEffect=adjusted-withRain;
   return {buckets,first,base,extra,weather,eventEffect,rain,event,centre};
  }catch{return null}
 }
 function evidence(){
  const p=current,c=field();
  if(!p||!c)return '';
  try{
   const raw=JSON.parse(localStorage.getItem('roadpulse.parking.evidence.v1')||'[]');
   const records=c.sanitizeRecords(raw),types=p.kind==='parking'?['lot']:['street','thesi'];
   const rows=types.map(kind=>({kind,data:c.forecast(records,{lat:p.lat,lon:p.lon,kind})}));
   const enough=rows.filter(x=>x.data.points[0].result);
   if(!enough.length)return '<p class="area-intel-p">'+t('Δεν υπάρχουν επαρκείς τοπικές αυτοψίες για εκτίμηση πραγματικής πληρότητας.','Not enough local field counts to estimate observed occupancy.')+'</p>';
   return enough.map(row=>{
    const f=row.data.points[0].result;
    return '<div class="area-intel-driver"><span>'+esc(row.kind==='lot'?t('Οργανωμένο πάρκινγκ','Car park'):row.kind==='thesi'?'THESi':t('Άλλος δρόμος','Other street'))+'</span><b>'+fmt(f.occupiedPercent)+'% ('+fmt(f.sampleCount)+' '+t('μετρήσεις','records')+')</b></div>';
   }).join('')+'<p class="area-intel-p">'+t('Μόνο δικές σου αυτοψίες, όχι ανεξάρτητα επιβεβαιωμένα δεδομένα.','Your unverified observations only, not independently measured occupancy.')+'</p>';
  }catch{return ''}
 }
 function nearby(){
  const list=window.RoadPulseState?.incidents||[];
  const count=list.filter(x=>num(x.lat)!==null&&num(x.lon)!==null&&distance(current.lat,current.lon,x.lat,x.lon)<=.6).length;
  return t('Αναφορές TomTom έως ~600 μ. από το σημείο (μόνο στο φορτωμένο δείγμα): ',
    'TomTom reports within ~600m (current loaded sample only): ')+fmt(count);
 }
 function incidentBlock(){
  if(current.kind==='incident'){
   const p=current;
   const delay=num(p.delaySeconds),length=num(p.lengthMeters);
   const fields=[
    [t('Είδος','Type'),kindName(p.type)],
    [t('Σοβαρότητα παρόχου','Provider severity'),String(p.severity||t('Άγνωστη','Unknown'))],
    [t('Αναφερόμενη καθυστέρηση','Reported delay'),delay!==null?'+'+fmt(Math.round(delay/60))+' '+t('λεπτά','min'):t('Δεν αναφέρεται','Not reported')],
    [t('Μήκος επίδρασης','Affected distance'),length!==null?fmt(Math.round(length))+' m':t('Άγνωστο','Unknown')]
   ];
   const road=[p.from,p.to].filter(Boolean).map(esc).join(' → ');
   return '<section class="area-intel-section"><div class="area-intel-kicker">TOMTOM / INCIDENT DETAILS</div>'+
    '<h4>'+t('Τι συμβαίνει εδώ;','What is happening here?')+'</h4>'+
    '<p class="area-intel-p">'+esc(p.description||kindName(p.type))+'</p>'+
    (road?'<p class="area-intel-strong">'+road+'</p>':'')+
    fields.map(x=>'<div class="area-intel-driver"><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('')+
    (p.reportedAt?'<p class="area-intel-p">'+t('Τελευταία αναφορά: ','Last provider report: ')+esc(asDate(p.reportedAt))+'</p>':'')+
    '<p class="area-intel-p">'+t('Ο πορτοκαλί κύκλος είναι συμβάν TomTom, όχι αισθητήρας κενής θέσης.',
       'The orange circle marks a TomTom incident, not a free-parking sensor.')+'</p></section>';
  }
  if(current.kind==='parking'){
   const p=current,cap=num(p.capacity);
   return '<section class="area-intel-section"><div class="area-intel-kicker">PARKING ATLAS / POINT OF INTEREST</div>'+
    '<h4>'+t('Τι γνωρίζουμε για το πάρκινγκ;','What do we know about this car park?')+'</h4>'+
    '<p class="area-intel-p">'+esc(p.address||t('Χωρίς διεύθυνση','No address'))+'</p>'+
    '<div class="area-intel-driver"><span>'+t('Πηγή καταχώρισης','Mapped source')+'</span><b>'+esc(p.source||'TomTom / OSM')+'</b></div>'+
    '<div class="area-intel-driver"><span>'+t('Χωρητικότητα','Recorded capacity')+'</span><b>'+esc(cap!==null?fmt(cap):'—')+'</b></div>'+
    '<div class="area-intel-driver"><span>'+t('Διαθέσιμες θέσεις τώρα','Vacant spaces now')+'</span><b>'+t('Άγνωστο','Unknown')+'</b></div>'+
    '<p class="area-intel-p">'+t('Η καταχώριση τοποθεσίας δεν συνεπάγεται διαθεσιμότητα θέσης.',
    'A mapped car park does not imply any spaces are currently available.')+'</p></section>';
  }
  return '<section class="area-intel-section"><div class="area-intel-kicker">LOCAL / AREA CONTEXT</div>'+
    '<p class="area-intel-p">'+esc(nearby())+'</p>'+
    '<p class="area-intel-p">'+t('Η ανάλυση αφορά το επιλεγμένο σημείο, όχι ολόκληρη την πόλη.',
     'The analysis refers to the selected location, not the entire city.')+'</p></section>';
 }
 function parkingBlock(){
  const forecast=plan();
  if(!forecast)return '<p>'+t('Το μοντέλο ζήτησης δεν είναι διαθέσιμο.','Demand model unavailable.')+'</p>';
  const {buckets,first,base,extra,weather,eventEffect,centre}=forecast;
  const outcome=buckets.map(b=>tile(b.minutes,b.detail,'')).join('');
  const factor=(label,value)=>'<div class="area-intel-driver"><span>'+label+'</span><b>'+ (value>0?'+':'')+fmt(value)+'</b></div>';
  return '<section class="area-intel-section"><div class="area-intel-kicker">PARKING PRESSURE / SCENARIO v1.0</div>'+
    '<h4>'+t('Πρόβλεψη ζήτησης θέσεων (0–100)','Parking demand forecast (0–100)')+'</h4>'+
    '<div class="area-intel-horizons">'+outcome+'</div>'+
    '<div class="area-intel-kicker">'+t('Πώς βγαίνει ο δείκτης;','How is the index calculated?')+'</div>'+
    factor(t('Βασική καμπύλη ημέρας και ώρας','Time-of-day and weekday baseline'),base)+
    factor(t('Παραδοχή κεντρικότητας περιοχής','Assumed urban centrality'),extra)+
    factor(t('Σενάριο βροχής','Manual rain scenario'),weather)+
    factor(t('Σενάριο εκδήλωσης','Manual event scenario'),eventEffect)+
    '<div class="area-intel-driver"><span>'+t('Τελικός δείκτης','Final index')+'</span><b>'+fmt(first.detail.score)+'/100</b></div>'+
    '<p class="area-intel-p">'+t('Εύρη ευαισθησίας, όχι στατιστική βεβαιότητα. Δεν είναι ποσοστό κατάληψης, πιθανότητα να βρεις θέση ή εκτίμηση πλήθους ελεύθερων θέσεων.',
    'Sensitivity ranges, not calibrated confidence intervals. Not occupancy, vacancy probability, or a free-space count.')+'</p>'+
    '<p class="area-intel-p">'+t('Συνθήκες: ','Context: ')+esc(centre.name)+
    ' · '+t('υποθετικές καμπύλες ζήτησης','assumed time-demand profile')+'</p></section>';
 }
 function renderTraffic(){
  const host=$('areaTrafficBody');
  if(!host||!current)return;
  if(busy&&live===null){
   host.innerHTML='<p class="area-intel-loading">'+t('Ανάκτηση πραγματικών δειγμάτων κυκλοφορίας από TomTom…',
    'Loading real TomTom traffic observations…')+'</p>';return;
  }
  if(!live){
   host.innerHTML='<p class="area-intel-bad">'+t('Δεν υπάρχουν αρκετά πρόσφατα δεδομένα TomTom εδώ. Δεν εμφανίζεται τεχνητή πρόβλεψη.',
    'Fresh TomTom data is not available here. No fabricated traffic forecast.')+'</p>';return;
  }
  const p=current,model=engine();
  const result=model?.trafficForecast({snapshot:live,lat:p.lat,lon:p.lon});
  if(!result){
   host.innerHTML='<p class="area-intel-bad">'+t('Τα ζωντανά δείγματα είναι παλιά ή ανεπαρκή. Ζήτησε νέα μέτρηση.',
    'The samples have expired or are insufficient. Refresh for a new measurement.')+'</p>';return;
  }
  const samples=(live.segments||[]).slice(0,5).map(s=>
   '<div class="area-intel-driver"><span>'+t('Δρόμος-δείγμα ','Sample road ')+esc(s.id)+
   '</span><b>'+fmt(s.currentSpeed)+' / '+fmt(s.freeFlowSpeed)+' km/h</b></div>').join('');
  host.innerHTML='<div class="area-intel-kpis"><div><small>'+t('Παρατηρούμενη επιβράδυνση','Observed slowing')+'</small><strong>'+
   fmt(live.slowdownIndex)+'/100</strong></div><div><small>'+t('Δείγματα δρόμων','Road samples')+'</small><strong>'+
   fmt(live.sampleCount)+'/'+fmt(live.requestedSamples)+'</strong></div><div><small>'+
   t('Τελευταία μέτρηση','Measured at')+'</small><strong>'+esc(asDate(live.asOf))+'</strong></div></div>'+
   '<h4>'+t('Εκτιμώμενη εξέλιξη','Scenario-based next 2 hours')+'</h4>'+
   '<div class="area-intel-horizons">'+result.points.filter(x=>x.minutes>0).map(x=>tile(x.minutes,x,'')).join('')+'</div>'+
   '<div class="area-intel-kicker">'+t('Τι μετρήθηκε;','Observed road segments')+'</div>'+samples+
   '<p class="area-intel-p">'+t('Το μοντέλο ξεκινά από τη μετρημένη επιβράδυνση και τη συνδυάζει με υποθετική καμπύλη ώρας και σταδιακή μείωση της επίδρασης. Δεν είναι επαληθευμένη πρόβλεψη ούτε μέσος όρος πόλης.',
     'The model anchors on measured slowing, then decays toward an assumed time-of-day baseline. Not historically validated or citywide.')+'</p>';
 }
 function render(){
  const panel=$('areaIntelPanel');if(!panel||!current)return;
  const kind=current.kind,title=current.kind==='incident'?kindName(current.type):
    current.kind==='parking'?(current.name||t('Χώρος στάθμευσης','Parking place')):
    t('Ανάλυση επιλεγμένης περιοχής','Selected-area analysis');
  $('areaIntelKind').textContent=current.kind==='incident'?'ORANGE PIN · TOMTOM INCIDENT':
    current.kind==='parking'?'PARKING PLACE · TOMTOM/OSM':'AREA INTELLIGENCE · SELECTED POINT';
  $('areaIntelTitle').textContent=title;
  $('areaIntelLocation').textContent=fmt(current.lat,5)+', '+fmt(current.lon,5);
  $('areaEventBody').innerHTML=incidentBlock();
  $('areaParkingBody').innerHTML=parkingBlock();
  $('areaEvidenceBody').innerHTML=evidence()||'<p class="area-intel-p">'+t('Δεν υπάρχουν τοπικές αυτοψίες.','No local field observations.')+'</p>';
  $('areaSatelliteBody').textContent=t('Ο δορυφορικός χάρτης περιλαμβάνει εικόνες αρχείου (Esri World Imagery). Ημερομηνία λήψης και πραγματικά ελεύθερες θέσεις: άγνωστα. Δεν γίνεται ανίχνευση οχημάτων από τη δορυφορική εικόνα.',
   'The satellite map uses archived imagery (Esri World Imagery). Capture date and actual parking vacancies are unknown. Vehicle detection from imagery is not performed.');
  $('areaAction').textContent=t('Ανάλυση σημείου στα Pressure Labs ↗','Analyse this location in Pressure Labs ↗');
  $('areaSatelliteAction').textContent=t('▧ Εμφάνιση δορυφορικού χάρτη','▧ Show satellite imagery');
  $('areaTrafficTitle').textContent=t('Κυκλοφορία γύρω από το σημείο','Traffic near this point');
  renderTraffic();
  panel.hidden=false;
 }
 async function loadFlow(point){
  const seq=++generation;
  live=null;busy=true;renderTraffic();
  try{
   const q=new URLSearchParams({lat:String(point.lat.toFixed(5)),lon:String(point.lon.toFixed(5))});
   const response=await fetch('/api/pressure?'+q,{headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('TomTom sample unavailable');
   const body=await response.json();
   if(seq!==generation||!current)return;
   live=body?.live===true?body:null;
  }catch{if(seq===generation)live=null}
  finally{if(seq===generation){busy=false;renderTraffic()}}
 }
 function inspect(detail){
  const lat=Number(detail?.lat),lon=Number(detail?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>80||Math.abs(lon)>180)return;
  current={...detail,lat,lon,kind:['incident','parking','area'].includes(detail.kind)?detail.kind:'area'};
  live=null;busy=true;render();
  loadFlow(current);
 }
 function close(){
  generation++;current=null;live=null;busy=false;
  $('areaIntelPanel').hidden=true;
 }
 function init(){
  const host=document.querySelector('.map-section');
  if(!host)return;
  const panel=document.createElement('aside');
  panel.id='areaIntelPanel';panel.className='area-intel';panel.hidden=true;
  panel.setAttribute('role','region');
  panel.setAttribute('aria-label','ROADPULSE Area Intelligence');
  panel.innerHTML=
   '<div class="area-intel-head"><div><div class="area-intel-eyebrow" id="areaIntelKind"></div>'+
   '<h3 id="areaIntelTitle"></h3><p class="area-intel-sub" id="areaIntelLocation"></p></div>'+
   '<button class="area-intel-close" id="areaIntelClose" type="button" aria-label="Close panel">×</button></div>'+
   '<div id="areaEventBody"></div>'+
   '<section class="area-intel-section"><div class="area-intel-kicker">PARKING PRESSURE / MODEL</div><div id="areaParkingBody"></div></section>'+
   '<section class="area-intel-section"><div class="area-intel-kicker">TRAFFIC PRESSURE / TOMTOM</div>'+
   '<h4 id="areaTrafficTitle"></h4><div id="areaTrafficBody"></div></section>'+
   '<section class="area-intel-section"><div class="area-intel-kicker">PARKING EVIDENCE / USER RECORDS</div>'+
   '<h4>FIELD OBSERVATIONS</h4><div id="areaEvidenceBody"></div></section>'+
   '<section class="area-intel-section"><div class="area-intel-kicker">SATELLITE / IMAGERY</div>'+
   '<p class="area-intel-p" id="areaSatelliteBody"></p>'+
   '<button class="area-intel-secondary" id="areaSatelliteAction" type="button">Satellite</button></section>'+
   '<button class="area-intel-cta" id="areaAction" type="button">Pressure Labs ↗</button>';
  host.appendChild(panel);
  $('areaIntelClose').addEventListener('click',close);
  $('areaAction').addEventListener('click',()=>{
    if(!current)return;
    window.dispatchEvent(new CustomEvent('roadpulse:inspect-analyse',{detail:{lat:current.lat,lon:current.lon}}));
    close();
  });
  $('areaSatelliteAction').addEventListener('click',()=>{
    document.querySelector('[data-map-style="satellite"]')?.click();
  });
  window.addEventListener('roadpulse:inspect-point',e=>inspect(e.detail));
  $('langBtn')?.addEventListener('click',()=>setTimeout(()=>{if(current)render()},0));
  window.addEventListener('roadpulse:city',()=>{if(current){generation++;close()}});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&current)close()});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
