/* ROADPULSE Parking Evidence Lab — browser-only eyewitness records. */
(() => {
 'use strict';
 const core=()=>window.RoadPulseEvidenceCore;
 const $=id=>document.getElementById(id);
 const greek=()=>window.RoadPulseState?.lang!=='en';
 const txt=(a,b)=>greek()?a:b;
 const center=()=>window.RoadPulseState?.center||{lat:40.634,lon:22.944};
 const storeKey='roadpulse.parking.evidence.v1';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let records=[],message='',error=false;
 function kind(){return $('evidenceKind').value}
 function query(){const c=center();return {lat:Number(c.lat),lon:Number(c.lon),kind:kind()}}
 function getRecords(){
   try{return core().sanitizeRecords(JSON.parse(localStorage.getItem(storeKey)||'[]'))}catch{return []}
 }
 function persist(next){
   try{
     localStorage.setItem(storeKey,JSON.stringify(next));
     const stored=localStorage.getItem(storeKey);
     if(!stored)throw Error('Storage unavailable');
     records=core().sanitizeRecords(JSON.parse(stored));
     return true;
   }catch{
     error=true;message=txt('Αποτυχία τοπικής αποθήκευσης. Η καταγραφή δεν αποθηκεύτηκε.',
       'Local browser storage failed; the observation was not saved.');
     return false;
   }
 }
 function dateLabel(stamp){
   const q=query();
   return new Intl.DateTimeFormat(greek()?'el-GR':'en-GB',{
     timeZone:core().zone(q.lat,q.lon),day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'
   }).format(new Date(stamp));
 }
 function categoryLabel(v){
   return {street:txt('Άλλος δρόμος','Other street'),thesi:txt('Σημασμένες THESi','Marked THESi bays'),
     lot:txt('Οργανωμένο πάρκινγκ','Off-street parking')}[v]||v;
 }
 function notice(s,isError=false){message=s;error=isError;render()}
 function render(){
   if(!core()||!$('evidenceRoot'))return;
   const q=query(),cell=core().grid(q.lat,q.lon),counts=core().coverage(records,cell,q.kind);
   $('evidenceRegion').textContent=txt('Επιλεγμένη ζώνη χάρτη (~200–260 μ.): ','Selected map grid (~200–260 m): ')+cell+
     ' · '+categoryLabel(q.kind);
   $('evidenceCount').textContent=String(counts.records);
   $('evidenceDays').textContent=String(counts.days);
   $('evidenceLatest').textContent=counts.latest?dateLabel(counts.latest):'—';
   const out=core().forecast(records,q);
   const horizons=[0,30,60,120];
   $('evidenceForecastCards').innerHTML=out.points.map((point,i)=>{
     const f=point.result;
     const h=i===0?txt('Τώρα','Now'):'+'+horizons[i]+txt(' λεπτά',' min');
     return '<div><small>'+escape(h)+'</small><strong>'+(f?f.occupiedPercent+'%':'—')+
       '</strong><span>'+(f?f.low+'–'+f.high+'%':'—')+'</span></div>';
   }).join('');
   $('evidenceForecastHelp').textContent=out.points.some(x=>x.result)?
     txt('Εκτίμηση πληρότητας μόνο στο χειροκίνητα μετρημένο δείγμα. Δεν είναι live THESi, διαθέσιμες θέσεις ή στατιστικά βαθμονομημένο διάστημα εμπιστοσύνης.',
       'Occupancy estimate from a manually surveyed sample only. Not live THESi, free bay counts, or statistically calibrated confidence intervals.'):
     txt('Ανεπαρκή στοιχεία: απαιτούνται τουλάχιστον 6 καταγραφές σε 3 διαφορετικές ημέρες, με δείγματα σε παρόμοιες ώρες. Καμία τιμή δεν επινοείται.',
       'Insufficient evidence: at least 6 observations on 3 different dates with comparable hours. No estimated values are invented.');
   const back=core().backtest(records,q);
   $('evidenceValidation').textContent=back.ready?
     txt('Έλεγχος σε μεταγενέστερες καταγραφές: μέσο απόλυτο σφάλμα ','Past-only evaluation: mean absolute error ')+
       back.maePercentagePoints+
       txt(' ποσοστιαίες μονάδες ('+back.testCount+' παρατηρήσεις σε '+back.days+' ημέρες). Μη αντιπροσωπευτικό δείγμα.',
          ' percentage points ('+back.testCount+' observations over '+back.days+' dates). Self-selected sample.'):
     txt('Ιστορική αξιολόγηση: μη διαθέσιμη μέχρι να υπάρχουν αρκετές νέες, μεταγενέστερες παρατηρήσεις.',
       'Historical evaluation unavailable until enough later observations have been recorded.');
   const history=out.observations.slice(-7).reverse();
   $('evidenceEntries').innerHTML=history.length?history.map(r=>
     '<div class="evidence-entry"><span><b>'+escape(dateLabel(r.at))+'</b><small>'+
       r.free+'/'+r.total+' '+txt('κενές στο δείγμα','free in sample')+'</small></span>'+
       '<button type="button" aria-label="'+txt('Διαγραφή','Remove')+'" data-evidence-remove="'+escape(r.id)+'">×</button></div>'
   ).join(''):'<span class="evidence-disclosure">'+txt('Καμία τοπική καταγραφή.','No local observations yet.')+'</span>';
   $('evidenceNotice').textContent=message;
   $('evidenceNotice').dataset.error=String(error);
   $('evidenceExport').disabled=!records.length;
   $('evidenceDelete').disabled=!records.length;
 }
 function submit(e){
   e.preventDefault();error=false;
   const total=$('evidenceTotal').value.trim(),free=$('evidenceFree').value.trim();
   if(!/^\d{1,3}$/.test(total)||!/^\d{1,3}$/.test(free)||!$('evidenceConfirm').checked){
     return notice(txt('Χρειάζονται ακέραιοι αριθμοί και επιβεβαίωση επιτόπιας αυτοψίας.',
       'Whole numbers and confirmed in-person observations are required.'),true);
   }
   try{
     const rec=core().addRecord(records,{...query(),total:Number(total),free:Number(free)});
     if(persist(rec)){
       message=txt('Καταγράφηκε στη συσκευή. Δεν παρουσιάζεται ως επίσημο ή live δεδομένο.',
        'Saved on this device. Not presented as official or live data.');
       $('evidenceFree').value='';$('evidenceTotal').value='';
       $('evidenceConfirm').checked=false;
     }
     render();
   }catch(ex){
     notice(ex.message.includes('15 minutes')?
        txt('Υπάρχει ήδη καταγραφή εδώ στα τελευταία 15 λεπτά.','A record already exists for this category and area in the past 15 minutes.'):
        txt('Έλεγξε τα δεδομένα: σύνολο 1–300, κενές 0 έως το σύνολο.','Check counts: 1–300 total, free between 0 and total.'),true);
   }
 }
 function remove(id){
   if(persist(records.filter(r=>r.id!==id))){
     message=txt('Διαγράφηκε η παρατήρηση.','Observation removed.');error=false;
   }
   render();
 }
 function exportData(){
   const payload={schema:'roadpulse-parking-evidence-v1',source:'unverified eyewitness reports',
     exportedAt:new Date().toISOString(),records};
   const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='roadpulse-observations.json';document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),10000);
 }
 function clear(){
   if(!window.confirm(txt('Να διαγραφούν ΟΛΕΣ οι τοπικές αυτοψίες;',
     'Delete ALL local field observations?')))return;
   if(persist([])){message=txt('Όλες οι τοπικές αυτοψίες διαγράφηκαν.','All local observations deleted.');error=false}
   render();
 }
 function localize(){
   const titles={
    evidenceHeading:['Μετρήσεις θέσεων, όχι εικασίες.','Measured spaces, not guesses.'],
    evidenceIntro:['Μέτρησε επιτόπου πόσες νόμιμες θέσεις έλεγξες και πόσες ήταν κενές. Μετακίνησε πρώτα τον χάρτη στο σημείο της αυτοψίας σου.',
      'Physically count inspected legal bays and empty bays. First move the map to the actual inspected area.'],
    evidenceKindLabel:['Τύπος νόμιμων θέσεων','Type of legal parking'],
    evidenceTotalLabel:['Θέσεις που έλεγξα','Bays inspected'],
    evidenceFreeLabel:['Πραγματικά κενές','Actually empty'],
    evidenceConfirmLabel:['Επιβεβαιώνω επιτόπια καταμέτρηση στην περιοχή που έχω επιλέξει στον χάρτη.',
      'I confirm an in-person count in the area currently selected on the map.'],
    evidenceSave:['+ Καταγραφή παρατήρησης','+ Save field observation'],
    evidenceCountLabel:['Καταγραφές ζώνης','Area observations'],
    evidenceDaysLabel:['Ημέρες με στοιχεία','Observed dates'],
    evidenceLatestLabel:['Τελευταία','Latest'],
    evidenceForecastTitle:['Εκτίμηση πληρότητας από αυτοψίες','Occupancy model from field observations'],
    evidenceHistoryTitle:['Ιστορικό αυτής της ζώνης','This area’s observation history'],
    evidenceExport:['↓ Εξαγωγή JSON','↓ Export JSON'],
    evidenceDelete:['Διαγραφή όλων','Delete all'],
    evidencePrivacy:['Μόνο στη συσκευή σου. Οι καταγραφές δεν κοινοποιούνται, δεν συγχρονίζονται και δεν είναι επίσημες μετρήσεις THESi.',
      'Local browser only. Observations are not shared, synced or certified THESi measurements.']
   };
   for(const [id,phrase] of Object.entries(titles)){if($(id))$(id).textContent=phrase[greek()?0:1]}
   for(const opt of $('evidenceKind').options)opt.textContent=categoryLabel(opt.value);
   render();
 }
 function init(){
   if(!core()||!$('evidenceForm'))return;
   records=getRecords();
   $('evidenceForm').addEventListener('submit',submit);
   $('evidenceKind').addEventListener('change',()=>{message='';render()});
   $('evidenceEntries').addEventListener('click',e=>{
     const button=e.target.closest('button[data-evidence-remove]');
     if(button)remove(button.dataset.evidenceRemove);
   });
   $('evidenceExport').addEventListener('click',exportData);
   $('evidenceDelete').addEventListener('click',clear);
   window.addEventListener('roadpulse:city',()=>{message='';render()});
   $('langBtn')?.addEventListener('click',()=>setTimeout(localize,0));
   localize();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
