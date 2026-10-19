/* ROADPULSE 3.6: official, user-initiated THESi map embedding.
   These maps show designated bays; they do not report instantaneous vacancy. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const isGreek=()=>window.RoadPulseState?.lang!=='en';
 const tr=(a,b)=>isGreek()?a:b;
 const links=Object.freeze({
   visitors:'https://www.thesi.gr/map/?residents=false',
   residents:'https://www.thesi.gr/map/?visitors=false'
 });
 let mode='visitors',loaded=false;
 function sync(){
   const visitor=$('thesiTabVisitors'),resident=$('thesiTabResidents');
   if(!visitor||!resident)return;
   visitor.setAttribute('aria-pressed',String(mode==='visitors'));
   resident.setAttribute('aria-pressed',String(mode==='residents'));
   visitor.textContent=tr('◯ Επισκέπτες · λευκές','◯ Visitors · white');
   resident.textContent=tr('● Κάτοικοι · μπλε','● Residents · blue');
   const heading=$('thesiMapPanelTitle');
   if(heading)heading.textContent=tr('Επίσημος χάρτης θέσεων THESi','Official THESi parking map');
   const help=$('thesiMapPanelHelp');
   if(help)help.textContent=tr(
      'Επέλεξε κατηγορία για να δεις τις νόμιμες θέσεις στον επίσημο χάρτη. Δεν εμφανίζει επιβεβαιωμένα κενές θέσεις.',
      'Choose a category to view designated bays on the official map. It does not confirm live vacancies.'
   );
   const open=$('thesiFullMap');
   if(open)open.href=links[mode];
   const show=$('thesiShowMap');
   if(show)show.textContent=loaded?tr('↻ Ανανέωση χάρτη','↻ Refresh map'):tr('◫ Προβολή χάρτη','◫ View official map');
   const meta=$('thesiMapMeta');
   if(meta)meta.textContent=tr('Πηγή: THESi / ParkPal · εξωτερικός χάρτης · άγνωστη διαθεσιμότητα.',
                                'Source: THESi / ParkPal · external map · occupancy unknown.');
   const iframe=$('thesiOfficialFrame');
   if(loaded&&iframe){
      iframe.src=links[mode];
      iframe.title=tr('Επίσημος χάρτης THESi '+(mode==='visitors'?'επισκεπτών':'κατοίκων'),
         'Official THESi '+mode+' parking map');
   }
   document.querySelectorAll('[data-thesi-i18n]').forEach(node=>{
      const strings={
        full:['Άνοιγμα πλήρους χάρτη ↗','Full map ↗'],
        satellite:['ΔΟΡΥΦΟΡΙΚΗ ΑΝΑΛΥΣΗ','SATELLITE ANALYSIS'],
        nofeed:['ΧΩΡΙΣ LIVE ΕΙΚΟΝΑ','NO LIVE FEED'],
        satelliteTitle:['Μπορούμε να βρούμε κενές θέσεις από ψηλά;','Can we detect vacant spaces from orbit?'],
        satelliteText:['Μόνο σε χρονοσημασμένες, πολύ υψηλής ανάλυσης εικόνες με κατάλληλη άδεια. Δεν διαθέτουμε τέτοια ροή. Δέντρα, κτίρια και σκιές κρύβουν θέσεις. Δεν προβάλλουμε ψεύτικα live κενά.',
                       'Only on timestamped, licensed very-high-resolution imagery. No such feed is connected. Trees, buildings and shadows hide parking spots. We do not invent live vacancies.'],
        satelliteAge:['Ηλικία δορυφορικής εικόνας','Satellite image age'],
        occupancy:['Πραγματικά ελεύθερες THESi','Verified free THESi bays'],
        notAvailable:['Μη διαθέσιμο','Unavailable'],
        readmore:['Τι μπορεί να μετρήσει ένας δορυφόρος ↗','Satellite imaging capabilities ↗']
      };
      const phrase=strings[node.dataset.thesiI18n];
      if(phrase)node.textContent=phrase[isGreek()?0:1];
   });
 }
 function enableMap(){
   const host=$('thesiMapHost'),iframe=$('thesiOfficialFrame');
   if(!host||!iframe)return;
   host.hidden=false;
   loaded=true;
   iframe.src=links[mode];
   sync();
 }
 function init(){
   if(!$('thesiTabVisitors'))return;
   $('thesiTabVisitors').addEventListener('click',()=>{mode='visitors';sync()});
   $('thesiTabResidents').addEventListener('click',()=>{mode='residents';sync()});
   $('thesiShowMap')?.addEventListener('click',enableMap);
   $('langBtn')?.addEventListener('click',()=>setTimeout(sync,0));
   sync();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
