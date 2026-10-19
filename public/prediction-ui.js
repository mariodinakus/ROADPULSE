/* ROADPULSE Predictive Labs visual layer. All estimates are explicitly labelled. */
(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  const lang=()=>window.RoadPulseState?.lang==='en'?'en':'el';
  const gr=()=>lang()==='el';
  const t=(el,en)=>gr()?el:en;
  const model=()=>window.RoadPulsePrediction;
  const center=()=>window.RoadPulseState?.center||{lat:40.634,lon:22.944};
  const number=n=>Math.round(Number(n)||0);
  let liveSnapshot=null,selection=30,locationKey='',lastLoadTime=0;
  const key=()=>{const c=center();return Number(c.lat).toFixed(3)+','+Number(c.lon).toFixed(3)};
  function card(selector,html){const host=document.querySelector(selector);if(host)host.insertAdjacentHTML('beforeend',html)}
  function setup(){
    if(!model()||!byId('parkingPressurePanel')||byId('parkingProjectionDetail'))return;
    const best=byId('pressureBest');
    if(best)best.insertAdjacentHTML('afterend',
      '<div class="forecast-proof" id="parkingProjectionDetail" aria-live="polite"></div>');
    card('#trafficPressurePanel .traffic-pressure-card',
      '<section class="forecast-lab" aria-label="Traffic predictions">'+
      '<div class="forecast-lab-header"><span>TRAFFIC PRESSURE · NEXT 2H</span><span class="forecast-labelled">MODEL v1.0</span></div>'+
      '<h3 id="trafficForecastHeading"></h3><p class="forecast-intro" id="trafficForecastIntro"></p>'+
      '<div class="forecast-grid" id="trafficForecastGrid"></div>'+
      '<div class="forecast-detail" id="trafficForecastDetail" aria-live="polite"></div>'+
      '<div class="forecast-visual" id="trafficForecastPlot" role="img"></div>'+
      '<p class="forecast-disclaimer" id="trafficForecastDisclosure"></p></section>');
    byId('trafficForecastGrid')?.addEventListener('click',e=>{
      const button=e.target.closest('button[data-horizon]');if(!button)return;
      selection=Number(button.dataset.horizon);renderTraffic();
    });
    for(const id of ['pressureDate','pressureRain','pressureEvent']){
      byId(id)?.addEventListener('change',renderParking);
    }
    byId('pressureRefresh')?.addEventListener('click',renderParking);
    byId('langBtn')?.addEventListener('click',()=>{renderParking();renderTraffic()});
    window.addEventListener('roadpulse:city',()=>{
      liveSnapshot=null;locationKey='';lastLoadTime=0;
      renderParking();renderTraffic();
    });
    window.addEventListener('roadpulse:traffic-snapshot',event=>{
      if(!event.detail||!event.detail.live)return;
      liveSnapshot=event.detail;locationKey=key();lastLoadTime=Date.now();renderTraffic();
    });
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderTraffic()});
    renderParking();renderTraffic();
  }
  function renderParking(){
    const holder=byId('parkingProjectionDetail');if(!holder||!model())return;
    try{
      const c=center(),date=byId('pressureDate')?.value;
      if(!date)return;
      const forecast=model().parkingForecast({
        date,lat:c.lat,lon:c.lon,
        rain:!!byId('pressureRain')?.checked,event:!!byId('pressureEvent')?.checked
      });
      const best=forecast.best,worst=forecast.worst;
      const fmt=n=>String(n).padStart(2,'0')+':00';
      holder.innerHTML='<div class="proof-head"><strong>'+t('ΠΡΟΒΛΕΨΗ ΖΗΤΗΣΗΣ','DEMAND FORECAST')+'</strong><span>'+t('Υποθετικό / χωρίς αισθητήρες','Scenario / no occupancy sensors')+'</span></div>'+
        '<div class="proof-columns"><div><small>'+t('Ηπιότερη ώρα','Quieter hour')+'</small><b>'+fmt(best.hour)+'</b><span>'+best.score+'/100 · '+best.low+'–'+best.high+'</span></div>'+
        '<div><small>'+t('Πιο πιεσμένη','Busier hour')+'</small><b>'+fmt(worst.hour)+'</b><span>'+worst.score+'/100 · '+worst.low+'–'+worst.high+'</span></div></div>'+
        '<p>'+t('Εύρη ευαισθησίας από παραδοχές, όχι στατιστικά διαστήματα εμπιστοσύνης. Δεν γνωρίζουμε πόσες θέσεις είναι πραγματικά ελεύθερες.',
          'Assumption sensitivity ranges, not statistical confidence intervals. Actual free spaces are unknown.')+'</p>';
    }catch{holder.textContent=t('Αδυναμία υπολογισμού για αυτή την ημερομηνία ή περιοχή.','Unable to calculate for this date or area.')}
  }
  function renderTraffic(){
    const heading=byId('trafficForecastHeading');if(!heading||!model())return;
    heading.textContent=t('Πώς μπορεί να αλλάξει η κίνηση;','How might traffic change?');
    byId('trafficForecastIntro').textContent=t('Εκτίμηση +15 έως +120 λεπτά με αφετηρία τις τωρινές μετρήσεις TomTom.',
      '15–120 minute projection anchored on the latest TomTom observations.');
    const grid=byId('trafficForecastGrid'),details=byId('trafficForecastDetail'),plot=byId('trafficForecastPlot');
    const foot=byId('trafficForecastDisclosure');
    foot.textContent=t('Πειραματική βραχυχρόνια εξαγωγή τάσης. Χρησιμοποιεί τις τωρινές ταχύτητες και υποθετική ημερήσια καμπύλη, όχι εκπαιδευμένο μοντέλο ή επαληθευμένη ιστορική ακρίβεια. Το εύρος δείχνει ευαισθησία σε παραδοχές, όχι 95% διάστημα εμπιστοσύνης. Αφορά μόνο τα δειγματοληπτημένα τμήματα δρόμων.',
      'Experimental short-horizon extrapolation using current speeds and an assumed daily profile. Not trained or historically validated. Ranges are scenario sensitivity, not 95% confidence intervals. Applies to sampled roads only.');
    const c=center();
    const forecast=(liveSnapshot&&locationKey===key())?
      model().trafficForecast({snapshot:liveSnapshot,lat:c.lat,lon:c.lon}):null;
    if(!forecast){
      grid.innerHTML='';plot.innerHTML='';
      details.textContent=t('Για να εμφανιστεί πρόβλεψη, χρειάζονται πρόσφατες ζωντανές μετρήσεις. Πάτησε «Φόρτωση ζωντανής κίνησης».',
        'A prediction needs fresh live measurements. Select “Load live road speeds”.');
      details.classList.add('forecast-empty');
      return;
    }
    details.classList.remove('forecast-empty');
    const horizons=forecast.points.filter(x=>x.minutes>0);
    grid.innerHTML=horizons.map(p=>'<button type="button" class="forecast-horizon '+(p.minutes===selection?'selected':'')+
      '" data-horizon="'+p.minutes+'" aria-pressed="'+String(p.minutes===selection)+'"><small>+'+p.minutes+' '+t('λεπτά','min')+
      '</small><b>'+p.score+'<sup>/100</sup></b><span>'+p.low+'–'+p.high+'</span></button>').join('');
    const point=horizons.find(p=>p.minutes===selection)||horizons[1];
    const measured=forecast.points[0].score,diff=point.score-measured;
    const trend=diff>=5?t('Πιθανή αύξηση της πίεσης','Potential higher pressure'):diff<=-5?
      t('Πιθανή αποκλιμάκωση','Potential easing'):t('Σχετικά σταθερή πίεση','Broadly stable pressure');
    details.innerHTML='<div class="forecast-trend"><strong>'+trend+'</strong><span>'+
      (diff>0?'+':'')+diff+' '+t('μονάδες έναντι τώρα','points versus now')+'</span></div>'+
      '<small>'+t('Εύρος σεναρίου','Scenario range')+': '+point.low+'–'+point.high+
      ' · '+t('Μετρημένα δείγματα','Observed samples')+': '+forecast.sampleCount+'/5</small>';
    // SVG path has only validated numeric model outputs; no provider text is interpolated.
    const pts=forecast.points.map((p,i)=>({x:20+i*63,y:110-p.score*.85,p}));
    const low=pts.map(x=>x.x+','+(110-x.p.low*.85)).join(' ');
    const high=pts.slice().reverse().map(x=>x.x+','+(110-x.p.high*.85)).join(' ');
    const line=pts.map((x,i)=>(i?'L':'M')+x.x.toFixed(1)+' '+x.y.toFixed(1)).join(' ');
    const labels=pts.map(x=>'<text x="'+x.x+'" y="130" text-anchor="middle">'+(x.p.minutes?'+'+x.p.minutes:t('Τώρα','Now'))+'</text>').join('');
    plot.innerHTML='<svg viewBox="0 0 300 146" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet">'+
      '<line x1="20" y1="110" x2="274" y2="110" stroke="currentColor" opacity=".13"/>'+
      '<polygon points="'+low+' '+high+'" fill="currentColor" opacity=".11"/>'+
      '<path d="'+line+'" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'+
      pts.map(x=>'<circle cx="'+x.x+'" cy="'+x.y+'" r="3.6" fill="currentColor"/>').join('')+
      labels+'</svg>';
    plot.setAttribute('aria-label',t('Προβολή πίεσης κυκλοφορίας ανά χρονικό ορίζοντα','Traffic pressure by time horizon'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
