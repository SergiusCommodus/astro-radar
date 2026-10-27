(function(){
'use strict';
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function $(s,r){return (r||document).querySelector(s)}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function pad2(n){return String(n).padStart(2,'0')}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function wrap180(a){return ((a%360)+540)%360-180}
var store={get:function(k){try{var v=localStorage.getItem(k);return v?JSON.parse(v):null}catch(e){return null}},set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},del:function(k){try{localStorage.removeItem(k)}catch(e){}}};
function toast(m,ms){var t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(function(){t.classList.remove('show')},ms||2600)}
function fmtT(t){var a=Math.abs(Math.round(t));return (t<0?'T−':'T+')+pad2(Math.floor(a/60))+':'+pad2(a%60)}
function fmtTs(t){var a=Math.round(t);return Math.floor(a/60)+':'+pad2(a%60)}

/* data */
// the build packs the ZIP table as base 36 deltas (v2); unpack it to plain arrays
function undelta(str){var out=[],p=0,a=str.split(',');for(var i=0;i<a.length;i++){p+=parseInt(a[i],36);out.push(p)}return out}
var Z=JSON.parse($('#zipdata').textContent);if(Z.v===2){Z.z=undelta(Z.z).map(function(n){return String(n).padStart(5,'0')}).join('');Z.a=undelta(Z.a);Z.o=undelta(Z.o);Z.c=undelta(Z.c)}var NZ=Z.a.length;
function zipAt(i){return Z.z.substr(i*5,5)}
function findZip(z){var lo=0,hi=NZ-1;while(lo<=hi){var m=(lo+hi)>>1,v=zipAt(m);if(v===z)return m;if(v<z)lo=m+1;else hi=m-1}return -1}
function zipInfo(i){var nm=Z.n[Z.c[i]];return {zip:zipAt(i),lat:Z.a[i]/100,lon:Z.o[i]/100,city:nm,st:nm.slice(-2),short:nm.split(',')[0]}}
var LAUNCHES=[
  {id:'sl1',prov:'spacex',orbit:'Low Earth',go:90,v:'F9',veh:'Falcon 9',mis:'Starlink',site:'SLC40',az:47,utc:'2026-10-27T10:52:00Z',tz:'America/New_York',st:'go'},
  {id:'ng1',prov:'blue',orbit:'Transfer orbit',go:70,v:'NG',veh:'New Glenn',mis:'Commercial satellite',site:'LC36',az:92,utc:'2026-10-29T15:15:00Z',tz:'America/New_York',st:'tbd'},
  {id:'sl2',prov:'spacex',orbit:'Polar, low Earth',go:95,v:'F9',veh:'Falcon 9',mis:'Starlink',site:'SLC4E',az:158,utc:'2026-10-31T04:03:00Z',tz:'America/Los_Angeles',st:'go'},
  {id:'ss1',prov:'spacex',orbit:'Suborbital test',go:60,v:'SS',veh:'Starship',mis:'Flight test',site:'STARBASE',az:97,utc:'2026-11-01T23:30:00Z',tz:'America/Chicago',st:'hold'},
  {id:'el1',prov:'rocketlab',orbit:'Low Earth',go:85,v:'EL',veh:'Electron',mis:'Rideshare',site:'WALLOPS',az:120,utc:'2026-11-02T22:45:00Z',tz:'America/New_York',st:'go'},
  {id:'vu1',prov:'ula',orbit:'Geosync transfer',go:75,v:'VUL',veh:'Vulcan',mis:'National security payload',site:'SLC41',az:95,utc:'2026-11-04T00:48:00Z',tz:'America/New_York',st:'tbd'},
  {id:'fh1',prov:'nasa',orbit:'Escape path',go:90,v:'FH',veh:'Falcon Heavy',mis:'NASA science mission',site:'LC39A',az:90,utc:'2026-11-07T09:20:00Z',tz:'America/New_York',st:'go'}
];
// launch providers from data/providers.json (the build inlines it): name, official site, live page and its source, social page
var PROVS=JSON.parse($('#provdata').textContent),PROV={};PROVS.forEach(function(p){PROV[p.key]=p});
var STATUS={go:['s-go','Go for launch','Go'],tbd:['s-tbd','Time to be confirmed','Time TBC'],hold:['s-hold','On hold','On hold']};
function prep(L){L.siteObj=ORB.SITES[L.site];L.trk=ORB.track(L,2);L.end=L.trk[L.trk.length-1].t;L.events=ORB.EVENTS[L.v];L.stg=ORB.staging(L.v)}
LAUNCHES.forEach(prep);
// only plain https links from the feed ever reach an href
function safeUrl(u,fb){return typeof u==='string'&&/^https:\/\/[^\s"'<>]+$/.test(u)?u:fb}
function provOf(L){return PROV[L.prov]||L.pv||{n:'Launch provider'}}
// filter key: the provider's own key, or its name for companies outside providers.json
function provKey(L){return PROV[L.prov]?L.prov:'pv:'+provOf(L).n}
// where to watch: the launch's own webcast from the feed, else the provider's official live page, else nothing (the page then
// says no stream is listed rather than guessing). src names the broadcast, for example "SpaceX on X", "YouTube" or "NASA+"
function srcOf(u,P){var h=(u.match(/^https:\/\/([^\/?#]+)/)||[])[1]||'';h=h.replace(/^www\./,'');
  return /(^|\.)(youtube\.com|youtu\.be)$/.test(h)?'YouTube':/(^|\.)(x|twitter)\.com$/.test(h)?P.n+' on X':h==='plus.nasa.gov'?'NASA+':h}
function watchOf(L){var P=provOf(L),u=safeUrl(L.vid,null);if(u)return {url:u,src:L.vsrc||srcOf(u,P),own:true};u=safeUrl(P.live,null);return u?{url:u,src:P.liveSrc||srcOf(u,P),own:false}:null}
function infoUrl(L){return safeUrl(L.info,null)}
function goTxt(L){return L.go==null?'Pending':L.go+'% go'}
var LIVE={on:false,gen:null};
function fromFeed(f){if(!f||!f.pad||!ORB.PROF[f.v])return null;ORB.SITES[f.site]={n:f.pad.n,full:f.pad.full,lat:f.pad.lat,lon:f.pad.lon,st:f.pad.st};return {id:f.id,prov:f.prov,pv:f.pv&&{n:String(f.pv.n||'Launch provider'),site:safeUrl(f.pv.site,null)},orbit:f.orbit,go:f.go,v:f.v,veh:f.veh,mis:f.mis,site:f.site,az:f.az,utc:f.utc,tz:f.tz,st:STATUS[f.st]?f.st:'tbd',vid:f.vid,vsrc:f.vsrc?String(f.vsrc):'',info:f.info}}
function setLaunches(list){S.cache={};LAUNCHES.length=0;list.forEach(function(L){LAUNCHES.push(L)});LAUNCHES.forEach(prep);S.cur=0;S.simT=-10}
function setDataNote(){var t=$('#dataTag');if(LIVE.on){var m=Math.max(0,Math.round((Date.now()-Date.parse(LIVE.gen))/60000)),ago=m<60?m+' min ago':m<2880?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago';t.textContent='Live data · updated '+ago;t.className='dtag live';$('#manNote').textContent='Launch data from Launch Library 2 by The Space Devs, refreshed every 30 minutes. Visibility is a modeled estimate from the launch pad, vehicle and a typical flight path.';$('#footNote').textContent='Live launch data · Visibility is a modeled estimate'}else{t.textContent=LIVE.err==='offline'||navigator.onLine===false?'Offline · sample data':LIVE.err?'Sample data · live feed unavailable':'Sample data';t.className='dtag'}}
function loadLive(){if(!/^https?:$/.test(location.protocol)||!window.fetch)return;fetch('launches.json?_='+Math.floor(Date.now()/60000)).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){var cut=Date.now()-30*60000,list=(j.launches||[]).map(fromFeed).filter(function(L){return L&&Date.parse(L.utc)>cut});if(!list.length){LIVE.err='feed';setDataNote();return}LIVE.on=true;LIVE.err=null;LIVE.gen=j.generated;setLaunches(list);refresh();setDataNote();sizeSky()}).catch(function(){LIVE.err=navigator.onLine===false?'offline':'feed';setDataNote()})}
var DTF={};function dtf(k,tz,o){var key=k+(tz||'');return DTF[key]||(DTF[key]=new Intl.DateTimeFormat('en-US',Object.assign({timeZone:tz},o)))}
function fmtDay(L){return dtf('d',L.tz,{weekday:'short',month:'short',day:'numeric'}).format(new Date(L.utc))}
function fmtTime(L){return dtf('t',L.tz,{hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(L.utc))}
var S={cur:0,obs:null,user:store.get('radar.user'),rem:store.get('radar.rem')||{},simT:-10,playing:!reduce,cache:{}};
function L0(){return LAUNCHES[S.cur]}
function vis(L,o){o=o||S.obs;var k=L.id+'|'+o.zip;if(!S.cache[k])S.cache[k]=ORB.visibility(L,L.trk,o.lat,o.lon);return S.cache[k]}
var DIRW={N:'north',NNE:'north northeast',NE:'northeast',ENE:'east northeast',E:'east',ESE:'east southeast',SE:'southeast',SSE:'south southeast',S:'south',SSW:'south southwest',SW:'southwest',WSW:'west southwest',W:'west',WNW:'west northwest',NW:'northwest',NNW:'north northwest'};
function bearingTo(o,lat,lon){return ORB.look(o.lat,o.lon,lat,lon,0).az}
function elWord(e){return e>25?'high in the sky':e>12?'well above the horizon':e>5?'low above the horizon':'just above the horizon'}

/* hero */
function renderHero(){swapHero();var L=L0();$('#heroTitle').textContent=L.mis;$('#heroKicker').textContent=S.cur===0?'Next launch':'Selected launch';var st=STATUS[L.st],hs=$('#heroStatus');hs.className='status '+st[0];hs.textContent=st[1];
  var P0=provOf(L),W0=watchOf(L),hw=$('#heroWatch');hw.hidden=!W0;if(W0){hw.href=W0.url;hw.setAttribute('aria-label','Watch live on '+W0.src)}$('#heroSrc').textContent=W0?(W0.own?'Webcast · ':'Live page · ')+W0.src:'No official stream listed yet';var inf=infoUrl(L)||safeUrl(P0.site,null),hsb=$('#heroSite');hsb.hidden=!inf;if(inf){hsb.href=inf;hsb.firstChild.textContent=infoUrl(L)?'Mission page':P0.n+' site'}$('#hfVeh').textContent=L.veh;$('#hfPad').textContent=L.siteObj.n;$('#hfOrbit').textContent=L.orbit;$('#hfWx').textContent=goTxt(L);$('#hfWx').className=L.go==null?'':'s-go';$('#hfZip').textContent=S.obs.zip;var vv=vis(L);$('#hfVis').textContent=vv.best?(vv.day?'Daytime':vv.rating):'Not visible';$('#ncName').textContent=L.mis;
  $('#heroSub').innerHTML='<span>'+L.veh+'</span><span>'+esc(L.siteObj.full)+'</span><span>'+fmtDay(L)+' · '+fmtTime(L)+'</span>';updateRemind()}
/* motion helpers */
// countdown digits: each digit that changes slides up and out while the new one slides in; the seconds give a soft pulse
function setDigit(sel,val){var e=$(sel),old=e._v;if(old===val)return;e._v=val;
  if(reduce||old==null||old.length!==val.length)e.innerHTML=val.split('').map(function(c){return '<span class="dc"><span>'+c+'</span></span>'}).join('');
  else for(var i=0;i<val.length;i++)if(old[i]!==val[i])e.children[i].innerHTML='<span class="dc-o" aria-hidden="true">'+old[i]+'</span><span class="dc-n">'+val[i]+'</span>';
  setTimeout(function(){$$('.dc-o',e).forEach(function(o){o.remove()})},500);
  if(sel==='#cS'&&!reduce&&old!=null){var p=e.parentNode;p.classList.remove('sp');void p.offsetWidth;p.classList.add('sp')}}
function countTo(sel){var el=$(sel);if(!el||reduce)return;var txt=el.textContent,m=/-?\d+(\.\d+)?/.exec(txt);if(!m)return;var to=parseFloat(m[0]),dec=m[1]?m[1].length-1:0,from=el._n==null?0:el._n;if(from===to&&!el._raf)return;el._n=to;cancelAnimationFrame(el._raf);var t0=performance.now(),pre=txt.slice(0,m.index),post=txt.slice(m.index+m[0].length);
  function step(now){var k=Math.min(1,(now-t0)/700),e=1-Math.pow(1-k,3);el.textContent=pre+(from+(to-from)*e).toFixed(dec)+post;if(k<1)el._raf=requestAnimationFrame(step);else{el._raf=0;el.textContent=txt}}el._raf=requestAnimationFrame(step)}
function fx(){if(skySeen)['#olScore','#wxTemp','#wxCloud','#vcPeak','#vcDist'].forEach(countTo)}
var lastCur=null;
// switching launches: the old hero frame fades out over the new one while the headline and details blur in
function swapHero(){if(!reduce&&lastCur!==null&&lastCur!==S.cur){['.hero-top','#heroTitle','.hero-sub','.count','.hero-facts','#p-sky .verdict','#p-sky .facts','.wxrow'].forEach(function(s){var e=$(s);if(e){e.classList.remove('swap');void e.offsetWidth;e.classList.add('swap')}});
    if(hc.width){var g=document.createElement('canvas');g.className='hero-ghost';g.width=hc.width;g.height=hc.height;g.style.width=HW+'px';g.style.height=HH+'px';g.getContext('2d').drawImage(hc,0,0);HA.appendChild(g);setTimeout(function(){g.remove()},900)}}lastCur=S.cur}
function tick(){var s=Math.max(0,Math.round((new Date(L0().utc).getTime()-Date.now())/1000));setDigit('#cD',pad2(Math.min(99,Math.floor(s/86400))));setDigit('#cH',pad2(Math.floor(s%86400/3600)));setDigit('#cM',pad2(Math.floor(s%3600/60)));setDigit('#cS',pad2(s%60));$('#ncTime').textContent=pad2(Math.min(99,Math.floor(s/86400)))+'d '+pad2(Math.floor(s%86400/3600))+':'+pad2(Math.floor(s%3600/60))+':'+pad2(s%60)}
setInterval(tick,1000);

/*__GLOBE__*/
/* hero canvas: a night photo of the US with a launch rising from its pad; assets/earth.json says which photo and how it maps.
   One canvas on screen. What stays still is drawn once into offscreen canvases and copied in each frame: the photo at its view (with
   the film grain baked in) and the readability shade with its vignette; only what moves is drawn fresh */
var HA=$('#heroArt'),hc=$('#space'),hx=hc.getContext('2d'),PHC=document.createElement('canvas'),phx=PHC.getContext('2d'),SHC=document.createElement('canvas'),shx=SHC.getContext('2d');
var HW=0,HH=0,HD=1,SHD=1,T=0,EIMG=null,EOK=false,EFULL=false,glints=[],SMOKE=[],LSPR=null,DSPR=null,CAM=null,TXR=null,TXN=0,LY={},BM=12,GSP={},GLOWBB=null;
// phones and other low power devices: 30 frames a second, fewer extras
var LOWP=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches)||(navigator.hardwareConcurrency||8)<=4;
// slow one time work (cloud textures) runs in slices between frames, so it never blocks the page
var JOBS=[];function runJobs(ms){var t0=performance.now();while(JOBS.length&&performance.now()-t0<ms){if(JOBS[0]())JOBS.shift()}}
var PC=JSON.parse($('#photoCfg').textContent),IW=PC.w,IH=PC.h;
var pstars=[],MET=[],nextMet=2.5,lastLt=0,CLD=null,GLOW=null;
// launch loop: pad lights and ignition, then FLY seconds of flight warped onto the profile (unhurried early, quicker later), then a pause
// of AFTER seconds while the long exposure trail fades out
var LOOP=56,PADT=3.4,FLY=44,WARP=.65,IGN=2.2,AFTER=6;
function lineY(pts,x){var n=pts.length-1;if(x<=pts[0][0])return pts[0][1];for(var i=1;i<=n;i++)if(x<=pts[i][0]){var a=pts[i-1],b=pts[i];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])}return pts[n][1]}
// the horizon and the top of the air glow, sampled per photo column once (the pixel loops below read them hundreds of thousands of times)
var LIMBL=new Float32Array(IW+1),GTOPL=new Float32Array(IW+1);for(var li=0;li<=IW;li++){LIMBL[li]=lineY(PC.limb,li);GTOPL[li]=lineY(PC.glowTop,li)}
function limbY(x){return LIMBL[x<0?0:x>IW?IW:x|0]}
function glowY(x){return GTOPL[x<0?0:x>IW?IW:x|0]}
// lat/lon to photo pixels: the quadratic fit to city lights stored in the config
function proj(la,lo){var g=PC.geo,u=(lo-g.lon0)/g.slon,v=(la-g.lat0)/g.slat,t=[1,u,v,u*u,u*v,v*v],x=0,y=0;for(var i=0;i<6;i++){x+=t[i]*g.x[i];y+=t[i]*g.y[i]}return [x,y]}
// flight path in photo pixels: ground track lifted on a soft curve of altitude (so the climb off the pad reads), or null when the pad
// is outside the photo (the lower 48 states, Mexico and the Caribbean are in it; Alaska, Hawaii and the rest of the world get the globe). kEnd is where the path leaves the photo
// (1 if it stays in) and the boxes cover only the part inside
function photoPath(L){if(L._pp!==undefined&&L._ppk===L.site+L.az)return L._pp;var s0=L.siteObj,b=proj(s0.lat,s0.lon),ok=s0.lat>12&&s0.lat<62&&s0.lon<-55&&s0.lon>-130&&b[0]>20&&b[0]<IW-20&&b[1]>limbY(b[0])+15&&b[1]<IH-20,out=null;
  if(ok){out=L.trk.map(function(p){var g=proj(p.lat,p.lon);return [g[0],g[1]-PC.lift*Math.pow(Math.max(0,p.h),PC.liftPow)]});var n=out.length,ex=n;for(var i=1;i<n;i++){var q=out[i];if(q[0]<6||q[0]>IW-6||q[1]<6||q[1]>IH-6){ex=i;break}}
    var box=function(a){return a.reduce(function(r,q){return [Math.min(r[0],q[0]),Math.min(r[1],q[1]),Math.max(r[2],q[0]),Math.max(r[3],q[1])]},[1e9,1e9,-1e9,-1e9])},vis=out.slice(0,ex);
    out.kEnd=ex>=n?1:(ex-1)/(n-1);out.bb=box(vis);out.bb2=box(vis.slice(0,Math.ceil(vis.length*.5)))}
  L._ppk=L.site+L.az;L._pp=out;return out}
function photoAt(pp,k){var f=clamp(k,0,1)*(pp.length-1),i=Math.min(pp.length-2,Math.floor(f)),w=f-i;return [pp[i][0]*(1-w)+pp[i+1][0]*w,pp[i][1]*(1-w)+pp[i+1][1]*w]}
// the photo is its own file (WebP, or JPEG where WebP fails) decoded off the main thread; a tiny copy inlined in the page shows first,
// soft and blurred. The artifact build has no separate files, so it inlines the photo in data-src and leaves data-webp empty
(function(){var el=$('#earthSrc'),tiny=el.getAttribute('data-tiny'),webp=el.getAttribute('data-webp'),src=el.getAttribute('data-src');
  function use(im,full){if(EFULL)return;EIMG=im;EOK=true;EFULL=full;LY.key='';if(full)JOBS.push(function(){analysePhoto();return true},function(){buildGlow();return true},function(){buildClouds();return true});kick()}
  function load(u,fb){var im=new Image(),ok=function(){use(im,true)},bad=function(){if(fb)load(fb,null)};im.decoding='async';im.src=u;if(im.decode)im.decode().then(ok,bad);else{im.onload=ok;im.onerror=bad}}
  if(tiny){var t=new Image();t.onload=function(){use(t,false)};t.src=tiny}
  load(webp||src,webp?src:null)})();
// one pass over a small copy of the photo: city lights to flicker, and star positions in the clear sky
function analysePhoto(){var q=4,w=Math.ceil(IW/q),h=Math.ceil(IH/q),c=document.createElement('canvas');c.width=w;c.height=h;var g=c.getContext('2d');g.drawImage(EIMG,0,0,w,h);var d=g.getImageData(0,0,w,h).data,cand=[],x,y,o;
  for(y=0;y<h;y++)for(x=0;x<w;x++){o=(y*w+x)*4;var r=d[o],gg=d[o+1],b=d[o+2];if(r>150&&r>b+40&&gg>95&&y*q>limbY(x*q)+12)cand.push([x*q+2,y*q+2,(r+gg)/510])}
  // brightest first, skipping any within 14 px of one already kept (a grid of 14 px cells, so only neighbouring cells are checked)
  cand.sort(function(a,b){return b[2]-a[2]});var out=[],rg=rng(hstr('glints')),grid={},near=function(c2){var gx=c2[0]/14|0,gy=c2[1]/14|0;for(var ix=gx-1;ix<=gx+1;ix++)for(var iy=gy-1;iy<=gy+1;iy++){var cell=grid[ix+','+iy];if(cell)for(var k=0;k<cell.length;k++)if(Math.abs(cell[k][0]-c2[0])+Math.abs(cell[k][1]-c2[1])<=14)return true}return false};
  for(var i=0;i<cand.length&&out.length<240;i++){var c2=cand[i];if(!near(c2)){var ck=(c2[0]/14|0)+','+(c2[1]/14|0);(grid[ck]=grid[ck]||[]).push(c2);out.push([c2[0],c2[1],c2[2],rg()*6.283,.6+rg()*1.8,.3+rg()*.3,rg()<.09,rg()*6.283])}}glints=out;
  JOBS.splice(1,0,function(){photoStars(d,w,h,q);return true})}
// stars: [x, y, size, phase, rate, bright, violet, phase2, rate2, depth], only above the air glow and away from anything already bright (the Moon)
function photoStars(d,w,h,q){var o,rs=rng(hstr('photostars'));pstars=[];for(var n=0;n<20000&&pstars.length<460;n++){var sx=rs()*IW,sy=rs()*IH*.5;if(sy>glowY(sx)-14)continue;o=(Math.min(h-1,sy/q|0)*w+Math.min(w-1,sx/q|0))*4;if(d[o]*.3+d[o+1]*.59+d[o+2]*.11>34)continue;var big=rs()<.03,sz=rs();
    pstars.push([sx,sy,big?1.5+sz*.9:.8+sz*sz*.9,rs()*6.283,1.1+rs()*2.6,big,rs()<.12,rs()*6.283,2+rs()*3.5,.4+rs()*.3])}}
// the photo's own air glow, kept as its own layer so it can breathe; it comes from the photo's pixels, so it always sits on its horizon
// only the band between the top of the glow and the horizon is read and kept; GLOWBB is that band in photo pixels, the part drawn each frame
function buildGlow(){var q=2,w=Math.ceil(IW/q),h=Math.ceil(IH/q),c=document.createElement('canvas');c.width=w;c.height=h;var g=c.getContext('2d'),tops=new Float32Array(w),bots=new Float32Array(w),b0=h,b1=0;
  for(var x=0;x<w;x++){tops[x]=glowY(x*q)-6;bots[x]=limbY(x*q)+5;b0=Math.min(b0,Math.max(0,Math.floor(tops[x]/q)));b1=Math.max(b1,Math.min(h,Math.ceil(bots[x]/q)+1))}
  g.drawImage(EIMG,0,0,w,h);var bh=b1-b0,im=g.getImageData(0,b0,w,bh),d=im.data;
  for(var y=0;y<bh;y++)for(x=0;x<w;x++){var o=(y*w+x)*4,Y=(y+b0)*q,top=tops[x],bot=bots[x],a=0;if(Y>top&&Y<bot)a=clamp((d[o+2]-Math.max(d[o],d[o+1]*.85))/70,0,1)*clamp(Math.min(Y-top,bot-Y)/5,0,1);d[o+3]=a*255|0}
  g.clearRect(0,0,w,h);g.putImageData(im,0,b0);GLOW=c;GLOWBB=[b0*q,b1*q]}
function drawGlow(v,t){if(!GLOW||!GLOWBB)return;var br=reduce?.5:.5+.5*Math.sin(t*.42),q=2,y0=GLOWBB[0],y1=GLOWBB[1];hx.save();hx.globalCompositeOperation='lighter';hx.globalAlpha=.1+.22*br;
  hx.drawImage(GLOW,0,y0/q,GLOW.width,(y1-y0)/q,v.ox,v.oy+y0*v.s,IW*v.s,(y1-y0)*v.s);hx.restore()}
function spacePhoto(ix,iy){return clamp((glowY(ix)-12-iy)/30,0,1)}
// soft procedural clouds in photo space: two seamless layers drifting at different speeds (parallax), masked to the Earth below the
// air glow, lit brighter toward the horizon and the sunrise; a touch of noise in the alpha keeps the gradients from banding
function fbm5(x,y,z){var s=0,a=.5,f=1,n=0;for(var i=0;i<5;i++){s+=vn(x*f,y*f,z*f)*a;n+=a;a*=.5;f*=2.03}return s/n}
function cloudTex(w,h,q,seed,scale,cut){var c=document.createElement('canvas');c.width=w;c.height=h;var g=c.getContext('2d'),im=g.createImageData(w,h),d=im.data,al=new Uint8Array(w*h),Rr=w/(6.2832*scale),rs=rng(hstr(seed)),off=rs()*40,x=0,T={c:c,a:al};
  // a few columns per call; the job runner calls step between frames until it returns true
  T.step=function(){for(var x1=Math.min(w,x+6);x<x1;x++){var a=x/w*6.2832,cx=Math.cos(a)*Rr,cy=Math.sin(a)*Rr;for(var y=0;y<h;y++){var dd=y*q-170;if(dd<=0)continue;var n=fbm5(cx+off,cy+off*.7,10.2*Math.log(1+dd/82)*22/scale+off*.3);n=clamp((n-cut)*2.4,0,1);n=n*n*(3-2*n);
    var A=clamp(n*215+(rs()-.5)*4,0,255)|0,o=(y*w+x)*4;d[o]=d[o+1]=d[o+2]=255;d[o+3]=al[y*w+x]=A}}
    if(x<w)return false;g.putImageData(im,0,0);return true};return T}
function buildClouds(){var q=3,w=Math.ceil(IW/q),h=Math.ceil(IH/q),mask=document.createElement('canvas'),buf=document.createElement('canvas');mask.width=buf.width=w;mask.height=buf.height=h;
  var mg=mask.getContext('2d'),mi=mg.createImageData(w,h),md=mi.data,ma=new Uint8Array(w*h);
  for(var x=0;x<w;x++){var lz=limbY(x*q);for(var y=0;y<h;y++){var d2=y*q-lz-10;if(d2<=0)continue;var A=Math.min(255,clamp(d2/34,0,1)*(.3+.7*Math.exp(-d2/420)+.18*(1-x/w))*255)|0;md[(y*w+x)*4+3]=ma[y*w+x]=A}}
  mg.putImageData(mi,0,0);var bg=buf.getContext('2d'),tint=bg.createLinearGradient(0,0,w,0);tint.addColorStop(0,'rgb(255,222,196)');tint.addColorStop(.3,'rgb(222,230,246)');tint.addColorStop(1,'rgb(176,190,218)');
  var A=cloudTex(w,h,q,'cloudsA',24,.49),B=cloudTex(w,h,q,'cloudsB',11,.53);
  CLD={q:q,mask:mask,ma:ma,buf:buf,g:bg,tint:tint,layers:[{t:A,sp:2.2,al:.8,dy:0,wy:0},{t:B,sp:4,al:.55,dy:3,wy:2}]};JOBS.push(A.step,B.step,function(){CLD.ready=true;LY.ct=-1;return true});kick()}
function drawClouds(v,t){if(!CLD||!CLD.ready)return;var b=CLD.buf,g=CLD.g,w=b.width,h=b.height,y0=Math.floor(PC.limb.reduce(function(m,p){return Math.min(m,p[1])},1e9)/CLD.q);
  if(LY.ct==null||LY.ct<0||t<LY.ct||t-LY.ct>=(LOWP?1/12:1/30)){LY.ct=t;g.globalCompositeOperation='source-over';g.clearRect(0,0,w,h);
  CLD.layers.forEach(function(L){var dx=((t*L.sp)%w+w)%w;L.cy=L.dy+(reduce?0:Math.sin(t*.09)*L.wy);g.globalAlpha=L.al;g.drawImage(L.t.c,dx,L.cy);g.drawImage(L.t.c,dx-w,L.cy)});g.globalAlpha=1;
  g.globalCompositeOperation='destination-in';g.drawImage(CLD.mask,0,0);g.globalCompositeOperation='source-atop';g.fillStyle=CLD.tint;g.fillRect(0,0,w,h);g.globalCompositeOperation='source-over'}
  var par=reduce?0:Math.sin(t*.031)*1.6,k=CLD.q*v.s;hx.save();hx.globalAlpha=.5;hx.drawImage(b,0,y0,w,h-y0,v.ox+par,v.oy+y0*k,w*k,(h-y0)*k);hx.restore()}
// how much drifting cloud covers a photo pixel (0 to 1), so lights under it dim
function cloudAt(ix,iy,t){if(!CLD||!CLD.ready)return 0;var q=CLD.q,w=CLD.buf.width,x=clamp(ix/q|0,0,w-1),y=iy/q|0;if(y<0||y>=CLD.buf.height)return 0;var s=0;
  CLD.layers.forEach(function(L){var sx=((x-Math.floor(((t*L.sp)%w+w)%w))%w+w)%w,sy=y-Math.round(L.cy==null?L.dy:L.cy);if(sy>=0)s+=L.t.a[sy*w+sx]/255*L.al});return clamp(s,0,1)*CLD.ma[y*w+x]/255}
// city lights: each one breathes on its own phase with a wandering speed, 30 to 60 percent between dips and peaks; a few pulse deeper
// for a while. Dips darken the photo's own light and peaks add to it, drifting cloud dims them, and the brightest get a soft bloom
function lightSprites(){function mk(c0,c1){var c=document.createElement('canvas');c.width=c.height=64;var g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,c0);gr.addColorStop(.35,c1);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return c}
  LSPR=mk('rgba(255,218,160,1)','rgba(255,180,100,.35)');DSPR=mk('rgba(0,0,0,1)','rgba(0,0,0,.6)')}
function drawLights(v,t){if(!LSPR)lightSprites();var F=[],i,q,x,y,rr,f;
  for(i=0;i<glints.length;i++){q=glints[i];x=v.ox+q[0]*v.s;y=v.oy+q[1]*v.s;if(x<-60||x>HW+60||y<-60||y>HH+60){F.push(null);continue}
    if(reduce)f=0;else{var ph=t*q[4]+q[3]+.8*Math.sin(t*.31+q[7]);f=.7*Math.sin(ph)+.3*Math.sin(ph*2.4+q[7]);if(q[6]){var en=Math.pow(Math.max(0,Math.sin(t*.21+q[7])),3);f=f*(1-en)+en*Math.sin(t*3.4+q[3])}}
    F.push([x,y,(2+q[2]*2.5)*v.s*2.4,f*(q[5]+(q[6]?.15:0))/2,1-.75*cloudAt(q[0],q[1],t)])}
  hx.save();for(i=0;i<F.length;i++){q=F[i];if(!q||q[3]>=0)continue;rr=q[2]*.7;hx.globalAlpha=Math.min(.9,-q[3]*1.6)*q[4];hx.drawImage(DSPR,q[0]-rr,q[1]-rr,rr*2,rr*2)}
  hx.globalCompositeOperation='lighter';for(i=0;i<F.length;i++){q=F[i];if(!q)continue;var up=Math.max(0,q[3]);rr=q[2];hx.globalAlpha=Math.min(1,(.2+1.3*up)*q[4]);hx.drawImage(LSPR,q[0]-rr,q[1]-rr,rr*2,rr*2);
    if(i<(LOWP?10:20)){rr*=3.6;hx.globalAlpha=(.1+.25*up)*q[4];hx.drawImage(LSPR,q[0]-rr,q[1]-rr,rr*2,rr*2)}}hx.restore()}
// stars: [x, y, size, phase, rate, bright, violet, phase2, rate2, depth] in photo pixels (v given) or screen pixels; small and soft, each
// flickering gently on two slow waves of its own (25 to 40 percent at the dips); only the seven largest get a tiny glow and a short, faint cross
function drawStars(t,list,v){if(!list)return;if(!list.gl){list.gl={};list.map(function(q,i){return i}).filter(function(i){return list[i][5]}).sort(function(a,b){return list[b][2]-list[a][2]}).slice(0,7).forEach(function(i){list.gl[i]=1})}
  hx.save();hx.globalCompositeOperation='lighter';var s=v?v.s:1,ox=v?v.ox:0,oy=v?v.oy:0,k=clamp(s,.8,1.6),ts=t*.45,cur=-1,COL=['230,238,255','205,190,255'];
  for(var i=0;i<list.length;i++){var q=list[i],x=ox+q[0]*s,y=oy+q[1]*s;if(x<-8||y<-8||x>HW+8||y>HH+8)continue;
    var f=reduce?.3:.5+.5*(.62*Math.sin(ts*q[4]+q[3])+.38*Math.sin(ts*(q[8]||q[4]*1.7)+(q[7]||q[3]*1.3))),a=(q[5]?.78:.45+.35*Math.min(1,q[2]))*(1-(.25+((q[9]||.55)-.4)*.5)*f),r=Math.min(q[5]?2:1.6,Math.max(.9,q[2]*k)),ci=q[6]?1:0;
    if(ci!==cur){cur=ci;hx.fillStyle=hx.strokeStyle='rgb('+COL[ci]+')'}hx.globalAlpha=a;if(r<1.3)hx.fillRect(x-r/2,y-r/2,r,r);else{hx.beginPath();hx.arc(x,y,r/2,0,6.283);hx.fill()}
    if(list.gl[i]){var sk='s'+ci,sp=GSP[sk]||(GSP[sk]=spr([[0,'rgba('+COL[ci]+',1)'],[1,'rgba('+COL[ci]+',0)']]));hx.globalAlpha=.14*a;hx.drawImage(sp,x-r*2,y-r*2,r*4,r*4);
      var L=r*(1+.9*a);hx.globalAlpha=.18*a;hx.lineWidth=.5;hx.beginPath();hx.moveTo(x-L,y);hx.lineTo(x+L,y);hx.moveTo(x,y-L);hx.lineTo(x,y+L);hx.stroke()}}hx.restore()}
// meteor showers: every several seconds a few thin fast streaks at random angles, only over open sky (sp gives 1 in space, 0 over the Earth)
function meteors(t,dt,sp){if(reduce)return;
  if(t>nextMet){var n=3+(Math.random()*4|0);for(var i=0;i<n;i++){for(var tr=0;tr<16;tr++){var x=Math.random()*HW,y=Math.random()*HH*.75;if(sp(x,y)<.95)continue;var a=(Math.random()<.8?15+Math.random()*150:190+Math.random()*160)*Math.PI/180;
    MET.push({x:x,y:y,dx:Math.cos(a),dy:Math.sin(a),v:Math.max(900,HW*.8)*(.8+Math.random()*.5),len:70+Math.random()*90,life:.35+Math.random()*.3,age:-(i*(.15+Math.random()*.3))});break}}nextMet=t+6+Math.random()*6}
  hx.save();hx.globalCompositeOperation='lighter';hx.lineCap='round';hx.lineWidth=1.2;
  for(var j=MET.length-1;j>=0;j--){var m=MET[j];m.age+=dt;if(m.age>m.life){MET.splice(j,1);continue}if(m.age<0)continue;
    var f=m.age/m.life,d=m.v*m.age,px=m.x+m.dx*d,py=m.y+m.dy*d,tl=m.len*Math.min(1,m.age/.12),al=Math.min(1,m.age/.06)*(f<.55?1:1-(f-.55)/.45)*sp(px,py);if(al<.02)continue;
    var g=hx.createLinearGradient(px-m.dx*tl,py-m.dy*tl,px,py);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(235,242,255,'+(.9*al)+')');hx.strokeStyle=g;hx.beginPath();hx.moveTo(px-m.dx*tl,py-m.dy*tl);hx.lineTo(px,py);hx.stroke();
    hx.fillStyle='rgba(255,255,255,'+(.8*al)+')';hx.fillRect(px-.9,py-.9,1.8,1.8)}hx.restore()}
// the film grain tile (baked into the photo copy with an overlay blend)
var GRAIN=null;function grainTile(){if(!GRAIN){var c=document.createElement('canvas');c.width=c.height=128;var cg=c.getContext('2d'),im=cg.createImageData(128,128);for(var i=0;i<im.data.length;i+=4){var n=Math.random()*255|0;im.data[i]=im.data[i+1]=im.data[i+2]=n;im.data[i+3]=255}cg.putImageData(im,0,0);GRAIN=c}return GRAIN}
// a radial sprite (128 px) with the given colour stops, drawn scaled with an alpha in place of a new gradient every frame
function spr(stops){var c=document.createElement('canvas');c.width=c.height=128;var g=c.getContext('2d'),gr=g.createRadialGradient(64,64,0,64,64,64);stops.forEach(function(s){gr.addColorStop(s[0],s[1])});g.fillStyle=gr;g.fillRect(0,0,128,128);return c}
function glow(p,r,a,c0,c1){if(!(a>0)||!(r>0))return;var k=c0+'|'+c1,s=GSP[k]||(GSP[k]=spr([[0,'rgba('+c0+',1)'],[.3,'rgba('+c1+',.5)'],[1,'rgba('+c1+',0)']]));hx.save();hx.globalCompositeOperation='lighter';hx.globalAlpha=Math.min(1,a);hx.drawImage(s,p[0]-r,p[1]-r,2*r,2*r);hx.restore()}
function arcAt(A,s){var m=1-s,a=A[0],c=A[1],e=A[2];return [m*m*a[0]+2*m*s*c[0]+s*s*e[0],m*m*a[1]+2*m*s*c[1]+s*s*e[1]]}
// a spent stage: its own thin arc, fainter where it passed earlier, a small sunlit dot, and a short flame for a boostback or landing burn;
// it fades out once it has fallen
function booster(A,s,a0,burn){if(!(s>0))return;var q=Math.min(1,s),al=a0*(s<=1?1:Math.max(0,1-(s-1)/.35));if(al<.01)return;hx.save();hx.globalCompositeOperation='lighter';hx.lineCap='butt';hx.lineWidth=.9;
  var n=Math.max(2,Math.ceil(q*30)),pr=arcAt(A,0);for(var i=1;i<=n;i++){var u=q*i/n,p=arcAt(A,u);hx.strokeStyle='rgba(255,200,160,'+(.42*al*(.25+.75*(u/q)*(u/q)))+')';hx.beginPath();hx.moveTo(pr[0],pr[1]);hx.lineTo(p[0],p[1]);hx.stroke();pr=p}
  if(s<=1)glow(pr,3.4,.75*al,'255,244,232','255,195,150');
  if(burn>0&&!reduce){var nx=arcAt(A,Math.min(1,q+.02)),dx=nx[0]-pr[0],dy=nx[1]-pr[1],m=Math.sqrt(dx*dx+dy*dy)||1,fl=(4+Math.random()*2)*burn;hx.strokeStyle='rgba(255,190,110,'+(.85*al)+')';hx.lineWidth=1.4;hx.beginPath();hx.moveTo(pr[0],pr[1]);hx.lineTo(pr[0]+dx/m*fl,pr[1]+dy/m*fl);hx.stroke();glow(pr,6,.5*al*burn,'255,230,190','255,150,70')}
  hx.restore()}
// long exposure trail: P is [[k, point]], sty(k) gives [core rgb, alpha, width, glow rgb, alpha, width]; a soft wide glow, then the thin core
function streak(P,sty,a0){if(P.length<2||!(a0>0))return;var S=[],j;for(j=1;j<P.length;j++)S.push(sty(P[j][0]));hx.save();hx.globalCompositeOperation='lighter';hx.lineCap='butt';
  for(var pass=0;pass<2;pass++)for(j=1;j<P.length;j++){var s=S[j-1],a=P[j-1][1],b=P[j][1];hx.strokeStyle='rgba('+(pass?s[0]:s[3])+','+Math.max(0,(pass?s[1]:s[4])*a0)+')';hx.lineWidth=pass?s[2]:s[5];hx.beginPath();hx.moveTo(a[0],a[1]);hx.lineTo(b[0],b[1]);hx.stroke()}hx.restore()}
// the vehicle: a small hot point with a short tapered plume behind it
function plume(p,ang,len,wid,c0,c1,a,gr,gc){if(!(a>0))return;hx.save();hx.globalCompositeOperation='lighter';hx.translate(p[0],p[1]);hx.rotate(ang);var g=hx.createLinearGradient(0,0,-len,0);g.addColorStop(0,'rgba('+c0+','+a+')');g.addColorStop(.4,'rgba('+c1+','+(.5*a)+')');g.addColorStop(1,'rgba('+c1+',0)');
  hx.fillStyle=g;hx.beginPath();hx.moveTo(1,-wid/2);hx.quadraticCurveTo(-len*.35,-wid*.55,-len,0);hx.quadraticCurveTo(-len*.35,wid*.55,1,wid/2);hx.closePath();hx.fill();hx.fillStyle='rgba(255,253,248,'+a+')';hx.beginPath();hx.arc(0,0,1.2,0,6.283);hx.fill();hx.restore();glow(p,gr,.8*a,'255,252,245',gc)}
// canvas resolution is capped (1.5 on phones, 2 elsewhere, the shade copy at 1.5), so the frame rate holds; the copies redraw after a resize
function sizeHero(){var r=HA.getBoundingClientRect();if(!r.width)return;HW=r.width;HH=r.height;HD=Math.min(HW<700?1.5:2,window.devicePixelRatio||1);if(HW*HH*HD*HD>5e6)HD=Math.max(1,Math.sqrt(5e6/(HW*HH)));SHD=Math.min(HD,1.5);
  hc.width=Math.round(HW*HD);hc.height=Math.round(HH*HD);hx.setTransform(HD,0,0,HD,0,0);PHC.width=Math.round((HW+2*BM)*HD);PHC.height=Math.round((HH+2*BM)*HD);SHC.width=Math.round(HW*SHD);SHC.height=Math.round(HH*SHD);LY={}}
// one framing for every launch: the cover fit (no bands at any size, and the photo never changes size between launches) with centerX
// in the middle of the hero and a drift of a few pixels. Only if the pad and the first half of its path would not fit (phones, where
// a slice of the photo shows) does the photo pan, at the same size, easing when the launch changes
function view(t,PH,dt){var ph=HW<700,s=Math.max(HW/IW,HH/IH),W=IW*s,H=IH*s,bb=PH.bb2,m=ph?24:40,lo=m-bb[0]*s,hi=HW-m-bb[2]*s,ox=ph?HW*.66-PH[0][0]*s:HW/2-PC.centerX*s,oy=(HH-H)*.35;ox=lo<=hi?clamp(ox,lo,hi):hi;
  if(CAM==null||reduce||CAM.w!==HW)CAM={ox:ox,w:HW};else CAM.ox+=(ox-CAM.ox)*(1-Math.exp(-(dt||0)*2.6));
  ox=CAM.ox;
  if(!reduce){ox+=Math.sin(t*.031)*1.5;oy+=Math.cos(t*.027)}return {s:s,ox:clamp(ox,HW-W,0),oy:clamp(oy,HH-H,0),W:W,H:H}}
// where the hero copy sits, in canvas pixels (padded a little): the line boxes of the title, subtitle and kicker, and each block below
function textRects(){var c=hc.getBoundingClientRect(),out=[];function add(r){if(r.width&&r.height)out.push([r.left-c.left-10,r.top-c.top-8,r.right-c.left+10,r.bottom-c.top+8])}
  ['#heroTitle','#heroSub','.hero-top'].forEach(function(s){var e=$(s);if(!e)return;var rg=document.createRange();rg.selectNodeContents(e);Array.prototype.forEach.call(rg.getClientRects(),add)});
  $$('.count>div,.hero-actions>*,.hero-facts>div').forEach(function(e){add(e.getBoundingClientRect())});return out}
// the flight readout sits beside the rocket where it overlaps the copy least (the copy is drawn over the canvas), always fully on
// screen; it keeps its side unless another is clearly better, so it does not hop about
var RDI=0;
function readoutPos(h,w,bh){var C=[[18,8],[18,-8-bh],[-18-w,8],[-18-w,-8-bh],[24,34],[24,-34-bh],[-24-w,34],[-24-w,-34-bh],[40,-70-bh],[-40-w,-70-bh],[40,70],[-40-w,70]];
  function at(i){var x=clamp(h[0]+C[i][0],8,HW-w-8),y=clamp(h[1]+C[i][1],8,HH-bh-8),b=[x-4,y-4,x+w+4,y+bh+4],c=i*30;(TXR||[]).forEach(function(r){c+=ovl(b,r)});return [x,y,c]}
  var cur=at(RDI),best=cur,bi=RDI;for(var i=0;i<C.length;i++){var q=at(i);if(q[2]<best[2]){best=q;bi=i}}if(best[2]<cur[2]-400){RDI=bi;return best}return cur}
function ovl(a,b){var w=Math.min(a[2],b[2])-Math.max(a[0],b[0]),h=Math.min(a[3],b[3])-Math.max(a[1],b[1]);return w>0&&h>0?w*h:0}
// a pad that sits behind the copy: a pulsing ring and a short name tag on a thin leader, placed where it overlaps the copy and the
// flight readout least (the copy is drawn over the canvas, so the tag has to find clear space)
function padTag(p,L,RB,t){var pu=reduce?.5:.5+.5*Math.sin(t*3.2),f=String(L.siteObj.full||'').split(','),pl=(f[1]||'').trim(),nm=((pl?pl+'  ·  ':'')+L.siteObj.n.replace(/^Space Launch Complex /i,'SLC ').replace(/^Launch Complex /i,'LC ').replace(/^Orbital Launch Mount /i,'OLM ')).toUpperCase(),avoid=RB?TXR.concat([RB]):TXR;
  hx.save();hx.font='600 10px Barlow, sans-serif';var tw=hx.measureText(nm).width+18,bh=22,best=null,bs=1e12;
  [[1,-1],[-1,-1],[0,-1.3],[1.3,0],[-1.3,0],[1,1],[-1,1],[0,1.3]].forEach(function(d){for(var k=1;k<=3;k+=.5){var ex=p[0]+d[0]*40*k,ey=p[1]+d[1]*30*k,bx=d[0]<0?ex-tw:d[0]>0?ex:ex-tw/2,by=d[1]<0&&!d[0]?ey-bh:d[1]>0&&!d[0]?ey:ey-bh/2,box=[bx,by,bx+tw,by+bh],c=k*40;
    if(bx<8||by<8||bx+tw>HW-8||by+bh>HH-8)c+=1e9;avoid.forEach(function(r){c+=ovl(box,r)});if(c<bs){bs=c;best=[box,ex,ey]}}});
  var b=best[0],a=Math.atan2(best[2]-p[1],best[1]-p[0]);
  hx.strokeStyle='rgba(185,168,255,'+(.5+.4*(1-pu))+')';hx.lineWidth=1.2;hx.beginPath();hx.arc(p[0],p[1],5+6*pu,0,6.283);hx.stroke();hx.fillStyle='#EDE8FF';hx.beginPath();hx.arc(p[0],p[1],2,0,6.283);hx.fill();
  hx.strokeStyle='rgba(185,168,255,.65)';hx.lineWidth=.8;hx.beginPath();hx.moveTo(p[0]+Math.cos(a)*12,p[1]+Math.sin(a)*12);hx.lineTo(best[1],best[2]);hx.stroke();
  hx.fillStyle='rgba(6,7,18,.82)';hx.fillRect(b[0],b[1],tw,bh);hx.strokeStyle='rgba(185,168,255,.5)';hx.strokeRect(b[0]+.5,b[1]+.5,tw-1,bh-1);hx.fillStyle='#fff';hx.fillText(nm,b[0]+9,b[1]+15);hx.restore()}
// the readability shade behind the copy (left to right, and toward the bottom); holes cut soft openings in it
function shade(g,holes,sc){var ph=HW<700,vg=g.createLinearGradient(0,0,HW*(ph?1:.62),0);vg.addColorStop(0,'rgba(0,0,0,'+(ph?.55:.72)+')');vg.addColorStop(.6,'rgba(0,0,0,'+(ph?.2:.35)+')');vg.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=vg;g.fillRect(0,0,HW,HH);
  var bg=g.createLinearGradient(0,HH*.55,0,HH);bg.addColorStop(0,'rgba(0,0,0,0)');bg.addColorStop(1,'rgba(0,0,0,.55)');g.fillStyle=bg;g.fillRect(0,HH*.55,HW,HH*.45);
  if(!holes)return;g.globalCompositeOperation='destination-out';holes.forEach(function(q){var r=Math.max(40,70*sc)*q[2],gr=g.createRadialGradient(q[0],q[1],0,q[0],q[1],r);gr.addColorStop(0,'rgba(0,0,0,.7)');gr.addColorStop(.5,'rgba(0,0,0,.4)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(q[0]-r,q[1]-r,2*r,2*r)});g.globalCompositeOperation='source-over'}
// the photo copy: the photo at view v with a margin of BM around it and the grain baked in, drawn again only when the photo, the size or
// the view moves past the margin; each frame it is copied in at the drift offset, rounded to whole device pixels
function drawPhoto(v){var key=HW+'x'+HH+'|'+(EFULL?1:0),r=LY.v0;
  if(LY.key!==key||!r||Math.abs(v.ox-r.ox)>BM-1||Math.abs(v.oy-r.oy)>BM-1||Math.abs(v.s-r.s)>1e-6){LY.key=key;LY.v0=r={s:v.s,ox:v.ox,oy:v.oy};var g=phx;
    g.setTransform(HD,0,0,HD,HD*BM,HD*BM);g.globalCompositeOperation='source-over';g.globalAlpha=1;g.fillStyle='#02040A';g.fillRect(-BM,-BM,HW+2*BM,HH+2*BM);g.imageSmoothingQuality='medium';g.drawImage(EIMG,v.ox,v.oy,IW*v.s,IH*v.s);
    g.setTransform(1,0,0,1,0,0);g.globalAlpha=.06;g.globalCompositeOperation='overlay';g.fillStyle=g.createPattern(grainTile(),'repeat');g.fillRect(0,0,PHC.width,PHC.height);g.globalAlpha=1;g.globalCompositeOperation='source-over'}
  var dx=Math.round((v.ox-r.ox-BM)*HD)/HD,dy=Math.round((v.oy-r.oy-BM)*HD)/HD;hx.drawImage(PHC,dx,dy,HW+2*BM,HH+2*BM)}
// the readability shade, vignette and (on phones) the fade into the page: drawn again only when the launch, the size or the pad's hole moves
function shadeLayer(key,holes,sc){if(LY.sk!==key){LY.sk=key;var g=shx;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,SHC.width,SHC.height);g.setTransform(SHD,0,0,SHD,0,0);shade(g,holes,sc);
  var R0=Math.max(HW,HH),vr=g.createRadialGradient(HW*.6,HH*.48,R0*.35,HW*.6,HH*.48,R0*.85);vr.addColorStop(0,'rgba(0,0,0,0)');vr.addColorStop(1,'rgba(0,0,0,.45)');g.fillStyle=vr;g.fillRect(0,0,HW,HH);
  if(HW<700){var pf=g.createLinearGradient(0,HH*.78,0,HH);pf.addColorStop(0,'rgba(4,5,12,0)');pf.addColorStop(1,'rgba(4,5,12,1)');g.fillStyle=pf;g.fillRect(0,HH*.78,HW,HH*.22)}}
  hx.drawImage(SHC,0,0,HW,HH)}
// the sunrise on the horizon, breathing: one cached sprite stretched into a flat ellipse
function drawSun(v,t){var sr=I2S(v,PC.sunrise),R=70*v.s;if(sr[0]+4*R<0||sr[0]-4*R>HW||sr[1]+R<0||sr[1]-R>HH)return;var br=reduce?1:.75+.25*Math.sin(t*.35),s=GSP.sun||(GSP.sun=spr([[0,'rgba(255,220,170,.2)'],[1,'rgba(255,160,90,0)']]));
  hx.save();hx.globalCompositeOperation='lighter';hx.globalAlpha=br;hx.translate(sr[0],sr[1]);hx.rotate(.02);hx.scale(4,1);hx.drawImage(s,-R,-R,2*R,2*R);hx.restore()}
function I2S(v,p){return [v.ox+p[0]*v.s,v.oy+p[1]*v.s]}
function drawHero(dt){if(!HW)return;if(!TXR||++TXN%60===0)TXR=textRects();var LL=L0(),PH=photoPath(LL),inFL=!!PH,G=null,v=null,sp,RB=null,RD=null;
  // with reduced motion the hero is one still frame: draw it until it has settled, then only again when something changes
  if(inFL){if(!EOK)return}else{G=globeFor(LL);if(!G)return}
  if(reduce){var rk=LL.id+'|'+HW+'x'+HH+'|'+EFULL+'|'+!!GLOW+'|'+!!(CLD&&CLD.ready)+'|'+glints.length;if(rk===LY.rk&&LY.rn>3)return;LY.rn=rk===LY.rk?LY.rn+1:0;LY.rk=rk}else T+=dt;var t=reduce?14:T;
  if(inFL){v=view(t,PH,dt);drawPhoto(v);drawStars(t,pstars,v);sp=function(x,y){return spacePhoto((x-v.ox)/v.s,(y-v.oy)/v.s)}}
  else{hx.drawImage(G.cv,0,0,HW,HH);globeClouds(G,t,hx);drawStars(t,G.st,null);globeTwinkle(G,t);sp=function(x,y){return clamp((Math.hypot(x-G.disk[0],y-G.disk[1])/G.disk[2]-1.08)/.06,0,1)}}
  meteors(t,dt,sp);
  if(inFL){drawClouds(v,t);drawGlow(v,t);drawLights(v,t);drawSun(v,t)}
  // launch from the pad along its real flight path; flight time is warped so T+, altitude and the staging events match ORB. It is drawn
  // like a long exposure: the trail stays in the sky behind the rocket and fades out slowly after the flight ends
  var lt=t%LOOP,tau=lt-PADT,end47=PADT+FLY,fade=lt<end47?1:Math.max(0,1-(lt-end47)/AFTER),on=lt<end47?1:Math.max(0,1-(lt-end47)/.8),ST=LL.stg,end=LL.end,k=tau>0?Math.pow(Math.min(1,tau/FLY),1/WARP):0,sc=clamp(HW/1440,.6,1.5),hs=clamp(HW/1440,.8,1.3);
  if(lt<lastLt)SMOKE.length=0;lastLt=lt;
  function tauOf(T1){return FLY*Math.pow(clamp(T1/end,0,1),WARP)}
  function bez(k1){if(G)return G.at(k1);return I2S(v,photoAt(PH,k1))}
  function dirAt(k1){var a=bez(clamp(k1-.008,0,1)),b=bez(clamp(k1+.008,0,1)),dx=b[0]-a[0],dy=b[1]-a[1],m=Math.sqrt(dx*dx+dy*dy)||1;return [dx/m,dy/m]}
  var base=G?G.pad:I2S(v,PH[0]),h=bez(k),low=1-clamp(k*end/90,0,1),kE=G?1:PH.kEnd,eF=function(u){return kE<1?clamp((kE-u)/.06,0,1):1};
  for(var jj=1;jj<=100;jj++){var pq=bez(jj/100);if(pq[0]<12||pq[0]>HW-12||pq[1]<12||pq[1]>HH-12){kE=Math.min(kE,(jj-1)/100);break}}on*=eF(k);
  // pad: floodlights and a pulsing marker, the engine start flicker and flash, then a small hot spot that stays in the exposure
  if(lt<IGN+.4){var pu2=reduce?.6:.5+.5*Math.sin(t*5),fo=lt<IGN?1:(IGN+.4-lt)/.4;glow(base,12*sc,.5*fo,'235,240,255','170,190,255');hx.strokeStyle='rgba(185,168,255,'+(.5+.4*pu2)*fo+')';hx.lineWidth=1.2;hx.beginPath();hx.arc(base[0],base[1],(5+6*pu2)*sc,0,6.283);hx.stroke()}
  if(lt>IGN-.5&&lt<IGN)glow(base,7*sc,(lt-IGN+.5)*1.4*(reduce?1:.7+.3*Math.random()),'255,230,190','255,160,80');
  if(lt>IGN&&lt<IGN+.7){var fl0=1-(lt-IGN)/.7;glow(base,(10+14*(1-fl0))*sc,.9*fl0,'255,255,250','255,200,140')}
  if(lt>IGN&&fade>0){var gi=Math.min(1,(lt-IGN)/.5)*fade;glow(base,22*sc,(.08+.14*(tau>0?low:1))*gi,'255,190,120','255,140,60');glow(base,5*sc,.75*gi,'255,246,225','255,190,110')}
  // a small exhaust cloud at the pad, lit orange from below while the rocket is low
  if(!reduce&&lt>IGN&&lt<PADT+5){SMOKE.acc=(SMOKE.acc||0)+dt;while(SMOKE.acc>1/12){SMOKE.acc-=1/12;var side=Math.random()<.5?-1:1,sp0=(3+Math.random()*6)*sc;SMOKE.push({x:base[0]+(Math.random()-.5)*2*sc,y:base[1]-Math.random()*sc,vx:side*sp0,vy:-(.3+Math.random()*1.5)*sc,r:(1+Math.random())*sc,g:(1.5+Math.random()*2.5)*sc,a:0,m:3+Math.random()*2})}}
  if(SMOKE.length){var lit=lt>IGN?(tau>0?low:1)*fade:0,S0=GSP.sm0||(GSP.sm0=spr([[0,'rgba(170,176,192,1)'],[1,'rgba(140,148,166,0)']])),S1=GSP.sm1||(GSP.sm1=spr([[0,'rgba(255,160,80,1)'],[1,'rgba(255,130,60,0)']]));hx.save();
    for(var j=SMOKE.length-1;j>=0;j--){var sm=SMOKE[j];sm.a+=dt;if(sm.a>sm.m){SMOKE.splice(j,1);continue}var e=Math.exp(-sm.a*.9);sm.x+=sm.vx*e*dt;sm.y+=sm.vy*dt;var rr=sm.r+sm.g*(1-Math.exp(-sm.a*.7)),fa=Math.min(1,sm.a/.3)*(1-sm.a/sm.m)*fade;
      hx.globalAlpha=.16*fa;hx.drawImage(S0,sm.x-rr,sm.y-rr,2*rr,2*rr);
      if(lit>.02){hx.globalCompositeOperation='lighter';hx.globalAlpha=.14*fa*lit;hx.drawImage(S1,sm.x-rr,sm.y-.7*rr,2*rr,2*rr);hx.globalCompositeOperation='source-over'}}hx.restore()}
  if(k>0&&fade>0){var mk=ST.meco/end,sk=ST.sep/end,ik=ST.ign2/end,tM=tauOf(ST.meco),tS=tauOf(ST.sep),tI=tauOf(ST.ign2),Tf=k*end,ws=clamp(HW/1440,.85,1.1),sideK=ST.side?ST.side/end:0,N=LOWP?100:150;
    function pts(k0,k1){var o=[[k0,bez(k0)]];for(var j=Math.floor(k0*N)+1;j<k1*N;j++)o.push([j/N,bez(j/N)]);o.push([k1,bez(k1)]);return o}
    function fresh(u){return .3*Math.exp(-(tau-tauOf(u*end))/1.2)}
    function edged(sty){return function(u){var r=sty(u),f=eF(u);r[1]*=f;r[4]*=f;return r}}
    // the trail: the first stage hot and orange white near the pad, cooling and thinning higher up (wider while Heavy's three cores burn);
    // the upper stage a thinner blue white line after the gap of the coast
    streak(pts(0,Math.min(k,mk,kE)),edged(function(u){var e=u/mk,fr=fresh(u),x3=u<sideK?1.3:1;return ['255,'+(232-60*e|0)+','+(190-110*e|0),Math.min(1,.95-.4*e+fr),(1.9-.7*e)*ws*x3,'255,140,60',.2-.12*e+fr*.2,(8-4*e)*ws*x3]}),fade);
    if(k>ik&&ik<kE)streak(pts(ik,Math.min(k,kE)),edged(function(u){var e=(u-ik)/(1-ik),fr=fresh(u);return ['205,222,255',Math.min(1,.75-.25*e+fr),(1.35-.3*e)*ws,'120,165,255',.12-.05*e+fr*.15,(5-1.5*e)*ws]}),fade);
    // spent stages peel away on their own thin fading arcs and fall back: Heavy side boosters first, Vulcan solids, then the first stage or Super Heavy
    var U=clamp(HW*.07,40,110),tL=tauOf(ST.land||ST.sep+230),lb=function(s){return s>.86&&s<1?1:0};
    function fallFrom(kk,cf,ef){var S0=bez(kk),d=dirAt(kk),n=[-d[1],d[0]];return [S0,[S0[0]+d[0]*U*cf[0]+n[0]*U*cf[1],S0[1]+d[1]*U*cf[0]+n[1]*U*cf[1]],[S0[0]+d[0]*U*ef[0]+n[0]*U*ef[1],S0[1]+d[1]*U*ef[0]+n[1]*U*ef[1]+U*ef[2]]]}
    if(ST.srb){var tr0=tauOf(ST.srb);[1,-1].forEach(function(sg){booster(fallFrom(ST.srb/end,[.3,.45*sg],[.05,.8*sg,1.3]),(tau-tr0)/6,fade,0)})}
    if(ST.side){var ts0=tauOf(ST.side),TBs=clamp(tL-ts0,6,14);[1,-1].forEach(function(sg){var s=(tau-ts0)/TBs;booster(fallFrom(sideK,[.35,.45*sg],[-.7,.35*sg,.9]),s,fade,lb(s))})}
    var s1=(tau-tS)/clamp(tL-tS,7,16),bb=0;if(ST.bb){var tb=tauOf(ST.bb);if(tau>tb&&tau<tb+1.5)bb=.8}
    booster(ST.hot?fallFrom(sk,[.1,.1],[-.45,.25,1.4]):fallFrom(sk,[.6,.12],[-.15,.3,1.1]),s1,fade,Math.max(bb,lb(s1)));
    // engine cutoff blink, a small bright separation flash (a bigger fiery one for hot staging), side booster and solid separation
    if(!ST.hot&&tau>tM&&tau<tM+.4)glow(bez(mk),8*hs,.6*(1-(tau-tM)/.4)*fade,'255,240,220','255,190,120');
    var fs=tau-tS,fd=ST.hot?1.4:.7;if(fs>0&&fs<fd){var f1=1-fs/fd,P0=bez(sk);glow(P0,(ST.hot?24:14)*hs,.95*f1*fade,'255,255,255',ST.hot?'255,150,60':'255,225,200');hx.strokeStyle='rgba(255,240,220,'+(.35*f1*fade)+')';hx.lineWidth=.8;hx.beginPath();hx.arc(P0[0],P0[1],(3+fs*(ST.hot?22:16))*hs,0,6.283);hx.stroke()}
    if(ST.side){var fs2=tau-tauOf(ST.side);if(fs2>0&&fs2<.7)glow(bez(sideK),12*hs,.8*(1-fs2/.7)*fade,'255,255,255','255,215,180')}
    if(ST.srb){var fs3=tau-tauOf(ST.srb);if(fs3>0&&fs3<.6)glow(bez(ST.srb/end),9*hs,.6*(1-fs3/.6)*fade,'255,250,240','255,200,150')}
    // upper stage engine start: a tiny blue white flare with a faint glint
    var fi=tau-tI;if(!ST.hot&&ST.ign2<end&&fi>0&&fi<.6){var f2=1-fi/.6,cr=(3+7*f2)*hs;glow(h,11*hs,.9*f2*on,'250,252,255','150,190,255');hx.strokeStyle='rgba(220,232,255,'+(.5*f2*on)+')';hx.lineWidth=.7;hx.beginPath();hx.moveTo(h[0]-cr,h[1]);hx.lineTo(h[0]+cr,h[1]);hx.moveTo(h[0],h[1]-cr);hx.lineTo(h[0],h[1]+cr);hx.stroke()}
    // the vehicle: small and hot, orange for the first stage (a little longer while Heavy's side boosters burn), blue white for the upper stage
    var dv=dirAt(k),ang=Math.atan2(dv[1],dv[0]),p1s=tau<tM?1:Math.max(0,1-(tau-tM)/.3),p2s=tau<tI||ST.ign2>=end?0:Math.min(1,(tau-tI)/.4),fk=reduce?1:.9+Math.random()*.2,grow=.6+.4*Math.min(1,tau/2.5);
    if(p1s>0&&low>0)glow(h,16*sc,.12*low*p1s*on,'255,200,140','255,150,70');
    if(p1s>0)plume(h,ang,(10+5*grow)*hs*fk*(ST.side&&tau<tauOf(ST.side)?1.25:1),2.6*hs,'255,236,200','255,140,50',p1s*on,7*hs,'255,190,110');
    if(p2s>0)plume(h,ang,(ST.hot?10:7)*hs*fk,(ST.hot?2.2:1.7)*hs,'235,244,255','120,165,255',p2s*on,5*hs,'150,190,255');
    // readout: T+ and altitude from the profile, plus the latest event name from the model; always kept fully on screen
    if(HW>=700&&lt<end47&&on>.4){var sv=ORB.interp(ORB.PROF[LL.v],Tf),ev='';LL.events.forEach(function(e){if(e[0]>0&&tau>=tauOf(e[0])&&tau<tauOf(e[0])+3)ev=e[1].toUpperCase()});hx.font='600 10.5px Barlow, sans-serif';
      var t1=LL.veh.toUpperCase()+'  T+'+fmtTs(Tf)+'  ·  '+Math.round(sv[0])+' KM',tw2=Math.max(hx.measureText(t1).width,ev?hx.measureText(ev).width:0)+18,bh=ev?38:22,pos=readoutPos(h,tw2,bh),tx=pos[0],ty=pos[1];RB=[tx-4,ty-4,tx+tw2+4,ty+bh+4];
      RD=[t1,ev,tx,ty,tw2,bh]}
  }
  // keep the copy readable; when the pad sits in the shaded area, a soft hole around the pad and the first part of the path lets the
  // launch show through (small enough that the headline stays readable). Then a soft vignette and a faint grain
  var holes=null;if(base[0]<(HW<700?HW:HW*.62)||base[1]>HH*.55){holes=[[base[0],base[1],1]];for(var jh=1;jh<=6;jh++){var hp=bez(Math.min(kE,.05*jh));holes.push([hp[0],hp[1],1-jh*.08])}}
  shadeLayer(LL.id+'|'+HW+'x'+HH+'|'+(G?G.key:'p')+'|'+(holes?Math.round(base[0]/6)+','+Math.round(base[1]/6):''),holes,sc);
  if(TXR.some(function(r){return base[0]>r[0]-16&&base[0]<r[2]+16&&base[1]>r[1]-16&&base[1]<r[3]+16}))padTag(base,LL,RB,t);
  // the readout goes on last, above the shade, so it stays crisp wherever it sits
  if(RD){hx.font='600 10.5px Barlow, sans-serif';hx.fillStyle='rgba(0,0,0,.6)';hx.fillRect(RD[2],RD[3],RD[4],RD[5]);hx.fillStyle='#fff';hx.fillText(RD[0],RD[2]+9,RD[3]+15);if(RD[1]){hx.fillStyle='#B9A8FF';hx.fillText(RD[1],RD[2]+9,RD[3]+31)}}}

/* view card */
function setTxt(sel,v){$(sel).textContent=v}
function renderView(){var L=L0(),o=S.obs,v=vis(L);setTxt('#vcLoc',o.city+' '+o.zip);
  var big=v.score===4?'Excellent view':v.score===3?'Great view':v.score===2?'Good view':v.score===1?'Low view':'Not visible';if(v.best&&v.day)big='Daytime';
  var az=v.best?v.best.az:bearingTo(o,L.siteObj.lat,L.siteObj.lon),dw=DIRW[ORB.dir16(az)];
  var sub=v.best?(v.day?'It is daylight. Look '+dw+' for the exhaust trail.':'Look '+dw+', '+elWord(v.best.el)+', from T+'+fmtTs(v.first)+'.'):'It stays below the horizon from '+o.short+'. Watch the stream.';
  setTxt('#vcBig',big);setTxt('#vcSub',sub);setTxt('#vcDir',ORB.dir16(az)+' '+Math.round(az)+'°');setTxt('#vcPeak',v.best?Math.round(v.best.el)+'°':'Below horizon');setTxt('#vcWin',v.best?'T+'+fmtTs(v.first)+' to '+fmtTs(v.last):'Not in view');setTxt('#vcDist',Math.round(ORB.dist(o.lat,o.lon,L.siteObj.lat,L.siteObj.lon)*.621)+' mi');
  aimNeedle(az);$('#cpDeg').textContent=String(Math.round(az)).padStart(3,'0')+'°';$('#cpDir').textContent=ORB.dir16(az);var wd='';if(v.best&&v.firstS){var a1=v.firstS.az,a2=v.samples[Math.min(v.samples.length-1,Math.round(v.last/2))].az,dd=wrap180(a2-a1);if(Math.abs(dd)<6){a1-=3;dd=6*(dd<0?-1:1)}var R1=96,R2=106,Pp=function(a,r){var q=(a-90)*Math.PI/180;return (120+r*Math.cos(q)).toFixed(1)+' '+(120+r*Math.sin(q)).toFixed(1)},sw=dd>0?1:0,lg=Math.abs(dd)>180?1:0;wd='M'+Pp(a1,R2)+' A'+R2+' '+R2+' 0 '+lg+' '+sw+' '+Pp(a1+dd,R2)+' L'+Pp(a1+dd,R1)+' A'+R1+' '+R1+' 0 '+lg+' '+(1-sw)+' '+Pp(a1,R1)+' Z'}$('#vcWedge').setAttribute('d',wd);setTxt('#skyFace',ORB.dir16(az));SV={};sizeSky()}

/* sky sim */
var sc=$('#skyc'),sx=sc.getContext('2d'),SW=0,SH=0,SD=1,SV={},sstars=[];
function sizeSky(){var r=sc.getBoundingClientRect();if(!r.width)return;RPW=RPT.clientWidth;RPF0=-1;SW=r.width;SH=r.height;SD=Math.min(2,window.devicePixelRatio||1);sc.width=Math.round(SW*SD);sc.height=Math.round(SH*SD);sx.setTransform(SD,0,0,SD,0,0);sstars=[];for(var i=0;i<140;i++)sstars.push({a:Math.random()*360,e:Math.pow(Math.random(),.9)*80,r:.4+Math.random()*.8,b:Math.random()});
  var L=L0(),v=vis(L),o=S.obs,hy=SH-(SW<600?64:72),top=50,avail=hy-top;var pts=v.samples.filter(function(s){return s.el>-2&&s.range<1600});
  if(v.best&&pts.length){var ax=0,ay=0;pts.forEach(function(s){ax+=Math.sin(s.az*Math.PI/180);ay+=Math.cos(s.az*Math.PI/180)});var vc=(Math.atan2(ax,ay)*180/Math.PI+360)%360,spread=0;pts.forEach(function(s){spread=Math.max(spread,Math.abs(wrap180(s.az-vc)))});SV={vc:vc,k:Math.min(SW/Math.max(50,spread*2+24),avail*.85/Math.max(v.best.el,5)),hy:hy,ok:true}}
  else SV={vc:bearingTo(o,L.siteObj.lat,L.siteObj.lon),k:SW/100,hy:hy,ok:false};SV.padAz=bearingTo(o,L.siteObj.lat,L.siteObj.lon)}
function skyXY(az,el){return [SW/2+wrap180(az-SV.vc)*SV.k,SV.hy-el*SV.k]}
function sampleAt(L,v,t){var arr=v.samples;if(t<=0)return arr[0];var f=t/2,i=Math.min(arr.length-2,Math.floor(f)),u=f-i,a=arr[i],b=arr[i+1];return {az:a.az+wrap180(b.az-a.az)*u,el:a.el+(b.el-a.el)*u,range:a.range+(b.range-a.range)*u}}
function drawSky(){if(!SW||!SV.hy)return;var L=L0(),v=vis(L),o=S.obs,hy=SV.hy,d=new Date(new Date(L.utc).getTime()+Math.max(0,S.simT)*1000),se=ORB.sunEl(o.lat,o.lon,d),dark=clamp((-se-2)/12,0,1);
  var top=se<-14?[2,3,8]:se<-4?[6,10,24]:se<4?[14,28,60]:[22,60,110],bot=se<-14?[8,14,30]:se<-4?[40,46,80]:se<4?[70,100,150]:[90,140,190];
  var gk=top+'|'+bot+'|'+hy;if(SKG.k!==gk){var g=sx.createLinearGradient(0,0,0,hy);g.addColorStop(0,'rgb('+top.join(',')+')');g.addColorStop(1,'rgb('+bot.join(',')+')');SKG={k:gk,g:g}}sx.fillStyle=SKG.g;sx.fillRect(0,0,SW,SH);
  if(se>-18){var saz=ORB.sunAz(o.lat,o.lon,d),sp=skyXY(saz,0),gl=clamp((se+18)/18,0,1);var rg=sx.createRadialGradient(sp[0],hy,0,sp[0],hy,SW*.5);rg.addColorStop(0,'rgba(255,170,110,'+(.35*gl)+')');rg.addColorStop(1,'rgba(255,120,90,0)');sx.fillStyle=rg;sx.fillRect(0,0,SW,hy)}
  if(dark>.02){sx.fillStyle='#fff';for(var i=0;i<sstars.length;i++){var s=sstars[i],p=skyXY(SV.vc+s.a-180,s.e);if(p[0]<0||p[0]>SW||p[1]>hy)continue;sx.globalAlpha=dark*(.3+.6*s.b);sx.beginPath();sx.arc(p[0],p[1],s.r,0,6.283);sx.fill()}sx.globalAlpha=1}
  sx.save();sx.setLineDash([2,6]);sx.strokeStyle='rgba(255,255,255,.14)';sx.font='500 10px Barlow, sans-serif';sx.fillStyle='rgba(255,255,255,.45)';var step=SV.k*10<34?20:10;for(var e=step;e<90;e+=step){var y=hy-e*SV.k;if(y<30)break;sx.beginPath();sx.moveTo(0,y);sx.lineTo(SW,y);sx.stroke();sx.fillText(e+'°',SW-30,y-4)}sx.restore();
  var smp=v.samples,pts=[];for(var j=0;j<smp.length;j++){var q=smp[j];pts.push(q.el>-1.5&&q.range<1600?skyXY(q.az,q.el):null)}
  // the predicted path, drawn in over a second and a half when the card first shows (and after a change of launch or ZIP)
  var nv=0,ak=reduce?1:arcT0?clamp((performance.now()-arcT0)/1500,0,1):0;ak=1-Math.pow(1-ak,3);for(j=0;j<pts.length;j++)if(pts[j])nv++;var lim=Math.ceil(nv*ak),dn=0;
  sx.save();sx.setLineDash([3,7]);sx.strokeStyle='rgba(255,255,255,.28)';sx.lineWidth=1;sx.beginPath();var pen=false;for(j=0;j<pts.length&&dn<lim;j++){if(pts[j]){dn++;if(!pen){sx.moveTo(pts[j][0],pts[j][1]);pen=true}else sx.lineTo(pts[j][0],pts[j][1])}else pen=false}sx.stroke();sx.restore();
  var ci=Math.min(pts.length-1,Math.floor(Math.max(0,S.simT)/2)),cur=sampleAt(L,v,S.simT);
  if(S.simT>0){sx.save();sx.lineCap='round';for(j=1;j<=ci;j++){var a=pts[j-1],b=pts[j];if(!a||!b)continue;var al=Math.max(.08,1-(S.simT-j*2)/240);sx.strokeStyle='rgba(255,'+Math.round(190+50*j/Math.max(1,ci))+','+Math.round(130+100*j/Math.max(1,ci))+','+al*.9+')';sx.lineWidth=1.8;sx.beginPath();sx.moveTo(a[0],a[1]);sx.lineTo(b[0],b[1]);sx.stroke()}sx.restore()}
  // ground
  sx.fillStyle='#000';sx.fillRect(0,hy,SW,SH-hy);sx.strokeStyle='rgba(255,255,255,.35)';sx.beginPath();sx.moveTo(0,hy+.5);sx.lineTo(SW,hy+.5);sx.stroke();
  sx.font='600 10px Barlow, sans-serif';sx.textAlign='center';var card={0:'N',45:'NE',90:'E',135:'SE',180:'S',225:'SW',270:'W',315:'NW'},half=SW/2/SV.k;for(var az=Math.ceil((SV.vc-half)/5)*5;az<=SV.vc+half;az+=5){var xx=SW/2+(az-SV.vc)*SV.k,an=((az%360)+360)%360,big=an%15===0;sx.strokeStyle='rgba(255,255,255,'+(big?.45:.18)+')';sx.beginPath();sx.moveTo(xx,hy+3);sx.lineTo(xx,hy+(big?10:6));sx.stroke();if(card[an]!==undefined){sx.fillStyle='#fff';sx.fillText(card[an],xx,hy+24)}}
  var pdx=SW/2+wrap180(SV.padAz-SV.vc)*SV.k;if(pdx>0&&pdx<SW){sx.fillStyle='#B9A8FF';sx.beginPath();sx.moveTo(pdx,hy+30);sx.lineTo(pdx-4,hy+37);sx.lineTo(pdx+4,hy+37);sx.fill()}sx.textAlign='left';
  var visible=S.simT>0&&S.simT<L.end&&cur.el>-1&&cur.range<1600;
  if(visible){var rp=skyXY(cur.az,cur.el),fk=reduce?1:.85+Math.random()*.3;sx.save();sx.globalCompositeOperation='lighter';var hg=sx.createRadialGradient(rp[0],rp[1],0,rp[0],rp[1],24*fk);hg.addColorStop(0,'rgba(255,250,240,1)');hg.addColorStop(.2,'rgba(255,225,170,.8)');hg.addColorStop(1,'rgba(255,140,60,0)');sx.fillStyle=hg;sx.beginPath();sx.arc(rp[0],rp[1],24*fk,0,6.283);sx.fill();sx.restore();
    sx.font='500 11px Barlow, sans-serif';var tx=L.veh.toUpperCase()+'  '+fmtT(S.simT)+'   ALT '+Math.round(ORB.interp(ORB.PROF[L.v],S.simT)[0])+' KM   EL '+cur.el.toFixed(0)+'°',tw=sx.measureText(tx).width+16,bx=clamp(rp[0]+18,8,SW-tw-8),by=rp[1]-34;if(by<8)by=rp[1]+20;sx.fillStyle='rgba(0,0,0,.6)';sx.fillRect(bx,by,tw,22);sx.fillStyle='#fff';sx.fillText(tx,bx+8,by+15)}
  else if(SV.ok&&S.simT<v.first){var f0=v.firstS,fp=skyXY(f0.az,Math.max(0,f0.el)),pul=reduce?1:.5+.5*Math.sin(T*3);sx.strokeStyle='rgba(185,168,255,'+(.35+.5*pul)+')';sx.lineWidth=1.2;sx.beginPath();sx.arc(fp[0],fp[1],8+6*pul,0,6.283);sx.stroke();sx.font='500 11px Barlow, sans-serif';sx.fillStyle='#fff';var lb='RISES HERE AT T+'+fmtTs(v.first),lw=sx.measureText(lb).width;sx.fillText(lb,clamp(fp[0]-lw/2,8,SW-lw-8),fp[1]-22)}
  if(!SV.ok){sx.font='600 22px "Barlow Condensed", sans-serif';sx.textAlign='center';sx.fillStyle='rgba(255,255,255,.9)';sx.fillText('BELOW YOUR HORIZON',SW/2,hy-60);sx.font='400 13px Barlow, sans-serif';sx.fillStyle='rgba(255,255,255,.6)';sx.fillText('This launch never clears the horizon from '+o.city+'.',SW/2,hy-38);sx.textAlign='left'}
  var sp2=[-10,L.end+8],f=clamp((S.simT-sp2[0])/(sp2[1]-sp2[0]),0,1);if(Math.abs(f-RPF0)>.0005){RPF0=f;RPF.style.transform='scaleX('+f.toFixed(4)+')';RPH.style.transform='translateX('+(f*RPW).toFixed(1)+'px)'}
  var vt=fmtT(S.simT);if(vt!==lastVt){lastVt=vt;RPC.textContent=vt;RPT.setAttribute('aria-valuenow',Math.round(f*100));RPT.setAttribute('aria-valuetext',vt)}}
var lastVt='',SKG={},RPF=$('#rpFill'),RPH=$('#rpHead'),RPC=$('#rpClock'),RPT=$('#rpTrack'),RPW=0,RPF0=-1;
var playI='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',pauseI='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
function setPlaying(p){S.playing=p;$('#rpPlay').innerHTML=p?pauseI:playI;$('#rpPlay').setAttribute('aria-label',p?'Pause':'Play')}
$('#rpPlay').addEventListener('click',function(){setPlaying(!S.playing)});
(function(){var tr=$('#rpTrack'),drag=false;function setFrom(e){var r=tr.getBoundingClientRect(),f=clamp((e.clientX-r.left)/r.width,0,1);S.simT=-10+f*(L0().end+18)}tr.addEventListener('pointerdown',function(e){drag=true;tr.setPointerCapture(e.pointerId);setFrom(e)});tr.addEventListener('pointermove',function(e){if(drag)setFrom(e)});tr.addEventListener('pointerup',function(){drag=false});tr.addEventListener('keydown',function(e){if(e.key==='ArrowRight'){S.simT+=10;e.preventDefault()}if(e.key==='ArrowLeft'){S.simT-=10;e.preventDefault()}if(e.key===' '){setPlaying(!S.playing);e.preventDefault()}})})();

/* manifest */
var bellSvg='<svg class="ico" width="20" height="20" aria-hidden="true"><use href="#i-bell"/></svg>';
function watchBtn(L){var w=watchOf(L);return w?'<a class="btn btn-sm btn-watch" href="'+esc(w.url)+'" target="_blank" rel="noopener" aria-label="Watch '+esc(L.veh+' '+L.mis)+' on '+esc(w.src)+'"><svg class="ico" width="14" height="14" aria-hidden="true"><use href="#i-play"/></svg>Watch</a>':'<span class="btn btn-sm btn-off" aria-disabled="true">No stream</span>'}
function srcTag(L){var w=watchOf(L);return '<span class="r-src">'+(w?(w.own?'Webcast · ':'Live page · ')+esc(w.src):'No official stream listed yet')+'</span>'}
// the filter bar: All, then each provider with launches in the list (and the picked one, even with none), in providers.json order
function renderFilter(){var n={},names={},order=[];LAUNCHES.forEach(function(L){var k=provKey(L);if(!n[k]){n[k]=0;names[k]=provOf(L).n}n[k]++});
  PROVS.forEach(function(p){if(n[p.key]||S.pf===p.key)order.push(p.key)});Object.keys(n).forEach(function(k){if(!PROV[k])order.push(k)});
  if(S.pf&&!PROV[S.pf]&&!n[S.pf])S.pf=null;
  var chip=function(k,label,c){var on=(S.pf||null)===k;return '<button type="button" class="pf-chip" data-pf="'+esc(k||'')+'" aria-pressed="'+on+'">'+esc(label)+'<span class="tnum">'+c+'</span></button>'};
  var bar=$('#pfilter');bar.innerHTML=chip(null,'All',LAUNCHES.length)+order.map(function(k){return chip(k,PROV[k]?PROV[k].n:names[k],n[k]||0)}).join('');
  // on phones the bar scrolls sideways: keep the picked chip in view
  var on=bar.querySelector('[aria-pressed="true"]');if(on&&bar.scrollWidth>bar.clientWidth)bar.scrollLeft=Math.max(0,on.offsetLeft-bar.offsetLeft-24)}
function setFilter(k){S.pf=k||null;renderFilter();renderRows()}
$('#pfilter').addEventListener('click',function(e){var b=e.target.closest('[data-pf]');if(b)setFilter(b.dataset.pf)});
function renderRows(){var shown=0,html=LAUNCHES.map(function(L,i){if(S.pf&&provKey(L)!==S.pf)return '';var v=vis(L),on=!!S.rem[L.id],st=STATUS[L.st],P=provOf(L),ps=safeUrl(P.site,null),d=shown++;
  var vt=v.best?'<b>'+(v.day?'Daytime':v.rating)+'</b><span>Look '+ORB.dir16(v.best.az)+' · peak '+Math.round(v.best.el)+'°</span>':'<b style="color:var(--fg-3)">Not visible</b><span>Below your horizon</span>';
  return '<div class="row'+(i===S.cur?' sel" aria-current="true':'')+'" style="animation-delay:'+(d*.06)+'s"><div><div class="r-day">'+fmtDay(L)+'</div><div class="r-time tnum">'+fmtTime(L)+'</div></div><div><div class="r-prov">'+esc(P.n)+'</div><div class="r-veh">'+esc(L.veh)+'</div><div class="r-mis">'+esc(L.mis)+'</div><div class="r-links">'+srcTag(L)+(infoUrl(L)?'<a href="'+esc(infoUrl(L))+'" target="_blank" rel="noopener">Mission page</a>':'')+(ps?'<a href="'+esc(ps)+'" target="_blank" rel="noopener">'+esc(P.n)+' site</a>':'')+'<button type="button" class="lnk" data-ics="'+i+'">Add to calendar</button></div></div><div class="r-pad">'+esc(L.siteObj.full)+'</div><div class="r-vis">'+vt+'</div><div class="r-st"><span class="status '+st[0]+'">'+st[2]+'</span></div><div class="r-acts">'+watchBtn(L)+'<button class="btn btn-sm" type="button" data-track="'+i+'">View</button><button class="bell" type="button" data-id="'+L.id+'" aria-pressed="'+on+'" aria-label="Reminder for '+esc(L.veh+' '+L.mis)+'">'+bellSvg+'</button></div></div>'}).join('');
  if(!shown){var P=PROV[S.pf],lk=function(u,t){u=safeUrl(u,null);return u?'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+t+'</a>':''};html='<div class="rows-empty"><p>No '+esc(P?P.n:'')+' launches in the next 30 days.</p><div class="r-links">'+(P?lk(P.live,'Watch live')+lk(P.site,'Website')+lk(P.social,'Social'):'')+'<button type="button" class="lnk" data-pf="">Show all launches</button></div></div>'}
  $('#rows').innerHTML=html;renderFilter()}
$('#rows').addEventListener('click',function(e){var f=e.target.closest('[data-pf]');if(f){setFilter(f.dataset.pf);return}var c=e.target.closest('[data-ics]');if(c){saveIcs(LAUNCHES[+c.dataset.ics]);return}var t=e.target.closest('[data-track]');if(t){S.cur=+t.dataset.track;S.simT=-10;refresh();showTab('sky');$('#top').scrollIntoView({behavior:reduce?'auto':'smooth'});return}var b=e.target.closest('.bell');if(b)toggleRem(b.dataset.id,b)});
var pendingRem=null;
// clicking a provider card (anywhere but its links) filters the manifest to that company
$('#providers').addEventListener('click',function(e){if(e.target.closest('a'))return;var c=e.target.closest('[data-pf]');if(!c)return;setFilter(c.dataset.pf);showTab('launches');$('#p-launches').scrollIntoView({behavior:reduce?'auto':'smooth'})});
function toggleRem(id,btn){if(!S.user){pendingRem=id;openLogin('signin','Sign in to save launch reminders.');return}var on=!S.rem[id];if(on)S.rem[id]=1;else delete S.rem[id];store.set('radar.rem',S.rem);var L=LAUNCHES.filter(function(l){return l.id===id})[0];
  if(btn){btn.setAttribute('aria-pressed',on);var sv=btn.querySelector('svg');sv.classList.remove('bell-ring');void sv.offsetWidth;sv.classList.add('bell-ring')}else renderRows();toast(on?'Reminder saved on this device for '+L.veh+' '+L.mis+'. Add it to your calendar for an alert.':'Reminder removed',on?4500:2600);updateRemind()}
// calendar file (.ics) with an alert 30 minutes before liftoff
function icsTxt(v){return String(v).replace(/[\\;,]/g,function(c){return '\\'+c}).replace(/\n/g,'\\n')}
function icsFor(L){var st=function(d){return d.toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'')},d=new Date(L.utc),W=watchOf(L),w=W?W.url:safeUrl(provOf(L).site,null)||'https://astroradar.io/';
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Astro Radar//EN','BEGIN:VEVENT','UID:'+icsTxt(L.id)+'@astroradar.io','DTSTAMP:'+st(new Date()),'DTSTART:'+st(d),'DTEND:'+st(new Date(d.getTime()+1800000)),'SUMMARY:'+icsTxt(L.veh+' launch · '+L.mis),'LOCATION:'+icsTxt(L.siteObj.full),'DESCRIPTION:'+icsTxt('Watch: '+w+'\nLaunch times often move. Check astroradar.io before you head out.'),'URL:'+w,'BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY','DESCRIPTION:'+icsTxt(L.veh+' launch in 30 minutes'),'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n')+'\r\n'}
function saveIcs(L){if(!L)return;var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([icsFor(L)],{type:'text/calendar'}));a.download=String(L.mis||'launch').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').toLowerCase()+'.ics';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000);toast('Calendar file saved. Open it to add the launch with an alert.',4000)}
function updateRemind(){var b=$('#heroRemind'),on=!!S.rem[L0().id];b.classList.toggle('on',on);b.classList.toggle('btn-solid',!on);b.querySelector('span').textContent=on?'Reminder set':'Set reminder'}
$('#heroCal').addEventListener('click',function(){saveIcs(L0())});
$('#heroRemind').addEventListener('click',function(){toggleRem(L0().id,null);var sv=$('#heroRemind svg');sv.classList.remove('bell-ring');void sv.offsetWidth;sv.classList.add('bell-ring')});

/* zip */
function setZip(z,announce){z=String(z).trim();var err=$('#zipErr'),inp=$('#zipInput');function bad(m){err.textContent=m;inp.setAttribute('aria-invalid','true')}if(!/^\d{5}$/.test(z)){bad('Enter a 5 digit US ZIP code.');return}var i=findZip(z);if(i<0){bad('We could not find ZIP '+z+'. Check the number or try a nearby ZIP.');return}err.textContent='';inp.removeAttribute('aria-invalid');S.obs=zipInfo(i);store.set('radar.zip',z);$('#zipInput').value=z;S.simT=-10;refresh();if(announce)toast('Checking the sky from '+S.obs.city)}
$('#zipForm').addEventListener('submit',function(e){e.preventDefault();setZip($('#zipInput').value,true)});
$('#zipInput').addEventListener('input',function(){this.value=this.value.replace(/\D/g,'').slice(0,5)});
function refresh(){loadWx(S.obs);renderHero();renderView();renderRows();renderAuth();renderWx();renderWatch();renderFeedHead();fx();drawWedge();if(skySeen)arcT0=performance.now()}

/* auth */
function initials(n){return n.split(/\s+/).filter(Boolean).map(function(w){return w[0]}).slice(0,2).join('').toUpperCase()||'?'}
function renderAuth(){var slot=$('#authSlot');
  if(S.user){slot.innerHTML='<div style="position:relative"><button type="button" id="avBtn" aria-haspopup="true" aria-expanded="false" style="min-height:44px;display:flex;align-items:center"><span class="avatar">'+esc(initials(S.user.name))+'</span></button></div>';
    $('#avBtn').addEventListener('click',function(e){e.stopPropagation();var ex=$('#userMenu');if(ex){ex.remove();this.setAttribute('aria-expanded','false');return}this.setAttribute('aria-expanded','true');var m=document.createElement('div');m.className='menu';m.id='userMenu';m.innerHTML='<div class="menu-h"><b>'+esc(S.user.name)+'</b><span>'+esc(S.user.email)+'</span></div><button type="button" data-a="rem">Reminders<span>'+Object.keys(S.rem).length+'</span></button><button type="button" data-a="home">Home ZIP<span>'+esc(S.user.zip||'—')+'</span></button><button type="button" data-a="out">Sign out</button>';this.parentNode.appendChild(m);
      m.addEventListener('click',function(ev){var b=ev.target.closest('button');if(!b)return;m.remove();if(b.dataset.a==='out')signOut();if(b.dataset.a==='rem'){showTab('launches');$('.tabsec').scrollIntoView({behavior:reduce?'auto':'smooth'})}if(b.dataset.a==='home'&&S.user.zip)setZip(S.user.zip,true)})});
    $('#joinCta').innerHTML='<span class="status s-go">Signed in as '+esc(S.user.name)+'</span><button class="btn btn-sm" type="button" id="joinOut">Sign out</button>';$('#compAv').textContent=initials(S.user.name)}
  else{slot.innerHTML='<button class="btn btn-sm" type="button" data-login="signin">Sign in</button>';$('#joinCta').innerHTML='<button class="btn btn-sm btn-solid" type="button" data-login="google">Continue with Google</button><button class="btn btn-sm" type="button" data-login="astro">Continue with Astro</button>';$('#compAv').textContent='?'}}
document.addEventListener('click',function(e){var b=e.target.closest('[data-login]');if(b){var m=b.dataset.login;if(m==='google'||m==='astro'){openLogin('signin');setTimeout(function(){var sb=$('[data-sso="'+m+'"]');if(sb)sb.click()},300)}else openLogin(m)}if(e.target.closest('#joinOut'))signOut();if(!e.target.closest('#userMenu')&&!e.target.closest('#avBtn')){var um=$('#userMenu');if(um){um.remove();var ab=$('#avBtn');if(ab)ab.setAttribute('aria-expanded','false')}}});
function signOut(){S.user=null;store.del('radar.user');renderAuth();renderPosts();toast('Signed out')}
var lastFocus=null;
function openLogin(mode,reason){lastFocus=document.activeElement;$('#modalRoot').innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlgT"><div class="modal-bg" data-close="1"></div><div class="dialog"><button class="dlg-x" type="button" data-close="1" aria-label="Close"><svg class="ico" width="22" height="22" aria-hidden="true"><use href="#i-close"/></svg></button><div id="dlgBody"></div></div></div>';$$('body > *').forEach(function(e){if(e.id!=='modalRoot'&&e.id!=='toast')e.inert=true});renderLoginBody(mode,reason);document.addEventListener('keydown',escClose)}
function escClose(e){if(e.key==='Escape')closeLogin()}
function closeLogin(){$('#modalRoot').innerHTML='';$$('body > *').forEach(function(e){e.inert=false});document.removeEventListener('keydown',escClose);if(lastFocus&&lastFocus.focus)lastFocus.focus()}
$('#modalRoot').addEventListener('click',function(e){if(e.target.closest('[data-close]'))closeLogin()});
function renderLoginBody(mode,reason){var create=mode==='create',b=$('#dlgBody');
  b.innerHTML='<h2 id="dlgT">'+(create?'Join Radar':'Sign in')+'</h2><p>'+(reason?esc(reason):create?'One account for Radar and Astro.':'Sync reminders and your home ZIP.')+'</p><div class="dtabs" role="tablist"><button class="dtab" role="tab" type="button" aria-selected="'+!create+'" data-m="signin">Sign in</button><button class="dtab" role="tab" type="button" aria-selected="'+create+'" data-m="create">Create account</button></div>'+
  '<form id="authForm" novalidate>'+(create?'<div class="field"><label class="label" for="fName">Name</label><input id="fName" autocomplete="name"></div>':'')+'<div class="field"><label class="label" for="fEmail">Email</label><input id="fEmail" type="email" autocomplete="email" aria-describedby="eEmail"><span class="ferr" id="eEmail"></span></div><div class="field"><label class="label" for="fPass">Password</label><input id="fPass" type="password" aria-describedby="ePass" autocomplete="'+(create?'new-password':'current-password')+'"><span class="ferr" id="ePass"></span></div>'+(create?'<div class="field"><label class="label" for="fZip">Home ZIP</label><input id="fZip" inputmode="numeric" maxlength="5" value="'+esc(S.obs.zip)+'"></div>':'')+'<button class="btn btn-solid dlg-submit" type="submit" id="authSubmit">'+(create?'Create account':'Sign in')+'</button></form>'+
  '<div class="or">OR</div><div class="sso"><button class="btn" type="button" data-sso="google">Google</button><button class="btn" type="button" data-sso="astro">Astro</button></div><p class="dlg-note">Demo sign in. Nothing you type leaves this page.</p>';
  $$('.dtab',b).forEach(function(t){t.addEventListener('click',function(){renderLoginBody(t.dataset.m,reason)})});setTimeout(function(){var f=$(create?'#fName':'#fEmail');if(f)f.focus()},60);
  $('#authForm').addEventListener('submit',function(e){e.preventDefault();var em=$('#fEmail').value.trim(),pw=$('#fPass').value,ok=true;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){$('#eEmail').textContent='Enter an email like name@example.com.';$('#fEmail').setAttribute('aria-invalid','true');ok=false}else{$('#eEmail').textContent='';$('#fEmail').removeAttribute('aria-invalid')}if(pw.length<8){$('#ePass').textContent='Use at least 8 characters.';$('#fPass').setAttribute('aria-invalid','true');ok=false}else{$('#ePass').textContent='';$('#fPass').removeAttribute('aria-invalid')}if(!ok)return;
    var nm=create&&$('#fName').value.trim()?$('#fName').value.trim():em.split('@')[0].replace(/[._]/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()}),zp=create?$('#fZip').value.trim():S.obs.zip;busy($('#authSubmit'),function(){finishLogin({name:nm,email:em,zip:findZip(zp)>=0?zp:S.obs.zip})})});
  $$('[data-sso]',b).forEach(function(s){s.addEventListener('click',function(){var m=s.dataset.sso;busy(s,function(){finishLogin({name:m==='google'?'Google member':'Astro member',email:'signed in with '+(m==='google'?'Google':'Astro'),zip:S.obs.zip})})})})}
function busy(btn,cb){btn.disabled=true;btn.style.width=btn.offsetWidth+'px';btn.innerHTML='<span class="spinner" aria-hidden="true"></span><span class="sr">Signing in</span>';setTimeout(cb,reduce?100:900)}
function finishLogin(u){S.user=u;store.set('radar.user',u);$('#dlgBody').innerHTML='<div class="success"><svg width="64" height="64" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="none" stroke="rgba(95,227,161,.35)" stroke-width="2"/><path d="M22 37 l10 10 l19 -22" fill="none" stroke="#5FE3A1" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg><h2 id="dlgT" style="margin-top:14px">Signed in</h2><p>Welcome, '+esc(u.name.split(' ')[0])+'.</p></div>';renderAuth();renderPosts();setTimeout(function(){closeLogin();if(pendingRem){var id=pendingRem;pendingRem=null;toggleRem(id,null)}},reduce?300:1300)}


/* ===== tabs ===== */
var TABS=['sky','launches','watch','astro'];
function moveInk(){var t=$('.ptab[aria-selected="true"]'),ink=$('#ptabInk');if(!t)return;ink.style.transform='translateX('+t.offsetLeft+'px) scaleX('+t.offsetWidth+')'}
function showTab(id,push){if(TABS.indexOf(id)<0)id='sky';$$('.ptab').forEach(function(b){var on=b.dataset.tab===id;b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1});TABS.forEach(function(k){var p=$('#p-'+k);p.hidden=k!==id;if(k===id){p.style.animation='none';void p.offsetWidth;p.style.animation=''}});moveInk();curTab=id;navState(true);
  if(id==='sky')setTimeout(sizeSky,30);if(id==='watch')setTimeout(drawFeature,30);if(id==='astro')setTimeout(drawPostArt,30);try{history.replaceState(null,'','#'+id)}catch(e){}}
$$('.ptab').forEach(function(b){b.addEventListener('click',function(){showTab(b.dataset.tab)});b.addEventListener('keydown',function(e){var i=TABS.indexOf(b.dataset.tab);if(e.key==='ArrowRight'||e.key==='ArrowLeft'){var n=TABS[(i+(e.key==='ArrowRight'?1:3))%4];showTab(n);$('#t-'+n).focus();e.preventDefault()}})});
$$('a[data-tab]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();showTab(a.dataset.tab);$('.tabsec').scrollIntoView({behavior:reduce?'auto':'smooth'})})});
window.addEventListener('resize',moveInk);

/* ===== weather (sample, deterministic per ZIP and launch) ===== */
var ST_TZ={WA:'PT',OR:'PT',CA:'PT',NV:'PT',ID:'MT',MT:'MT',WY:'MT',UT:'MT',CO:'MT',NM:'MT',AZ:'AZ',ND:'CT',SD:'CT',NE:'CT',KS:'CT',OK:'CT',TX:'CT',MN:'CT',IA:'CT',MO:'CT',AR:'CT',LA:'CT',WI:'CT',IL:'CT',MS:'CT',AL:'CT',TN:'CT'},TZN={ET:'America/New_York',CT:'America/Chicago',MT:'America/Denver',AZ:'America/Phoenix',PT:'America/Los_Angeles'};
function tzFor(st){return TZN[ST_TZ[st]||'ET']}
function hstr(str){var h=2166136261;for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0)%2147483646+1}
function rng(seed){var s=seed;return function(){s=(s*16807)%2147483647;return (s-1)/2147483646}}
function wxSample(L,o){var r=rng(hstr(L.id+o.zip)),v=vis(L,o);var clouds=Math.round(Math.pow(r(),1.4)*88);var cond=clouds<15?'Clear':clouds<35?'Mostly clear':clouds<60?'Partly cloudy':clouds<80?'Mostly cloudy':'Overcast';
  var temp=Math.round(88-(o.lat-25)*1.7+(v.sunObs>0?4:-6)+(r()-.5)*8);var dirs=['N','NE','E','SE','S','SW','W','NW'];var wind=dirs[(r()*8)|0]+' '+Math.round(3+r()*14)+' mph';return {clouds:clouds,cond:cond,temp:temp,wind:wind}}
var NWS={};
function isoDur(x){var m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(x||'');return m?((+m[1]||0)*86400+(+m[2]||0)*3600+(+m[3]||0)*60)*1000:3600000}
function nwsSeries(o){return ((o&&o.values)||[]).map(function(v){var p=String(v.validTime).split('/'),s=Date.parse(p[0]);return {s:s,e:s+isoDur(p[1]),v:v.value}})}
function nwsPick(arr,t){for(var i=0;i<arr.length;i++)if(t>=arr[i].s&&t<arr[i].e)return arr[i].v;return null}
function loadWx(o){if(NWS[o.zip]||!window.fetch||!/^https?:$/.test(location.protocol))return;var rec=NWS[o.zip]={ok:false},ac=window.AbortController?new AbortController():null,opt=ac?{signal:ac.signal}:{};setTimeout(function(){if(ac)ac.abort()},12000);
  function done(){if(S.obs&&S.obs.zip===o.zip)renderWx()}
  fetch('https://api.weather.gov/points/'+o.lat.toFixed(4)+','+o.lon.toFixed(4),opt).then(function(r){if(!r.ok)throw r.status===404?'nocover':'nws';return r.json()}).then(function(j){return fetch(j.properties.forecastGridData,opt)}).then(function(r){if(!r.ok)throw 'nws';return r.json()}).then(function(j){var p=j.properties;rec.sky=nwsSeries(p.skyCover);rec.temp=nwsSeries(p.temperature);rec.wspd=nwsSeries(p.windSpeed);rec.wdir=nwsSeries(p.windDirection);rec.ok=rec.sky.length>0;if(!rec.ok)rec.err='nws';done()}).catch(function(e){rec.ok=false;rec.err=navigator.onLine===false?'offline':typeof e==='string'?e:'nws';done()})}
function wxTagText(w,o){var r=NWS[o.zip];if(w.live)return 'NWS forecast';if(w.beyond)return 'Sample · beyond NWS range';if(navigator.onLine===false||(r&&r.err==='offline'))return 'Offline · sample forecast';if(r&&r.err==='nocover')return 'No NWS forecast here · sample';if(r&&r.err)return 'NWS unavailable · sample forecast';if(r&&!r.ok)return 'Loading NWS forecast';return 'Sample forecast'}
function wxLive(L,o){var d=NWS[o.zip];if(!d||!d.ok)return null;var t=Date.parse(L.utc),sky=nwsPick(d.sky,t);if(sky==null)return null;var tc=nwsPick(d.temp,t),ws=nwsPick(d.wspd,t),wd=nwsPick(d.wdir,t),clouds=Math.round(sky),cond=clouds<15?'Clear':clouds<35?'Mostly clear':clouds<60?'Partly cloudy':clouds<80?'Mostly cloudy':'Overcast';
  return {clouds:clouds,cond:cond,temp:tc==null?null:Math.round(tc*9/5+32),wind:(wd==null?'':ORB.dir16(wd)+' ')+(ws==null?'n/a':Math.round(ws*.621371)+' mph'),live:true}}
function wxFor(L,o){var w=wxLive(L,o);if(w)return w;w=wxSample(L,o);w.live=false;w.beyond=!!(NWS[o.zip]&&NWS[o.zip].ok);return w}
function wxIcon(cond,dark){
  var sun=dark?'<g><circle cx="24" cy="22" r="16" fill="url(#isunglow)" opacity=".35"/><path d="M27 8a13 13 0 1 0 11.5 19.2A10.5 10.5 0 0 1 27 8z" fill="url(#imoon)"/><circle cx="21" cy="19" r="1.8" fill="#9AA4B2" opacity=".5"/><circle cx="25.5" cy="26" r="1.2" fill="#9AA4B2" opacity=".5"/><circle cx="18" cy="26.5" r=".9" fill="#9AA4B2" opacity=".5"/><circle cx="44" cy="10" r="1" fill="#fff"/><circle cx="48" cy="20" r=".7" fill="#fff"/></g>'
    :'<g><circle cx="24" cy="22" r="19" fill="url(#isunglow)"/>'+[0,30,60,90,120,150,180,210,240,270,300,330].map(function(a){var c=Math.cos(a*Math.PI/180),s2=Math.sin(a*Math.PI/180),L=a%60===0?7:4.5;return '<line x1="'+(24+c*13).toFixed(1)+'" y1="'+(22+s2*13).toFixed(1)+'" x2="'+(24+c*(13+L)).toFixed(1)+'" y2="'+(22+s2*(13+L)).toFixed(1)+'" stroke="#FFD27A" stroke-width="'+(a%60===0?2:1.4)+'" stroke-linecap="round"/>'}).join('')+'<circle cx="24" cy="22" r="10" fill="url(#isun)"/><path d="M18.5 18a7 7 0 0 1 5-3.6" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.4" stroke-linecap="round"/></g>';
  var heavy=cond==='Overcast'||cond==='Mostly cloudy';
  var cl=function(x,y,s,g){return '<g transform="translate('+x+' '+y+') scale('+s+')"><path d="M6 30h30a8 8 0 0 0 1-15.9A12 12 0 0 0 14.2 11 9 9 0 0 0 6 30z" fill="url(#'+g+')"/><path d="M14.5 13.2a10 10 0 0 1 9-4" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.3" stroke-linecap="round"/></g>'};
  if(cond==='Clear')return sun;
  if(cond==='Mostly clear')return sun+cl(20,22,.75,'icloud');
  if(cond==='Partly cloudy')return sun+cl(10,16,1,'icloud');
  return cl(16,6,.8,'icloud2')+cl(4,16,1,heavy?'icloud':'icloud');
}
function renderWx(){var L=L0(),o=S.obs,v=vis(L),w=wxFor(L,o),tz=tzFor(o.st),d=new Date(L.utc),dark=v.sunObs<-4;
  $('#wxIcon').setAttribute('viewBox','0 0 56 56');$('#wxIcon').innerHTML=wxIcon(w.cond,dark);$('#wxCond').textContent=w.cond;$('#wxPlace').textContent=o.city+' · '+d.toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit',timeZone:tz,timeZoneName:'short'});
  $('#wxTemp').textContent=w.temp==null?'n/a':w.temp+'°';$('#wxTag').textContent=wxTagText(w,o);$('#wxCloud').textContent=w.clouds+'%';$('#wxWind').textContent=w.wind;$('#wxSky').textContent=v.sunObs>0?'Daylight':v.sunObs>-12?'Twilight':'Dark';
  var am=parseInt(d.toLocaleString('en-US',{hour:'numeric',hour12:false,timeZone:tz}),10)<12,cr=ORB.sunCross(o.lat,o.lon,d,-.833,am?1:-1);$('#wxSunK').textContent=am?'Sunrise':'Sunset';$('#wxSun').textContent=cr?new Date(cr).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:tz}):'n/a';
  var pathPts=[0,4,6,8,10][v.score];if(v.best&&v.day)pathPts=Math.max(2,pathPts-3);var score=v.best?Math.round(pathPts*(1-w.clouds/100*.8)*(.6+.4*(L.go==null?.8:L.go/100))):0;
  var t1,t2;if(!v.best){t1='Not visible from here';t2='The rocket never clears your horizon. Watch the live stream instead.'}else if(score>=8){t1='Clear view likely';t2='It climbs '+Math.round(v.best.el)+'° above your horizon and clouds should stay out of the way.'}else if(score>=5){t1='Good chance';t2='Look '+DIRW[ORB.dir16(v.best.az)]+'. Some clouds, so find a spot with an open horizon.'}else if(score>=3){t1='Partly blocked';t2='Clouds or a low angle may hide part of the climb. Worth a look if you are up.'}else{t1='Unlikely';t2='Clouds and a low angle make it hard to spot. The live stream is your best bet.'}
  $('#olT').textContent=t1;$('#olS').textContent=t2;$('#olScore').textContent=score+' / 10';$('#olBar').style.transform='scaleX('+(score/10)+')';$('#olPath').textContent=v.best?(v.day?'Daytime':v.rating):'Below horizon';$('#olCloud').textContent=w.clouds<25?'Low':w.clouds<60?'Some':'Heavy';$('#olSite').textContent=goTxt(L);fx()}

/* ===== art: procedural launch photos (no external images) ===== */
function drawShot(cv,seed,opt){var r=cv.getBoundingClientRect();if(!r.width)return;var d=Math.min(2,window.devicePixelRatio||1),W=r.width,H=r.height;cv.width=Math.round(W*d);cv.height=Math.round(H*d);var g=cv.getContext('2d');g.setTransform(d,0,0,d,0,0);var R=rng(seed);opt=opt||{};
  var tw=opt.twilight!=null?opt.twilight:R()>.5,sky=g.createLinearGradient(0,0,0,H);if(tw){sky.addColorStop(0,'#050915');sky.addColorStop(.55,'#1A2B52');sky.addColorStop(.85,'#B4705E');sky.addColorStop(1,'#2A1820')}else{sky.addColorStop(0,'#010205');sky.addColorStop(1,'#0B1630')}g.fillStyle=sky;g.fillRect(0,0,W,H);
  g.fillStyle='#fff';for(var i=0;i<W*H/900;i++){g.globalAlpha=R()*.7*(tw?.5:1);g.fillRect(R()*W,R()*H*.7,R()<.9?.8:1.4,R()<.9?.8:1.4)}g.globalAlpha=1;
  var bx=W*(.3+R()*.4),by=H*.86,ex=bx+W*(R()-.3)*.5,ey=H*(.08+R()*.2),cx2=bx+(ex-bx)*.1,cy2=H*.35;
  g.lineCap='round';for(var k=0;k<3;k++){g.strokeStyle=k===0?'rgba(255,170,90,.18)':k===1?'rgba(255,210,150,.5)':'rgba(255,250,235,.95)';g.lineWidth=[10,4,1.6][k];g.beginPath();g.moveTo(bx,by);g.quadraticCurveTo(cx2,cy2,ex,ey);g.stroke()}
  if(tw&&opt.plume!==false){var px=bx+(ex-bx)*.7,py=ey+(cy2-ey)*.3;var pg=g.createRadialGradient(px,py,0,px,py,W*.16);pg.addColorStop(0,'rgba(235,225,255,.4)');pg.addColorStop(1,'rgba(150,190,255,0)');g.fillStyle=pg;g.beginPath();g.ellipse(px,py,W*.2,W*.12,-.4,0,6.283);g.fill()}
  var hg=g.createRadialGradient(ex,ey,0,ex,ey,22);hg.addColorStop(0,'rgba(255,250,240,1)');hg.addColorStop(1,'rgba(255,170,80,0)');g.fillStyle=hg;g.beginPath();g.arc(ex,ey,22,0,6.283);g.fill();
  g.fillStyle='#000';g.beginPath();g.moveTo(0,H);var x=0;while(x<=W){g.lineTo(x,by-R()*H*.06);x+=6+R()*30}g.lineTo(W,H);g.closePath();g.fill();
  if(opt.palms){for(var p=0;p<4;p++){var tx=R()*W,th=H*(.12+R()*.1);g.strokeStyle='#000';g.lineWidth=3;g.beginPath();g.moveTo(tx,H);g.quadraticCurveTo(tx+6,H-th*.6,tx+3,H-th);g.stroke();g.lineWidth=2;for(var f=0;f<6;f++){var a=-Math.PI/2+(f-2.5)*.55;g.beginPath();g.moveTo(tx+3,H-th);g.quadraticCurveTo(tx+3+Math.cos(a)*12,H-th+Math.sin(a)*8,tx+3+Math.cos(a)*20,H-th+Math.sin(a)*10+10);g.stroke()}}}}
function drawFeature(){var c=$('#featArt');if(c)drawShot(c,hstr(L0().id),{twilight:true,palms:true,plume:false})}
function drawPostArt(){$$('.pmedia canvas').forEach(function(c){drawShot(c,+c.dataset.seed,{twilight:c.dataset.tw==='1',palms:c.dataset.p==='1'})})}

/* ===== watch ===== */
function renderWatch(){var L=L0(),W0=watchOf(L),fw=$('#featWatch');if(W0)fw.href=W0.url;else fw.removeAttribute('href');$('#featT').textContent=L.veh+' · '+L.mis;$('#featS').textContent=fmtDay(L)+' · '+fmtTime(L)+' · '+(W0?(W0.own?'official webcast on ':'live page: ')+W0.src:'no official stream listed yet');$('#featPlay').lastChild.textContent=W0?'Watch on '+W0.src:'No stream yet';
  var cnt={};LAUNCHES.forEach(function(x){cnt[x.prov]=(cnt[x.prov]||0)+1});
  var ext=function(u,t){u=safeUrl(u,null);return u?'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+t+'<svg class="ico" width="16" height="16" aria-hidden="true"><use href="#i-ext"/></svg></a>':''};
  $('#providers').innerHTML=PROVS.map(function(p){var c=cnt[p.key]||0;return '<div class="prov" data-pf="'+esc(p.key)+'"><button type="button" class="prov-h" data-pf="'+esc(p.key)+'" aria-label="Show '+esc(p.n)+' launches"><b>'+esc(p.n)+'</b><span class="prov-n">'+(c?c+' launch'+(c>1?'es':'')+' in 30 days':'None in 30 days')+'</span></button><p>'+esc(p.d)+'</p><div class="prov-l">'+ext(p.site,'Website')+ext(p.live,'Watch live'+(p.liveSrc?' · '+esc(p.liveSrc):''))+ext(p.social,'Social')+'</div></div>'}).join('');
  if(!$('#p-watch').hidden)drawFeature()}

/* ===== astro feed ===== */
var GR=['#FFB020','#5FE3A1','#B9A8FF','#FFD69A','#FF6B8B','#B58CFF'];
var POSTS=[
  {n:'Space Coast Chaser',h:'@capechaser',g:0,t:'Clear skies over Jetty Park and the range is green. If the window holds this one will be gorgeous. <span class="ht">#Starlink</span>',m:[11,1,1],min:'2m',l:1860},
  {n:'Miami Night Sky',h:'@miamistargazer',g:2,t:'Radar has it clearing the horizon north northeast from Miami about 80 seconds after liftoff. Tripod is set on the Rickenbacker.',min:'6m',l:402},
  {n:'Orbit Notes',h:'@orbitnotes',g:1,t:'Launches 20 to 60 minutes from sunrise or sunset are the ones to set alarms for. The plume catches sunlight while you are still in the dark.',min:'14m',l:5210},
  {n:'Carolina Launch Watch',h:'@carolinalaunch',g:3,t:'Raleigh crew: Cape launches heading northeast rise into view over the southern sky about two and a half minutes in.',m:[27,0,0],min:'31m',l:688},
  {n:'Jax Rocket Club',h:'@jaxrockets',g:4,t:'Last launch from Jacksonville Beach. Phone shot, no edits.',m:[5,1,1],min:'1h',l:9877}
];
POSTS.forEach(function(p,i){p.id='s'+i});POSTS=(store.get('radar.posts')||[]).concat(POSTS);
var liked=store.get('radar.likes')||{};
function saveMine(){store.set('radar.posts',POSTS.filter(function(p){return p.own}).slice(0,50))}
function ago(ts){var m=Math.round((Date.now()-ts)/60000);return m<1?'now':m<60?m+'m':m<1440?Math.round(m/60)+'h':Math.round(m/1440)+'d'}
function fmtN(n){return n>=1000?(n/1000).toFixed(1).replace('.0','')+'K':String(n)}
var heart='<svg class="ico" width="19" height="19" aria-hidden="true"><use href="#i-heart"/></svg>';
var reply='<svg class="ico" width="19" height="19" aria-hidden="true"><use href="#i-reply"/></svg>';
function renderPosts(enter){$('#posts').innerHTML=POSTS.map(function(p,i){var on=!!liked[p.id];return '<article class="post'+(enter&&i<enter?' enter':'')+'"><span class="pav" style="background:'+GR[p.g]+'" aria-hidden="true">'+esc(initials(p.n))+'</span><div class="pbody"><div class="phead"><b>'+esc(p.n)+'</b><span>'+esc(p.h)+' · '+(p.ts?ago(p.ts):p.min)+'</span></div><div class="ptext">'+p.t+'</div>'+(p.m?'<div class="pmedia"><canvas data-seed="'+p.m[0]+'" data-tw="'+p.m[1]+'" data-p="'+p.m[2]+'"></canvas><span>Sample photo</span></div>':'')+'<div class="pact"><button class="act" type="button" data-reply="'+esc(p.h)+'" aria-label="Reply to '+esc(p.n)+'">'+reply+'Reply</button><button class="act'+(on?' on':'')+'" type="button" data-like="'+p.id+'" aria-pressed="'+on+'" aria-label="Like">'+heart+'<span>'+fmtN(p.l+(on?1:0))+'</span></button>'+(p.own&&S.user?'<button class="act" type="button" data-del="'+p.id+'">Delete</button>':'')+'</div></div></article>'}).join('');if(!$('#p-astro').hidden)drawPostArt()}
$('#posts').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;if(!S.user){openLogin('signin','Sign in to join the launch thread.');return}
  if(b.dataset.reply){ta.value=(b.dataset.reply+' '+ta.value.replace(/^@\w+\s*/,'')).replace(/\s+$/,'')+' ';ta.dispatchEvent(new Event('input'));ta.focus();return}
  if(b.dataset.del){POSTS=POSTS.filter(function(p){return p.id!==b.dataset.del});saveMine();renderPosts();toast('Post deleted');return}
  var id=b.dataset.like,P=POSTS.filter(function(p){return p.id===id})[0];if(!P)return;var on=!liked[id];if(on)liked[id]=1;else delete liked[id];store.set('radar.likes',liked);b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);b.lastChild.textContent=fmtN(P.l+(on?1:0));if(on){b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop')}});
var ta=$('#compose'),send=$('#send');
ta.addEventListener('focus',function(){if(!S.user){ta.blur();openLogin('signin','Sign in to post to the launch thread.')}});
ta.addEventListener('input',function(){$('#cc').textContent=280-ta.value.length;send.disabled=!ta.value.trim()});
$('#tagLoc').addEventListener('click',function(){if(!S.user){openLogin('signin','Sign in to post to the launch thread.');return}ta.value=(ta.value+' Watching from '+S.obs.city+'.').replace(/\s+/g,' ').trim();ta.dispatchEvent(new Event('input'))});
send.addEventListener('click',function(){var txt=esc(ta.value.trim()).replace(/#(\w+)/g,'<span class="ht">#$1</span>');if(!txt)return;POSTS.unshift({id:'u'+Date.now(),own:1,ts:Date.now(),n:S.user.name,h:'@'+(S.user.name.toLowerCase().replace(/[^a-z0-9]/g,'')||'member'),g:2,t:txt,l:0});saveMine();ta.value='';send.disabled=true;$('#cc').textContent='280';renderPosts(1);toast('Posted to the live thread on Astro')});
function renderFeedHead(){var L=L0();$('#lbT').textContent='Launch thread · '+L.veh+' · '+L.mis;$('#lbS').textContent=L.siteObj.full}
var vc=2418;setInterval(function(){vc+=Math.floor(Math.random()*17)-5;$('#viewers').textContent='Sample · '+vc.toLocaleString()+' watching'},2200);

/* loop */
// the hero and the Your sky view draw only while they are on screen and the tab is visible (the loop stops otherwise and starts again
// when one comes back); phones and low power devices draw 30 frames a second
var last=0,RUN=false,heroOn=true,skyOn=false,FMIN=LOWP||innerWidth<700?1000/30-4:0;
function wantRun(){return !document.hidden&&(heroOn||skyOn||JOBS.length>0)}
// (the very first frame is left to the browser, so the page's text paints before any hero work)
var FR0=true;function loop(now){if(!wantRun()){RUN=false;last=0;return}requestAnimationFrame(loop);if(FR0){FR0=false;return}if(last&&now-last<FMIN)return;var dt=last?Math.min(.1,(now-last)/1000):.016;last=now;runJobs(LOWP?5:8);
  if(skyOn){if(S.playing){S.simT+=dt*20;if(S.simT>L0().end+8)S.simT=-10}drawSky()}if(heroOn)drawHero(dt)}
function kick(){if(!RUN&&wantRun()){RUN=true;last=0;requestAnimationFrame(loop)}}
document.addEventListener('visibilitychange',kick);

/* compass ticks */
(function(){var g=$('#cpTicks'),h='';for(var a=0;a<360;a+=5){var big=a%30===0,r1=big?92:96,r2=108,q=(a-90)*Math.PI/180;h+='<line x1="'+(120+r1*Math.cos(q)).toFixed(2)+'" y1="'+(120+r1*Math.sin(q)).toFixed(2)+'" x2="'+(120+r2*Math.cos(q)).toFixed(2)+'" y2="'+(120+r2*Math.sin(q)).toFixed(2)+'" stroke="'+(a===0?'#B9A8FF':big?'rgba(255,255,255,.8)':'rgba(255,255,255,.28)')+'" stroke-width="'+(big?1.6:1)+'"/>';if(big){var lab=a===0?'N':a===90?'E':a===180?'S':a===270?'W':String(a);h+='<text x="'+(120+80*Math.cos(q)).toFixed(2)+'" y="'+(120+80*Math.sin(q)+3.5).toFixed(2)+'" text-anchor="middle" font-family="Barlow, sans-serif" font-weight="600" font-size="'+(/[NESW]/.test(lab)?11:8.5)+'" fill="'+(a===0?'#B9A8FF':/[NESW]/.test(lab)?'#fff':'rgba(255,255,255,.5)')+'">'+lab+'</text>'}}g.innerHTML=h})();
/* page motion: the header, scroll reveals, and the Your sky card coming alive the first time it shows */
var curTab='sky',skySeen=false,arcT0=0,navEl=$('.nav'),navInk=$('#navInk'),navKey='',navQ=0;
// header: clear over the hero, frosted glass once the page scrolls; the underline slides to the section in view
function navState(force){if(!navEl)return;var g=(window.pageYOffset||0)>10,ts=$('.tabsec'),on=ts.getBoundingClientRect().top<window.innerHeight*.55,a=on?$('.nav-links a[data-tab="'+curTab+'"]'):null,k=g+'|'+(a?curTab:'')+'|'+(a?a.offsetLeft+','+a.offsetWidth:'');if(k===navKey&&!force)return;navKey=k;
  navEl.classList.toggle('glass',g);$$('.nav-links a').forEach(function(l){if(l===a)l.setAttribute('aria-current','true');else l.removeAttribute('aria-current')});
  if(a)navInk.style.transform='translateX('+a.offsetLeft+'px) scaleX('+a.offsetWidth+')';navInk.style.opacity=a?1:0}
function aimNeedle(az){S.naz=az;if(skySeen||reduce)$('#needle').style.transform='rotate('+az+'deg)'}
function drawWedge(){if(reduce||!skySeen)return;var w=$('#vcWedge');w.classList.remove('wdraw');void w.getBoundingClientRect();w.classList.add('wdraw')}
// first view of the card: the needle swings round into place, the visibility arc draws in, the numbers count up, the path draws itself
function skyIn(){if(skySeen)return;skySeen=true;$('.view').classList.remove('pre');var n=$('#needle');
  if(!reduce&&S.naz!=null){n.style.transition='none';n.style.transform='rotate('+(S.naz-150)+'deg)';void n.getBoundingClientRect();n.style.transition=''}aimNeedle(S.naz);
  ['#olScore','#wxTemp','#wxCloud','#vcPeak','#vcDist'].forEach(function(s){var e=$(s);if(e)e._n=0});fx();drawWedge();arcT0=performance.now();
  var b=$('#olBar'),w=b.style.transform;if(!reduce){b.style.transition='none';b.style.transform='scaleX(0)';void b.offsetWidth;b.style.transition='';b.style.transform=w}}
// blocks fade and rise in the first time they come into view, children staggered, then the classes come off so hovers stay instant
function initMotion(){navState(true);addEventListener('scroll',function(){if(!navQ){navQ=1;requestAnimationFrame(function(){navQ=0;navState()})}},{passive:true});addEventListener('resize',function(){navState(true)});
  if(reduce||!('IntersectionObserver' in window)){skyIn();return}
  var io=new IntersectionObserver(function(es){es.forEach(function(en){if(!en.isIntersecting)return;var t=en.target;io.unobserve(t);if(t._in)t._in();else t.classList.add('in');setTimeout(function(){t.classList.remove('rv','rvs','in')},1600)})},{threshold:.12,rootMargin:'0px 0px -6% 0px'});
  $$('.panel .sec-head,.wxrow,#providers,.astro,.foot-top,.foot-bot').forEach(function(el){el.classList.add('rvs');Array.prototype.forEach.call(el.children,function(c,i){c.style.setProperty('--i',i)});io.observe(el)});
  $$('.feature').forEach(function(el){el.classList.add('rv');io.observe(el)});
  var v=$('.view');v.classList.add('rv','pre');v._in=function(){v.classList.add('in');skyIn()};io.observe(v);
  var r=$('#rows');r.classList.add('pre');r._in=function(){r.classList.remove('pre');r.classList.add('anim');setTimeout(function(){r.classList.remove('anim')},2600)};io.observe(r)}
// which parts are on screen: the hero and Your sky canvases draw only then, and CSS animations pause in blocks that are off screen
function watchVisible(){if(!('IntersectionObserver' in window)){skyOn=true;kick();return}var hero=$('.hero');
  var io=new IntersectionObserver(function(es){es.forEach(function(e){var on=e.isIntersecting;if(e.target===hero)heroOn=on;else if(e.target===sc){skyOn=on;if(on)sizeSky()}e.target.classList.toggle('io-off',!on)});kick()},{rootMargin:'80px 0px'});
  [hero,sc].concat($$('.view,.panel .sec-head,#rows,.feed-live,.feature,.site-foot')).forEach(function(el){io.observe(el)})}
/* boot */
var z0=(S.user&&S.user.zip)||store.get('radar.zip')||'33130';if(findZip(z0)<0)z0='33130';S.obs=zipInfo(findZip(z0));$('#zipInput').value=z0;
renderPosts(0);var h0=(location.hash||'').slice(1);showTab(TABS.indexOf(h0)>=0?h0:'sky');setPlaying(!reduce);if(reduce)S.simT=Math.round(L0().end*.45);sizeHero();refresh();setDataNote();loadLive();setInterval(setDataNote,60000);tick();kick();initMotion();watchVisible();
window.addEventListener('online',function(){if(!LIVE.on){LIVE.err=null;loadLive()}var r=NWS[S.obs.zip];if(r&&!r.ok){delete NWS[S.obs.zip];loadWx(S.obs)}setDataNote();renderWx()});
window.addEventListener('offline',function(){setDataNote();renderWx()});
window.addEventListener('resize',function(){clearTimeout(window._rz);window._rz=setTimeout(function(){sizeHero();sizeSky();drawFeature();drawPostArt()},120)});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){sizeSky();moveInk()});
if(S.user)setTimeout(function(){toast('Welcome back, '+S.user.name.split(' ')[0])},800);

})();
