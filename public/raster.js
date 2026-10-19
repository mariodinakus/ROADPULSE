/* ROADPULSE raster engine: standalone WebGL-free OpenStreetMap + TomTom overlay.
 * No external JS, CSS, API key, or browser extension is required.
 * © OpenStreetMap contributors (ODbL); tiles subject to their usage policy.
 */
(function(global){
'use strict';
const TILE=256, RAD=Math.PI/180;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const merc=(lat,lon,z)=>{const n=Math.pow(2,z), phi=clamp(lat,-85.051128,85.051128)*RAD;
 return {x:(lon+180)/360*n*TILE,y:(1-Math.log(Math.tan(phi)+1/Math.cos(phi))/Math.PI)/2*n*TILE};};
const unmerc=(x,y,z)=>{const n=Math.pow(2,z),longitude=x/(n*TILE)*360-180,theta=Math.PI*(1-2*y/(n*TILE));return {lat:Math.atan(Math.sinh(theta))/RAD,lon:longitude};};
function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
class RasterMap {
 constructor(host,opts={}){
  this.host=typeof host==='string'?document.getElementById(host):host;
  if(!this.host)throw Error('Raster host missing');
  this.center={lat:Number(opts.lat)||0,lon:Number(opts.lon)||0};this.zoom=clamp(Math.round(opts.zoom||12),1,19);
  this.theme=opts.theme||'light';this.mapStyle=opts.mapStyle||'atlas';this.traffic=false;this.stamp='';this.pinData=[];this.route=null;
  this.onClick=opts.onClick||null;this.onMove=opts.onMove||null;this.id=Math.random().toString(36).slice(2);
  this.host.innerHTML='';this.host.classList.add('rp-raster-host');this.host.dataset.mapStyle=this.mapStyle;
  const base=document.createElement('div');base.className='rp-tile-pane';this.host.appendChild(base);this.base=base;
  const traffic=document.createElement('div');traffic.className='rp-traffic-pane';this.host.appendChild(traffic);this.trafficPane=traffic;
  const streets=document.createElementNS('http://www.w3.org/2000/svg','svg');streets.setAttribute('class','rp-streets-pane');streets.setAttribute('aria-label','Parking search priority by mapped road segment');this.host.appendChild(streets);this.streetsPane=streets;this.streetData=[];this.streetSelect=null;
  const route=document.createElementNS('http://www.w3.org/2000/svg','svg');route.setAttribute('class','rp-route-pane');route.setAttribute('aria-hidden','true');this.host.appendChild(route);this.routePane=route;
  const pins=document.createElement('div');pins.className='rp-pin-pane';this.host.appendChild(pins);this.pinPane=pins;
  this.loaded=0;this.fallbackTiles=0;this.satelliteErrorSeen=false;this.tiles=new Map();this.trafficTiles=new Map();this.down=null;
  this._down=e=>{if(e.target.closest('button,a,.rp-road-line'))return;this.down={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};this.host.setPointerCapture?.(e.pointerId);this.host.classList.add('rp-dragging');};
  this._move=e=>{if(!this.down||e.pointerId!==this.down.id)return;const dx=e.clientX-this.down.lastX,dy=e.clientY-this.down.lastY;this.down.lastX=e.clientX;this.down.lastY=e.clientY;if(Math.abs(e.clientX-this.down.x)+Math.abs(e.clientY-this.down.y)>6)this.down.moved=true;
   const center=merc(this.center.lat,this.center.lon,this.zoom),p=unmerc(center.x-dx,center.y-dy,this.zoom);this.center={lat:p.lat,lon:((p.lon+540)%360)-180};this.render();};
  this._up=e=>{if(!this.down||e.pointerId!==this.down.id)return;const state=this.down;this.down=null;this.host.classList.remove('rp-dragging');try{this.host.releasePointerCapture?.(e.pointerId)}catch{};
   if(!state.moved&&this.onClick){const r=this.host.getBoundingClientRect(),c=merc(this.center.lat,this.center.lon,this.zoom);this.onClick(unmerc(c.x+e.clientX-r.left-r.width/2,c.y+e.clientY-r.top-r.height/2,this.zoom));}
   else if(state.moved)this.onMove?.({...this.center});};
  this._wheel=e=>{e.preventDefault();this.setZoom(this.zoom+(e.deltaY<0?1:-1));};
  this._dbl=e=>{e.preventDefault();this.setZoom(this.zoom+1);};
  this._resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>this.render()):null;
  this.host.addEventListener('pointerdown',this._down);this.host.addEventListener('pointermove',this._move);this.host.addEventListener('pointerup',this._up);this.host.addEventListener('pointercancel',this._up);this.host.addEventListener('wheel',this._wheel,{passive:false});this.host.addEventListener('dblclick',this._dbl);this._resize?.observe(this.host);
  this.render();
 }
 setView(lat,lon,zoom=this.zoom){if(!Number.isFinite(+lat)||!Number.isFinite(+lon))return;this.center={lat:clamp(+lat,-85,85),lon:+lon};this.zoom=clamp(Math.round(zoom),1,19);this.render();}
 getZoom(){return this.zoom;} getCenter(){return {...this.center};}
 zoomIn(){this.setZoom(this.zoom+1);}zoomOut(){this.setZoom(this.zoom-1);}
 setZoom(z){this.zoom=clamp(Math.round(z),1,19);this.render();this.onMove?.({...this.center});}
 setTraffic(on,theme=this.theme,stamp=''){const changed=this.traffic!==!!on||this.theme!==theme||this.stamp!==stamp;this.traffic=!!on;this.theme=theme;this.stamp=stamp;this.trafficPane.style.display=on?'block':'none';if(changed){this.trafficTiles.forEach(x=>x.remove());this.trafficTiles.clear();this.render();}}
 setMapStyle(style){
   const next=['atlas','night','classic','satellite'].includes(style)?style:'atlas';
   if(this.mapStyle===next)return;
   this.mapStyle=next;this.host.dataset.mapStyle=next;
   this.tiles.forEach(tile=>tile.remove());this.tiles.clear();this.loaded=0;this.satelliteErrorSeen=false;
   this.render();
 }
 setStreets(roads,select){this.streetData=Array.isArray(roads)?roads:[];this.streetSelect=typeof select==='function'?select:null;this.renderStreets();}
 renderStreets(){
  const svg=this.streetsPane;if(!svg)return;svg.replaceChildren();
  const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h||!this.streetData.length)return;
  svg.setAttribute('viewBox','0 0 '+w+' '+h);
  const colors={promising:'#1abb81',mixed:'#ffb33f',difficult:'#e75958',restricted:'#83919e',unknown:'#83919e'};
  for(const road of this.streetData){
   if(!Array.isArray(road.geometry)||road.geometry.length<2)continue;
   const points=road.geometry.filter(c=>Array.isArray(c)&&Number.isFinite(c[0])&&Number.isFinite(c[1])).map(c=>this.position(c[1],c[0]));
   if(points.length<2||!points.some(p=>p.x>-100&&p.x<w+100&&p.y>-100&&p.y<h+100))continue;
   const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
   line.setAttribute('points',points.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' '));
   line.setAttribute('class','rp-road-line');line.setAttribute('fill','none');line.setAttribute('stroke',colors[road.tier]||colors.unknown);
   line.setAttribute('stroke-width',road.tier==='unknown'||road.tier==='restricted'?'4.5':'7');line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');
   line.setAttribute('stroke-opacity',road.tier==='unknown'||road.tier==='restricted'?'0.48':'0.95');
   line.setAttribute('data-street-id',String(road.id));line.setAttribute('tabindex','0');line.setAttribute('role','button');
   line.setAttribute('aria-label',(road.name||'Road')+' — '+(road.score==null?'unknown':road.score+'/100 scenario search priority'));
   const tip=document.createElementNS('http://www.w3.org/2000/svg','title');tip.textContent=(road.name||'Road')+' · '+(road.score==null?'Unknown legal parking / occupancy':road.score+'/100 heuristic search priority, NOT live vacancies');line.appendChild(tip);
   line.addEventListener('click',e=>{e.stopPropagation();this.streetSelect?.(road);});
   line.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.streetSelect?.(road);}});
   svg.appendChild(line);
  }
 }
 setPins(pins){this.pinData=Array.isArray(pins)?pins:[];this.renderPins();}
 setRoute(geometry){this.route=geometry?.coordinates||null;this.renderRoute();}
 focusRoute(points){if(!points?.length)return;const lat=points.reduce((n,p)=>n+p[1],0)/points.length,lon=points.reduce((n,p)=>n+p[0],0)/points.length;this.setView(lat,lon,Math.max(11,Math.min(this.zoom,14)));}
 position(lat,lon){const p=merc(lat,lon,this.zoom),c=merc(this.center.lat,this.center.lon,this.zoom),rect=this.host.getBoundingClientRect();let dx=p.x-c.x;const wrap=Math.pow(2,this.zoom)*TILE;if(dx>wrap/2)dx-=wrap;if(dx<-wrap/2)dx+=wrap;return {x:rect.width/2+dx,y:rect.height/2+(p.y-c.y)};}
 render(){if(!this.host.isConnected)return;const w=this.host.clientWidth||800,h=this.host.clientHeight||600;if(!w||!h)return;
   const c=merc(this.center.lat,this.center.lon,this.zoom),max=Math.pow(2,this.zoom),minX=Math.floor((c.x-w/2)/TILE)-1,maxX=Math.ceil((c.x+w/2)/TILE)+1,minY=Math.floor((c.y-h/2)/TILE)-1,maxY=Math.ceil((c.y+h/2)/TILE)+1;
   const needed=new Set(),tNeeded=new Set();
   for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){if(y<0||y>=max)continue;const tileX=(x%max+max)%max,key=this.zoom+'/'+x+'/'+y,tx=Math.round(x*TILE-c.x+w/2),ty=Math.round(y*TILE-c.y+h/2);needed.add(key);
    let img=this.tiles.get(key);if(!img){img=document.createElement('img');img.alt='';img.draggable=false;img.decoding='async';img.className='rp-map-tile';img.dataset.fallback='0';img.src=this.mapStyle==='satellite'?
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+this.zoom+'/'+y+'/'+tileX:
      'https://tile.openstreetmap.org/'+this.zoom+'/'+tileX+'/'+y+'.png';
     img.addEventListener('load',()=>{this.loaded++});
     img.addEventListener('error',()=>{
       if(img.dataset.fallback==='0'&&this.mapStyle==='satellite'){
         img.dataset.fallback='second-source';
         img.src='https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+this.zoom+'/'+y+'/'+tileX;
       }else if(img.dataset.fallback==='0'||img.dataset.fallback==='second-source'){
         img.dataset.fallback='osm';
         img.src='https://basemaps.cartocdn.com/light_all/'+this.zoom+'/'+tileX+'/'+y+'.png';
         this.fallbackTiles++;
         if(this.mapStyle==='satellite'&&!this.satelliteErrorSeen){
           this.satelliteErrorSeen=true;
           window.dispatchEvent(new CustomEvent('roadpulse:imagery-error',{detail:{fallback:true}}));
         }
       }
     });this.base.appendChild(img);this.tiles.set(key,img);}img.style.transform='translate('+tx+'px,'+ty+'px)';
    if(this.traffic&&this.zoom>=9&&this.zoom<=18){tNeeded.add(key);let overlay=this.trafficTiles.get(key);if(!overlay){overlay=document.createElement('img');overlay.alt='';overlay.draggable=false;overlay.className='rp-map-tile rp-map-traffic';overlay.src='/api/traffic?z='+this.zoom+'&x='+tileX+'&y='+y+'&theme='+this.theme+'&v='+encodeURIComponent(this.stamp);overlay.addEventListener('error',()=>{overlay.style.visibility='hidden';});this.trafficPane.appendChild(overlay);this.trafficTiles.set(key,overlay);}overlay.style.transform='translate('+tx+'px,'+ty+'px)';}
   }
   for(const [k,img]of this.tiles)if(!needed.has(k)){img.remove();this.tiles.delete(k)}for(const [k,img]of this.trafficTiles)if(!tNeeded.has(k)){img.remove();this.trafficTiles.delete(k)}
   this.renderStreets();this.renderPins();this.renderRoute();
 }
 renderPins(){
  this.pinPane.innerHTML='';
  const width=this.host.clientWidth,height=this.host.clientHeight;
  const user=this.pinData.find(item=>item.kind==='user');
  const showUser=()=>{
   if(!user||!Number.isFinite(user.lat)||!Number.isFinite(user.lon))return;
   const p=this.position(user.lat,user.lon);
   if(p.x<-35||p.x>width+35||p.y<-35||p.y>height+35)return;
   const b=document.createElement('button');b.type='button';b.className='rp-raster-pin user';b.textContent='◎';b.title=user.title||'Η θέση μου';b.setAttribute('aria-label',b.title);
   b.style.transform='translate('+Math.round(p.x)+'px,'+Math.round(p.y)+'px)';
   b.addEventListener('click',e=>{e.stopPropagation();user.onClick?.()});this.pinPane.appendChild(b);
  };
  const isParking=this.pinData.some(item=>item.kind==='parking');
  // Spatial cluster in pixel space. Blue numbered pins are facility counts, NEVER empty bays.
  if(isParking && this.zoom<=13){
   const cell=this.zoom<=10?80:this.zoom<=12?62:45,groups=new Map();
   for(const item of this.pinData){
    if(item.kind==='user')continue;
    if(!Number.isFinite(item.lat)||!Number.isFinite(item.lon))continue;
    const p=this.position(item.lat,item.lon);
    if(p.x< -35||p.x>width+35||p.y< -35||p.y>height+35)continue;
    const id=Math.floor(p.x/cell)+':'+Math.floor(p.y/cell);
    const old=groups.get(id)||{items:[],x:0,y:0,lat:0,lon:0};
    old.items.push(item);old.x+=p.x;old.y+=p.y;old.lat+=item.lat;old.lon+=item.lon;groups.set(id,old);
   }
   for(const group of groups.values()){
    const n=group.items.length,x=group.x/n,y=group.y/n;
    const b=document.createElement('button');b.type='button';
    b.className='rp-raster-pin parking '+(n>1?'cluster':'');
    b.textContent=n>1?String(n):'P';
    b.title=n>1?n+' '+(this.mapStyle==='night'?'parking facilities':'καταγεγραμμένα πάρκινγκ'):(group.items[0].title||'Parking');
    b.setAttribute('aria-label',b.title);
    b.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';
    b.addEventListener('click',event=>{
     event.stopPropagation();
     if(n===1)group.items[0].onClick?.();
     else this.setView(group.lat/n,group.lon/n,Math.min(16,this.zoom+2));
    });
    this.pinPane.appendChild(b);
   }
   showUser();return;
  }
  for(const item of this.pinData){
   if(item.kind==='user')continue;
   if(!Number.isFinite(item.lat)||!Number.isFinite(item.lon))continue;
   const p=this.position(item.lat,item.lon);
   if(p.x< -35||p.x>width+35||p.y< -35||p.y>height+35)continue;
   const b=document.createElement('button');b.type='button';
   b.className='rp-raster-pin '+(item.kind==='parking'?'parking':'incident');
   b.textContent=item.kind==='parking'?'P':(item.icon||'!');
   b.title=item.title||'';b.setAttribute('aria-label',b.title);
   b.style.transform='translate('+Math.round(p.x)+'px,'+Math.round(p.y)+'px)';
   b.addEventListener('click',e=>{e.stopPropagation();item.onClick?.()});
   this.pinPane.appendChild(b);
  }
  showUser();
 }
 renderRoute(){this.routePane.innerHTML='';if(!this.route||this.route.length<2)return;const points=this.route.map(c=>this.position(c[1],c[0])).map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');poly.setAttribute('points',points);poly.setAttribute('fill','none');poly.setAttribute('stroke','#475ff1');poly.setAttribute('stroke-width','6');poly.setAttribute('stroke-linecap','round');poly.setAttribute('stroke-linejoin','round');this.routePane.appendChild(poly);}
 destroy(){this._resize?.disconnect();this.host.removeEventListener('pointerdown',this._down);this.host.removeEventListener('pointermove',this._move);this.host.removeEventListener('pointerup',this._up);this.host.removeEventListener('pointercancel',this._up);this.host.removeEventListener('wheel',this._wheel);this.host.removeEventListener('dblclick',this._dbl);this.host.classList.remove('rp-raster-host','rp-dragging');this.host.innerHTML='';}
}
global.RoadPulseRasterMap=RasterMap;
})(window);
