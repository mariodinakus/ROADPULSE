/* ROADPULSE CIVIC: verified THESi calculator, explainable parking demand index, location clarity. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const language = () => window.RoadPulseState?.lang === 'en' ? 'en' : 'el';
  const el = () => language() === 'el';
  const money = n => new Intl.NumberFormat(el() ? 'el-GR' : 'en-GB', {style:'currency',currency:'EUR'}).format(n);
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const calendarText = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T');
  function billing() {
    const input = $('thesiArrival'), mins = Number($('thesiMinutes')?.value || 60);
    const holiday = $('thesiHoliday')?.checked;
    if (!input?.value) return;
    const match = input.value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/);
    if(!match) return;
    const [_,y,m,d,h,minute] = match.map(Number);
    const start = Date.UTC(y,m-1,d,h,minute);
    let chargeMinutes = 0;
    for(let k=0; k<mins; k++){
      const at=new Date(start+k*60000), dow=at.getUTCDay(), hh=at.getUTCHours(), mm=at.getUTCMinutes(), time=hh*60+mm;
      const isHoliday=holiday && at.getUTCDate()===d && at.getUTCMonth()===m-1;
      const paid=!isHoliday && ((dow>=1&&dow<=5&&time>=480&&time<1260)||(dow===6&&time>=540&&time<960));
      if(paid) chargeMinutes++;
    }
    const total=1.7*chargeMinutes/60;
    $('thesiAmount').textContent=money(total);
    $('thesiBillable').textContent=el()
      ? chargeMinutes+' χρεώσιμα λεπτά · '+(mins-chargeMinutes)+' λεπτά εκτός ωραρίου'
      : chargeMinutes+' billable minutes · '+(mins-chargeMinutes)+' outside paid hours';
    $('thesiRules').textContent=el()
      ? 'Υπολογισμός μόνο για νόμιμη θέση επισκεπτών THESi (λευκή διαγράμμιση). Όριο 4 ώρες ανά τομέα. Για αργίες τσέκαρε το πεδίο· έλεγξε τη σήμανση.'
      : 'Only for eligible THESi visitor bays (white markings). Four-hour limit per sector. Mark public holidays manually and check street signs.';
  }
  function demand(hour, day, center, rain, event) {
    const weekday=day>=1&&day<=5, saturday=day===6;
    let score=center?36:29;
    if(weekday) {
      if(hour>=8&&hour<10) score+=23;
      else if(hour>=10&&hour<15)score+=32;
      else if(hour>=15&&hour<18)score+=23;
      else if(hour>=18&&hour<22)score+=20;
      else score+=3;
    } else if(saturday) {
      if(hour>=10&&hour<15)score+=28;
      else if(hour>=18&&hour<23)score+=27;
      else score+=7;
    } else {
      if(hour>=18&&hour<23)score+=23;
      else if(hour>=11&&hour<18)score+=17;
      else score+=3;
    }
    if(rain)score+=7;
    if(event)score+=11;
    return Math.round(Math.max(10,Math.min(95,score)));
  }
  function renderForecast() {
    const host=$('pressureBars'); if(!host)return;
    const state=window.RoadPulseState||{}, c=state.center||{lat:40.634,lon:22.944};
    const nearThess=Math.abs(c.lat-40.634)<.22&&Math.abs(c.lon-22.944)<.27;
    const center=Math.abs(c.lat-40.632)<.032&&Math.abs(c.lon-22.943)<.045;
    const day=$('pressureDate')?.value||calendarText().slice(0,10);
    const match=day.match(/^(\d{4})-(\d\d)-(\d\d)$/);if(!match)return;
    const dt=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))),wd=dt.getUTCDay();
    const rain=$('pressureRain')?.checked,event=$('pressureEvent')?.checked;
    const slots=Array.from({length:9},(_,i)=>{const hr=6+i*2;return {hour:hr,score:demand(hr,wd,center,rain,event)}});
    const nowHour=Number(calendarText().slice(11,13)), today=day===calendarText().slice(0,10);
    const usable=slots.filter(s=>!today||s.hour>=nowHour);
    const best=(usable.length?usable:slots).reduce((a,b)=>a.score<=b.score?a:b);
    host.innerHTML=slots.map(s=>{
      const label=s.score>=69?(el()?'Υψηλή':'High'):s.score>=49?(el()?'Μέτρια':'Medium'):(el()?'Χαμηλότερη':'Lower');
      return '<div class="pressure-hour" title="'+s.hour+':00 · '+s.score+'/100 · '+label+'"><span class="pressure-number">'+s.score+'</span><div class="pressure-track"><div style="height:'+s.score+'%" class="pressure-fill '+(s.score>=69?'high':s.score>=49?'medium':'low')+'"></div></div><span>'+String(s.hour).padStart(2,'0')+':00</span></div>';
    }).join('');
    $('pressureBest').textContent=(el()?'Σχετικά ηπιότερη περίοδος: ':'Relatively quieter window: ')+String(best.hour).padStart(2,'0')+':00 · '+best.score+'/100';
    $('pressureArea').textContent=!nearThess?(el()?'Εκτός Θεσσαλονίκης · γενικό υπόδειγμα':'Outside Thessaloniki · generic baseline'):(center?(el()?'Κέντρο Θεσσαλονίκης':'Thessaloniki centre'):(el()?'Ευρύτερη Θεσσαλονίκη':'Greater Thessaloniki'));
    $('pressureExplain').textContent=el()
      ? 'Πειραματικός δείκτης 0–100, όχι ποσοστό πληρότητας ή πιθανότητα θέσης. Βασίζεται αποκλειστικά σε υποθέσεις ώρας, ημέρας, περιοχής και στα χειροκίνητα σενάρια βροχής/εκδήλωσης. Δεν έχει εκπαιδευτεί ή ελεγχθεί με μετρημένη πληρότητα δρόμων.'
      : 'Experimental 0–100 demand-pressure index, not an occupancy percentage or vacancy probability. It uses assumed hour, weekday, area, and manual weather/event scenarios. It has not been trained or validated on measured on-street occupancy.';
  }
  async function locationChanged(detail) {
    const title=$('hereTitle'), secondary=$('hereSub'), status=$('hereStatus');
    if(!title||!secondary||!status)return;
    if(detail.error){
      title.textContent=el()?'Δεν βρέθηκε η θέση σου':'Location unavailable';
      secondary.textContent=el()?'Επίτρεψε το GPS από τις ρυθμίσεις του browser και ξαναπάτησε ◎.':'Allow location in the browser and press ◎ again.';
      status.textContent=el()?'Χωρίς άδεια':'No permission';
      return;
    }
    const {lat,lon,accuracy}=detail;
    title.textContent=el()?'Εντοπίστηκε η θέση σου':'Your position located';
    secondary.textContent=(el()?'GPS ακρίβεια ±':'GPS accuracy ±')+Math.round(accuracy)+' m · '+Number(lat).toFixed(5)+', '+Number(lon).toFixed(5);
    status.textContent=el()?'GPS ενεργό':'GPS active';
    try{
      const response=await fetch('/api/reverse?'+new URLSearchParams({lat,lon,lang:language()}),{cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      if(!data.label)return;
      title.textContent=data.label;
      secondary.textContent=[data.neighbourhood||data.city, (el()?'Ακρίβεια GPS ±':'GPS accuracy ±')+Math.round(accuracy)+' m'].filter(Boolean).join(' · ');
      const state=window.RoadPulseState;
      if(state&&state.centerSource==='gps'){
        state.userAreaLabel=data.neighbourhood||data.city||data.label;
        const heading=$('cityTitle');
        if(heading)heading.innerHTML=escape(state.userAreaLabel)+'<span class="orange-dot">.</span>';
        const sub=$('citySub');if(sub)sub.textContent=(el()?'Η τρέχουσα τοποθεσία σου':'Your current location');
      }
    }catch{/* A GPS coordinate is still usable if address lookup is down. */}
  }
  function init() {
    if($('thesiArrival')) {
      $('thesiArrival').value=calendarText().slice(0,16);
      $('thesiArrival').addEventListener('input',billing);
      $('thesiMinutes').addEventListener('input',billing);
      $('thesiHoliday').addEventListener('change',billing);
      billing();
    }
    if($('pressureDate')){
      $('pressureDate').value=calendarText().slice(0,10);
      for(const id of ['pressureDate','pressureRain','pressureEvent'])$(id).addEventListener('change',renderForecast);
      renderForecast();
    }
    window.addEventListener('roadpulse:location',e=>locationChanged(e.detail));
    window.addEventListener('roadpulse:city',renderForecast);
    document.addEventListener('click',e=>{if(e.target.closest('[data-view="forecast"]'))renderForecast()});
    if($('hereAction')) $('hereAction').addEventListener('click',()=>document.getElementById('locateBtn')?.click());
    if($('pressureRefresh')) $('pressureRefresh').addEventListener('click',renderForecast);
    if($('langBtn'))$('langBtn').addEventListener('click',()=>{billing();renderForecast()});
    window.RoadPulseCivic={bill:billing,forecast:renderForecast};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();