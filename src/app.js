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
function toast(m){var t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(function(){t.classList.remove('show')},2600)}
function fmtT(t){var a=Math.abs(Math.round(t));return (t<0?'T−':'T+')+pad2(Math.floor(a/60))+':'+pad2(a%60)}
function fmtTs(t){var a=Math.round(t);return Math.floor(a/60)+':'+pad2(a%60)}

/* data */
var Z=JSON.parse($('#zipdata').textContent),NZ=Z.a.length;
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
var PROV={spacex:{n:'SpaceX',yt:'https://www.youtube.com/@SpaceX/streams',site:'https://www.spacex.com/launches/',d:'Falcon 9, Falcon Heavy and Starship. Every launch streams live with onboard views and booster landings.'},
  blue:{n:'Blue Origin',yt:'https://www.youtube.com/@blueorigin/streams',site:'https://www.blueorigin.com/',d:'New Glenn from Cape Canaveral and New Shepard from West Texas.'},
  ula:{n:'ULA',yt:'https://www.youtube.com/@ulalaunch/streams',site:'https://www.ulalaunch.com/missions',d:'Vulcan and Atlas V for national security, NASA and commercial missions.'},
  rocketlab:{n:'Rocket Lab',yt:'https://www.youtube.com/results?search_query=Rocket+Lab+launch+live',site:'https://www.rocketlabusa.com/missions/',d:'Electron from New Zealand and Wallops Island, Virginia.'},
  nasa:{n:'NASA',yt:'https://www.youtube.com/@NASA/streams',site:'https://www.nasa.gov/',d:'Coverage of NASA science, crew and Artemis missions, also on NASA+.'}};
var STATUS={go:['s-go','Go for launch','Go'],tbd:['s-tbd','Time to be confirmed','Time TBC'],hold:['s-hold','On hold','On hold']};
function prep(L){L.siteObj=ORB.SITES[L.site];L.trk=ORB.track(L,2);L.end=L.trk[L.trk.length-1].t;L.events=ORB.EVENTS[L.v];L.sep=(L.events.filter(function(e){return /separation|staging/i.test(e[1])})[0]||[150])[0]}
LAUNCHES.forEach(prep);
function provOf(L){return PROV[L.prov]||L.pv||PROV.spacex}
function watchUrl(L){return L.vid||provOf(L).yt}
function goTxt(L){return L.go==null?'Pending':L.go+'% go'}
var LIVE={on:false,gen:null};
function fromFeed(f){if(!f||!f.pad||!ORB.PROF[f.v])return null;ORB.SITES[f.site]={n:f.pad.n,full:f.pad.full,lat:f.pad.lat,lon:f.pad.lon,st:f.pad.st};return {id:f.id,prov:f.prov,pv:f.pv,orbit:f.orbit,go:f.go,v:f.v,veh:f.veh,mis:f.mis,site:f.site,az:f.az,utc:f.utc,tz:f.tz,st:f.st,vid:f.vid}}
function setLaunches(list){S.cache={};LAUNCHES.length=0;list.forEach(function(L){LAUNCHES.push(L)});LAUNCHES.forEach(prep);S.cur=0;S.simT=-10}
function setDataNote(){var t=$('#dataTag');if(LIVE.on){var m=Math.max(0,Math.round((Date.now()-Date.parse(LIVE.gen))/60000)),ago=m<60?m+' min ago':m<2880?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago';t.textContent='Live data · updated '+ago;t.className='dtag live';$('#manNote').textContent='Launch data from Launch Library 2 by The Space Devs, refreshed every 30 minutes. Visibility is a modeled estimate from the launch pad, vehicle and a typical flight path.';$('#footNote').textContent='Live launch data · Visibility is a modeled estimate'}else{t.textContent='Sample data';t.className='dtag'}}
function loadLive(){if(!/^https?:$/.test(location.protocol)||!window.fetch)return;fetch('launches.json?_='+Math.floor(Date.now()/60000)).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){var cut=Date.now()-30*60000,list=(j.launches||[]).map(fromFeed).filter(function(L){return L&&Date.parse(L.utc)>cut});if(!list.length)return;LIVE.on=true;LIVE.gen=j.generated;setLaunches(list);refresh();setDataNote();sizeSky()}).catch(function(){})}
function fmtDay(L){return new Date(L.utc).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:L.tz})}
function fmtTime(L){return new Date(L.utc).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short',timeZone:L.tz})}
var S={cur:0,obs:null,user:store.get('radar.user'),rem:store.get('radar.rem')||{},simT:-10,playing:!reduce,cache:{}};
function L0(){return LAUNCHES[S.cur]}
function vis(L,o){o=o||S.obs;var k=L.id+'|'+o.zip;if(!S.cache[k])S.cache[k]=ORB.visibility(L,L.trk,o.lat,o.lon);return S.cache[k]}
var DIRW={N:'north',NNE:'north northeast',NE:'northeast',ENE:'east northeast',E:'east',ESE:'east southeast',SE:'southeast',SSE:'south southeast',S:'south',SSW:'south southwest',SW:'southwest',WSW:'west southwest',W:'west',WNW:'west northwest',NW:'northwest',NNW:'north northwest'};
function bearingTo(o,lat,lon){return ORB.look(o.lat,o.lon,lat,lon,0).az}
function elWord(e){return e>25?'high in the sky':e>12?'well above the horizon':e>5?'low above the horizon':'just above the horizon'}

/* hero */
function renderHero(){var L=L0();$('#heroTitle').textContent=L.mis;$('#heroKicker').textContent=S.cur===0?'Next launch':'Selected launch';var st=STATUS[L.st],hs=$('#heroStatus');hs.className='status '+st[0];hs.textContent=st[1];
  var P0=provOf(L);$('#heroWatch').href=watchUrl(L);$('#heroSite').href=P0.site;$('#hfVeh').textContent=L.veh;$('#hfPad').textContent=L.siteObj.n;$('#hfOrbit').textContent=L.orbit;$('#hfWx').textContent=goTxt(L);$('#hfWx').className=L.go==null?'':'s-go';$('#hfZip').textContent=S.obs.zip;var vv=vis(L);$('#hfVis').textContent=vv.best?(vv.day?'Daytime':vv.rating):'Not visible';$('#ncName').textContent=L.mis;
  $('#heroSub').innerHTML='<span>'+L.veh+'</span><span>'+esc(L.siteObj.full)+'</span><span>'+fmtDay(L)+' · '+fmtTime(L)+'</span>';updateRemind()}
function tick(){var s=Math.max(0,Math.round((new Date(L0().utc).getTime()-Date.now())/1000));$('#cD').textContent=pad2(Math.min(99,Math.floor(s/86400)));$('#cH').textContent=pad2(Math.floor(s%86400/3600));$('#cM').textContent=pad2(Math.floor(s%3600/60));$('#cS').textContent=pad2(s%60);$('#ncTime').textContent=pad2(Math.min(99,Math.floor(s/86400)))+'d '+pad2(Math.floor(s%86400/3600))+':'+pad2(Math.floor(s%3600/60))+':'+pad2(s%60)}
setInterval(tick,1000);

/*__GLOBE__*/
/* hero canvas: photographic Earth with a launch rising from Cape Canaveral */
var hc=$('#space'),hx=hc.getContext('2d'),HW=0,HH=0,HD=1,T=0,EIMG=null,EOK=false,glints=[],PART=[];
var IW=1672,IH=941,CAPE=[944,694];
(function(){var im=new Image();im.onload=function(){EIMG=im;EOK=true;findGlints()};im.src=$('#earthSrc').getAttribute('data-src')})();
function findGlints(){var w=418,h=235,c=document.createElement('canvas');c.width=w;c.height=h;var g=c.getContext('2d');g.drawImage(EIMG,0,0,w,h);var d=g.getImageData(0,0,w,h).data,cand=[];
  for(var y=0;y<h;y++)for(var x=0;x<w;x++){var o=(y*w+x)*4,r=d[o],gg=d[o+1],b=d[o+2];if(r>170&&r>b+60&&gg>110&&y*4>215+x*4*.13+45)cand.push([x*4+2,y*4+2,(r+gg)/510])}
  cand.sort(function(a,b){return b[2]-a[2]});var out=[];for(var i=0;i<cand.length&&out.length<220;i++){var c2=cand[i];if(out.every(function(q){return Math.abs(q[0]-c2[0])+Math.abs(q[1]-c2[1])>14}))out.push(c2)}glints=out}
function sizeHero(){var r=hc.getBoundingClientRect();if(!r.width)return;HW=r.width;HH=r.height;HD=Math.min(3,window.devicePixelRatio||1);hc.width=Math.round(HW*HD);hc.height=Math.round(HH*HD);hx.setTransform(HD,0,0,HD,0,0)}
// cover fit focused on Florida, with a slow drift
function view(t){var z=1.06+(reduce?0:.03*Math.sin(t*.05));var s=Math.max(HW/IW,HH/IH)*z;var fx=HW<700?.6:.5,fy=HW<700?.62:.5;var ox=HW*.5-IW*s*fx,oy=HH*.5-IH*s*fy;ox=Math.min(0,Math.max(HW-IW*s,ox));oy=Math.min(0,Math.max(HH-IH*s,oy));
  if(!reduce){ox+=Math.sin(t*.031)*6;oy+=Math.cos(t*.027)*4}return {s:s,ox:ox,oy:oy}}
function I2S(v,p){return [v.ox+p[0]*v.s,v.oy+p[1]*v.s]}
function drawHero(dt){if(!HW)return;if(!reduce)T+=dt;var t=reduce?14:T;hx.fillStyle='#02040A';hx.fillRect(0,0,HW,HH);var LL=L0(),inFL=!!(LL.siteObj&&LL.siteObj.st==='FL'),G=null,v=null;
  if(inFL){if(!EOK)return;v=view(t);hx.drawImage(EIMG,v.ox,v.oy,IW*v.s,IH*v.s)}else{G=globeFor(LL);if(!G)return;hx.drawImage(G.cv,0,0,HW,HH);globeTwinkle(G,t)}
  if(inFL){
  // city lights shimmer
  hx.save();hx.globalCompositeOperation='lighter';for(var i=0;i<glints.length;i++){var q=glints[i],p=I2S(v,q),tw=reduce?.5:.5+.5*Math.sin(t*(1.1+(i%9)*.21)+i*1.7);if(tw<.35)continue;var rr=(2+q[2]*2.5)*v.s;var g=hx.createRadialGradient(p[0],p[1],0,p[0],p[1],rr*2.4);g.addColorStop(0,'rgba(255,215,150,'+(.38*(tw-.35))+')');g.addColorStop(1,'rgba(255,170,90,0)');hx.fillStyle=g;hx.beginPath();hx.arc(p[0],p[1],rr*2.4,0,6.283);hx.fill()}hx.restore();
  // sunrise breathing on the horizon
  var sr=I2S(v,[1560,395]),br=reduce?1:.75+.25*Math.sin(t*.35);hx.save();hx.globalCompositeOperation='lighter';hx.translate(sr[0],sr[1]);hx.rotate(.2);hx.scale(4,1);var sg=hx.createRadialGradient(0,0,0,0,0,70*v.s);sg.addColorStop(0,'rgba(255,220,170,'+(.22*br)+')');sg.addColorStop(1,'rgba(255,160,90,0)');hx.fillStyle=sg;hx.beginPath();hx.arc(0,0,70*v.s,0,6.283);hx.fill();hx.restore();
  }
  // launch from the pad, along its real flight path
  var LOOP=22,lt=t%LOOP,u=clamp((lt-2.2)/14,0,1),fade=lt<18?1:Math.max(0,1-(lt-18)/4);
  var P=inFL?[CAPE,[960,560],[1080,420],[1235,262]].map(function(p){return I2S(v,p)}):null;
  function bez(k){if(G)return G.at(k);var w=1-k;return [w*w*w*P[0][0]+3*w*w*k*P[1][0]+3*w*k*k*P[2][0]+k*k*k*P[3][0],w*w*w*P[0][1]+3*w*w*k*P[1][1]+3*w*k*k*P[2][1]+k*k*k*P[3][1]]}
  var base=G?G.pad:P[0];
  // pad: a pulsing marker before liftoff
  if(lt<2.6){var pu2=reduce?.6:.5+.5*Math.sin(t*5);hx.strokeStyle='rgba(185,168,255,'+(.5+.4*pu2)*(lt<2.2?1:(2.6-lt)/.4)+')';hx.lineWidth=1.2;hx.beginPath();hx.arc(base[0],base[1],6+8*pu2,0,6.283);hx.stroke()}
  if(lt>1.8&&lt<4.5){var ig=lt<2.2?(lt-1.8)/.4:1-(lt-2.2)/2.3;hx.save();hx.globalCompositeOperation='lighter';var pg=hx.createRadialGradient(base[0],base[1],0,base[0],base[1],38);pg.addColorStop(0,'rgba(255,240,210,'+ig+')');pg.addColorStop(.3,'rgba(255,190,110,'+(.5*ig)+')');pg.addColorStop(1,'rgba(255,150,70,0)');hx.fillStyle=pg;hx.beginPath();hx.arc(base[0],base[1],38,0,6.283);hx.fill();hx.restore()}
  if(u>0&&fade>0){var pu=Math.pow(u,.85),sepu=Math.pow(LL.sep/LL.end,.85);
    hx.save();hx.lineCap='round';var n2=140;for(var j=1;j<=n2*pu;j++){var a1=(j-1)/n2,b1=j/n2,p1=bez(a1),p2=bez(b1),age=pu-b1,al=Math.max(.1,1-age*1.1)*fade;var warm=b1<sepu;hx.strokeStyle=warm?'rgba(255,'+(190+b1*60|0)+','+(120+b1*110|0)+','+(al*.9)+')':'rgba(225,236,255,'+(al*.8)+')';hx.lineWidth=warm?1.8:1.2;hx.beginPath();hx.moveTo(p1[0],p1[1]);hx.lineTo(p2[0],p2[1]);hx.stroke();hx.strokeStyle=warm?'rgba(255,170,90,'+(al*.12)+')':'rgba(160,205,255,'+(al*.1)+')';hx.lineWidth=7;hx.stroke()}hx.restore();
    var h=bez(pu),bk=bez(Math.max(0,pu-.02)),ang=Math.atan2(h[1]-bk[1],h[0]-bk[0]);
    if(!reduce&&lt<16){PART.push({x:h[0],y:h[1],vx:-Math.cos(ang)*8+(Math.random()-.5)*6,vy:-Math.sin(ang)*8+(Math.random()-.5)*6,a:0,m:1.2+Math.random(),lit:u>sepu})}
    hx.save();hx.globalCompositeOperation='lighter';for(j=PART.length-1;j>=0;j--){var q2=PART[j];q2.a+=dt;if(q2.a>q2.m){PART.splice(j,1);continue}q2.x+=q2.vx*dt;q2.y+=q2.vy*dt;var f=1-q2.a/q2.m;hx.fillStyle=q2.lit?'rgba(180,210,255,'+(.16*f)+')':'rgba(255,180,100,'+(.2*f)+')';hx.beginPath();hx.arc(q2.x,q2.y,1.2+q2.a*5,0,6.283);hx.fill()}hx.restore();
    if(LL.sep<LL.end&&u>sepu){var k2=(u-sepu)*LL.end,fl=Math.max(0,1-k2/14);if(fl>0){var spp=bez(sepu);hx.save();hx.globalCompositeOperation='lighter';var fg=hx.createRadialGradient(spp[0],spp[1],0,spp[0],spp[1],28);fg.addColorStop(0,'rgba(255,255,255,'+(.85*fl)+')');fg.addColorStop(1,'rgba(255,230,200,0)');hx.fillStyle=fg;hx.beginPath();hx.arc(spp[0],spp[1],28,0,6.283);hx.fill();hx.restore()}}
    var fk=reduce?1:.88+Math.random()*.24;hx.save();hx.globalCompositeOperation='lighter';hx.translate(h[0],h[1]);hx.rotate(ang);var pl=(u<sepu?22:16)*fk;var cg=hx.createLinearGradient(0,0,-pl*1.8,0);cg.addColorStop(0,'rgba(255,245,225,'+fade+')');cg.addColorStop(.35,u<sepu?'rgba(255,170,80,'+(.5*fade)+')':'rgba(170,205,255,'+(.4*fade)+')');cg.addColorStop(1,'rgba(255,120,40,0)');hx.fillStyle=cg;hx.beginPath();hx.moveTo(0,0);hx.lineTo(-pl*1.8,-pl*.25);hx.quadraticCurveTo(-pl*2.1,0,-pl*1.8,pl*.25);hx.closePath();hx.fill();hx.rotate(-ang);var hg=hx.createRadialGradient(0,0,0,0,0,16*fk);hg.addColorStop(0,'rgba(255,252,245,'+fade+')');hg.addColorStop(.3,'rgba(255,225,180,'+(.55*fade)+')');hg.addColorStop(1,'rgba(255,150,60,0)');hx.fillStyle=hg;hx.beginPath();hx.arc(0,0,16*fk,0,6.283);hx.fill();hx.restore();
    if(HW>=700&&lt<18){var ft=u*LL.end,sv=ORB.interp(ORB.PROF[LL.v],ft);hx.font='600 10.5px Barlow, sans-serif';var t1=LL.veh.toUpperCase()+'  T+'+fmtTs(ft)+'  ·  '+Math.round(sv[0])+' KM',tw2=hx.measureText(t1).width+18,tx=h[0]+18,ty=h[1]+8;if(tx+tw2>HW-8)tx=h[0]-18-tw2;hx.fillStyle='rgba(0,0,0,.6)';hx.fillRect(tx,ty,tw2,22);hx.fillStyle='#fff';hx.fillText(t1,tx+9,ty+15)}
  }
  // keep the copy readable
  var vg=hx.createLinearGradient(0,0,HW*(HW<700?1:.62),0);vg.addColorStop(0,'rgba(0,0,0,.72)');vg.addColorStop(.6,'rgba(0,0,0,.35)');vg.addColorStop(1,'rgba(0,0,0,0)');hx.fillStyle=vg;hx.fillRect(0,0,HW,HH);
  var bg=hx.createLinearGradient(0,HH*.55,0,HH);bg.addColorStop(0,'rgba(0,0,0,0)');bg.addColorStop(1,'rgba(0,0,0,.55)');hx.fillStyle=bg;hx.fillRect(0,HH*.55,HW,HH*.45)}

/* view card */
function setTxt(sel,v){$(sel).textContent=v}
function renderView(){var L=L0(),o=S.obs,v=vis(L);setTxt('#vcLoc',o.city+' '+o.zip);
  var big=v.score===4?'Excellent view':v.score===3?'Great view':v.score===2?'Good view':v.score===1?'Low view':'Not visible';if(v.best&&v.day)big='Daytime';
  var az=v.best?v.best.az:bearingTo(o,L.siteObj.lat,L.siteObj.lon),dw=DIRW[ORB.dir16(az)];
  var sub=v.best?(v.day?'It is daylight. Look '+dw+' for the exhaust trail.':'Look '+dw+', '+elWord(v.best.el)+', from T+'+fmtTs(v.first)+'.'):'It stays below the horizon from '+o.short+'. Watch the stream.';
  setTxt('#vcBig',big);setTxt('#vcSub',sub);setTxt('#vcDir',ORB.dir16(az)+' '+Math.round(az)+'°');setTxt('#vcPeak',v.best?Math.round(v.best.el)+'°':'Below horizon');setTxt('#vcWin',v.best?'T+'+fmtTs(v.first)+' to '+fmtTs(v.last):'Not in view');setTxt('#vcDist',Math.round(ORB.dist(o.lat,o.lon,L.siteObj.lat,L.siteObj.lon)*.621)+' mi');
  $('#needle').style.transform='rotate('+az+'deg)';$('#cpDeg').textContent=String(Math.round(az)).padStart(3,'0')+'°';$('#cpDir').textContent=ORB.dir16(az);var wd='';if(v.best&&v.firstS){var a1=v.firstS.az,a2=v.samples[Math.min(v.samples.length-1,Math.round(v.last/2))].az,dd=wrap180(a2-a1);if(Math.abs(dd)<6){a1-=3;dd=6*(dd<0?-1:1)}var R1=96,R2=106,Pp=function(a,r){var q=(a-90)*Math.PI/180;return (120+r*Math.cos(q)).toFixed(1)+' '+(120+r*Math.sin(q)).toFixed(1)},sw=dd>0?1:0,lg=Math.abs(dd)>180?1:0;wd='M'+Pp(a1,R2)+' A'+R2+' '+R2+' 0 '+lg+' '+sw+' '+Pp(a1+dd,R2)+' L'+Pp(a1+dd,R1)+' A'+R1+' '+R1+' 0 '+lg+' '+(1-sw)+' '+Pp(a1,R1)+' Z'}$('#vcWedge').setAttribute('d',wd);setTxt('#skyFace',ORB.dir16(az));SV={};sizeSky()}

/* sky sim */
var sc=$('#skyc'),sx=sc.getContext('2d'),SW=0,SH=0,SD=1,SV={},sstars=[];
function sizeSky(){var r=sc.getBoundingClientRect();if(!r.width)return;SW=r.width;SH=r.height;SD=Math.min(3,window.devicePixelRatio||1);sc.width=Math.round(SW*SD);sc.height=Math.round(SH*SD);sx.setTransform(SD,0,0,SD,0,0);sstars=[];for(var i=0;i<140;i++)sstars.push({a:Math.random()*360,e:Math.pow(Math.random(),.9)*80,r:.4+Math.random()*.8,b:Math.random()});
  var L=L0(),v=vis(L),o=S.obs,hy=SH-(SW<600?64:72),top=50,avail=hy-top;var pts=v.samples.filter(function(s){return s.el>-2&&s.range<1600});
  if(v.best&&pts.length){var ax=0,ay=0;pts.forEach(function(s){ax+=Math.sin(s.az*Math.PI/180);ay+=Math.cos(s.az*Math.PI/180)});var vc=(Math.atan2(ax,ay)*180/Math.PI+360)%360,spread=0;pts.forEach(function(s){spread=Math.max(spread,Math.abs(wrap180(s.az-vc)))});SV={vc:vc,k:Math.min(SW/Math.max(50,spread*2+24),avail*.85/Math.max(v.best.el,5)),hy:hy,ok:true}}
  else SV={vc:bearingTo(o,L.siteObj.lat,L.siteObj.lon),k:SW/100,hy:hy,ok:false};SV.padAz=bearingTo(o,L.siteObj.lat,L.siteObj.lon)}
function skyXY(az,el){return [SW/2+wrap180(az-SV.vc)*SV.k,SV.hy-el*SV.k]}
function sampleAt(L,v,t){var arr=v.samples;if(t<=0)return arr[0];var f=t/2,i=Math.min(arr.length-2,Math.floor(f)),u=f-i,a=arr[i],b=arr[i+1];return {az:a.az+wrap180(b.az-a.az)*u,el:a.el+(b.el-a.el)*u,range:a.range+(b.range-a.range)*u}}
function drawSky(){if(!SW||!SV.hy)return;var L=L0(),v=vis(L),o=S.obs,hy=SV.hy,d=new Date(new Date(L.utc).getTime()+Math.max(0,S.simT)*1000),se=ORB.sunEl(o.lat,o.lon,d),dark=clamp((-se-2)/12,0,1);
  var top=se<-14?[2,3,8]:se<-4?[6,10,24]:se<4?[14,28,60]:[22,60,110],bot=se<-14?[8,14,30]:se<-4?[40,46,80]:se<4?[70,100,150]:[90,140,190];
  var g=sx.createLinearGradient(0,0,0,hy);g.addColorStop(0,'rgb('+top.join(',')+')');g.addColorStop(1,'rgb('+bot.join(',')+')');sx.fillStyle=g;sx.fillRect(0,0,SW,SH);
  if(se>-18){var saz=ORB.sunAz(o.lat,o.lon,d),sp=skyXY(saz,0),gl=clamp((se+18)/18,0,1);var rg=sx.createRadialGradient(sp[0],hy,0,sp[0],hy,SW*.5);rg.addColorStop(0,'rgba(255,170,110,'+(.35*gl)+')');rg.addColorStop(1,'rgba(255,120,90,0)');sx.fillStyle=rg;sx.fillRect(0,0,SW,hy)}
  if(dark>.02){sx.fillStyle='#fff';for(var i=0;i<sstars.length;i++){var s=sstars[i],p=skyXY(SV.vc+s.a-180,s.e);if(p[0]<0||p[0]>SW||p[1]>hy)continue;sx.globalAlpha=dark*(.3+.6*s.b);sx.beginPath();sx.arc(p[0],p[1],s.r,0,6.283);sx.fill()}sx.globalAlpha=1}
  sx.save();sx.setLineDash([2,6]);sx.strokeStyle='rgba(255,255,255,.14)';sx.font='500 10px Barlow, sans-serif';sx.fillStyle='rgba(255,255,255,.45)';var step=SV.k*10<34?20:10;for(var e=step;e<90;e+=step){var y=hy-e*SV.k;if(y<30)break;sx.beginPath();sx.moveTo(0,y);sx.lineTo(SW,y);sx.stroke();sx.fillText(e+'°',SW-30,y-4)}sx.restore();
  var smp=v.samples,pts=[];for(var j=0;j<smp.length;j++){var q=smp[j];pts.push(q.el>-1.5&&q.range<1600?skyXY(q.az,q.el):null)}
  sx.save();sx.setLineDash([3,7]);sx.strokeStyle='rgba(255,255,255,.28)';sx.lineWidth=1;sx.beginPath();var pen=false;for(j=0;j<pts.length;j++){if(pts[j]){if(!pen){sx.moveTo(pts[j][0],pts[j][1]);pen=true}else sx.lineTo(pts[j][0],pts[j][1])}else pen=false}sx.stroke();sx.restore();
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
  var sp2=[-10,L.end+8],f=(S.simT-sp2[0])/(sp2[1]-sp2[0]);$('#rpFill').style.width=(f*100)+'%';$('#rpHead').style.left=(f*100)+'%';$('#rpClock').textContent=fmtT(S.simT);$('#rpTrack').setAttribute('aria-valuenow',Math.round(f*100))}
var playI='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',pauseI='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
function setPlaying(p){S.playing=p;$('#rpPlay').innerHTML=p?pauseI:playI;$('#rpPlay').setAttribute('aria-label',p?'Pause':'Play')}
$('#rpPlay').addEventListener('click',function(){setPlaying(!S.playing)});
(function(){var tr=$('#rpTrack'),drag=false;function setFrom(e){var r=tr.getBoundingClientRect(),f=clamp((e.clientX-r.left)/r.width,0,1);S.simT=-10+f*(L0().end+18)}tr.addEventListener('pointerdown',function(e){drag=true;tr.setPointerCapture(e.pointerId);setFrom(e)});tr.addEventListener('pointermove',function(e){if(drag)setFrom(e)});tr.addEventListener('pointerup',function(){drag=false});tr.addEventListener('keydown',function(e){if(e.key==='ArrowRight'){S.simT+=10;e.preventDefault()}if(e.key==='ArrowLeft'){S.simT-=10;e.preventDefault()}if(e.key===' '){setPlaying(!S.playing);e.preventDefault()}})})();

/* manifest */
var bellSvg='<svg class="ico" width="20" height="20" aria-hidden="true"><use href="#i-bell"/></svg>';
function renderRows(){$('#rows').innerHTML=LAUNCHES.map(function(L,i){var v=vis(L),on=!!S.rem[L.id],st=STATUS[L.st];
  var vt=v.best?'<b>'+(v.day?'Daytime':v.rating)+'</b><span>Look '+ORB.dir16(v.best.az)+' · peak '+Math.round(v.best.el)+'°</span>':'<b style="color:var(--fg-3)">Not visible</b><span>Below your horizon</span>';
  return '<div class="row" style="animation-delay:'+(i*.05)+'s"><div><div class="r-day">'+fmtDay(L)+'</div><div class="r-time tnum">'+fmtTime(L)+'</div></div><div><div class="r-veh">'+L.veh+'</div><div class="r-mis">'+esc(L.mis)+'</div><div class="r-links"><a href="'+watchUrl(L)+'" target="_blank" rel="noopener">Watch</a><a href="'+provOf(L).site+'" target="_blank" rel="noopener">'+provOf(L).n+' site</a></div></div><div class="r-pad">'+esc(L.siteObj.full)+'</div><div class="r-vis">'+vt+'</div><div class="r-st"><span class="status '+st[0]+'">'+st[2]+'</span></div><div class="r-acts"><button class="btn btn-sm" type="button" data-track="'+i+'">View</button><button class="bell" type="button" data-id="'+L.id+'" aria-pressed="'+on+'" aria-label="Reminder for '+L.veh+' '+esc(L.mis)+'">'+bellSvg+'</button></div></div>'}).join('')}
$('#rows').addEventListener('click',function(e){var t=e.target.closest('[data-track]');if(t){S.cur=+t.dataset.track;S.simT=-10;refresh();showTab('sky');$('#top').scrollIntoView({behavior:reduce?'auto':'smooth'});return}var b=e.target.closest('.bell');if(b)toggleRem(b.dataset.id,b)});
var pendingRem=null;
function toggleRem(id,btn){if(!S.user){pendingRem=id;openLogin('signin','Sign in to save launch reminders.');return}var on=!S.rem[id];if(on)S.rem[id]=1;else delete S.rem[id];store.set('radar.rem',S.rem);var L=LAUNCHES.filter(function(l){return l.id===id})[0];
  if(btn){btn.setAttribute('aria-pressed',on);var sv=btn.querySelector('svg');sv.classList.remove('bell-ring');void sv.offsetWidth;sv.classList.add('bell-ring')}else renderRows();toast(on?'Reminder set · '+L.veh+' '+L.mis:'Reminder removed');updateRemind()}
function updateRemind(){var b=$('#heroRemind'),on=!!S.rem[L0().id];b.classList.toggle('on',on);b.classList.toggle('btn-solid',!on);b.querySelector('span').textContent=on?'Reminder set':'Set reminder'}
$('#heroRemind').addEventListener('click',function(){toggleRem(L0().id,null);var sv=$('#heroRemind svg');sv.classList.remove('bell-ring');void sv.offsetWidth;sv.classList.add('bell-ring')});

/* zip */
function setZip(z,announce){z=String(z).trim();var err=$('#zipErr');if(!/^\d{5}$/.test(z)){err.textContent='Enter a 5 digit US ZIP code.';return}var i=findZip(z);if(i<0){err.textContent='We could not find ZIP '+z+'.';return}err.textContent='';S.obs=zipInfo(i);store.set('radar.zip',z);$('#zipInput').value=z;S.simT=-10;refresh();if(announce)toast('Checking the sky from '+S.obs.city)}
$('#zipForm').addEventListener('submit',function(e){e.preventDefault();setZip($('#zipInput').value,true)});
$('#zipInput').addEventListener('input',function(){this.value=this.value.replace(/\D/g,'').slice(0,5)});
function refresh(){loadWx(S.obs);renderHero();renderView();renderRows();renderAuth();renderWx();renderWatch();renderFeedHead()}

/* auth */
function initials(n){return n.split(/\s+/).filter(Boolean).map(function(w){return w[0]}).slice(0,2).join('').toUpperCase()||'?'}
function renderAuth(){var slot=$('#authSlot');
  if(S.user){slot.innerHTML='<div style="position:relative"><button type="button" id="avBtn" aria-haspopup="true" aria-expanded="false" style="min-height:44px;display:flex;align-items:center"><span class="avatar">'+esc(initials(S.user.name))+'</span></button></div>';
    $('#avBtn').addEventListener('click',function(e){e.stopPropagation();var ex=$('#userMenu');if(ex){ex.remove();return}var m=document.createElement('div');m.className='menu';m.id='userMenu';m.innerHTML='<div class="menu-h"><b>'+esc(S.user.name)+'</b><span>'+esc(S.user.email)+'</span></div><button type="button" data-a="rem">Reminders<span>'+Object.keys(S.rem).length+'</span></button><button type="button" data-a="home">Home ZIP<span>'+esc(S.user.zip||'—')+'</span></button><button type="button" data-a="out">Sign out</button>';this.parentNode.appendChild(m);
      m.addEventListener('click',function(ev){var b=ev.target.closest('button');if(!b)return;m.remove();if(b.dataset.a==='out'){S.user=null;store.del('radar.user');renderAuth();toast('Signed out')}if(b.dataset.a==='rem'){showTab('launches');$('.tabsec').scrollIntoView({behavior:reduce?'auto':'smooth'})}if(b.dataset.a==='home'&&S.user.zip)setZip(S.user.zip,true)})});
    $('#joinCta').innerHTML='<span class="status s-go">Signed in as '+esc(S.user.name)+'</span>';$('#compAv').textContent=initials(S.user.name)}
  else{slot.innerHTML='<button class="btn btn-sm" type="button" data-login="signin">Sign in</button>';$('#joinCta').innerHTML='<button class="btn btn-sm btn-solid" type="button" data-login="google">Continue with Google</button><button class="btn btn-sm" type="button" data-login="astro">Continue with Astro</button>';$('#compAv').textContent='?'}}
document.addEventListener('click',function(e){var b=e.target.closest('[data-login]');if(b){var m=b.dataset.login;if(m==='google'||m==='astro'){openLogin('signin');setTimeout(function(){var sb=$('[data-sso="'+m+'"]');if(sb)sb.click()},300)}else openLogin(m)}if(!e.target.closest('#userMenu')&&!e.target.closest('#avBtn')){var um=$('#userMenu');if(um)um.remove()}});
var lastFocus=null;
function openLogin(mode,reason){lastFocus=document.activeElement;$('#modalRoot').innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlgT"><div class="modal-bg" data-close="1"></div><div class="dialog"><button class="dlg-x" type="button" data-close="1" aria-label="Close"><svg class="ico" width="22" height="22" aria-hidden="true"><use href="#i-close"/></svg></button><div id="dlgBody"></div></div></div>';renderLoginBody(mode,reason);document.addEventListener('keydown',escClose)}
function escClose(e){if(e.key==='Escape')closeLogin()}
function closeLogin(){$('#modalRoot').innerHTML='';document.removeEventListener('keydown',escClose);if(lastFocus&&lastFocus.focus)lastFocus.focus()}
$('#modalRoot').addEventListener('click',function(e){if(e.target.closest('[data-close]'))closeLogin()});
function renderLoginBody(mode,reason){var create=mode==='create',b=$('#dlgBody');
  b.innerHTML='<h2 id="dlgT">'+(create?'Join Radar':'Sign in')+'</h2><p>'+(reason?esc(reason):create?'One account for Radar and Astro.':'Sync reminders and your home ZIP.')+'</p><div class="dtabs" role="tablist"><button class="dtab" role="tab" type="button" aria-selected="'+!create+'" data-m="signin">Sign in</button><button class="dtab" role="tab" type="button" aria-selected="'+create+'" data-m="create">Create account</button></div>'+
  '<form id="authForm" novalidate>'+(create?'<div class="field"><label class="label" for="fName">Name</label><input id="fName" autocomplete="name"></div>':'')+'<div class="field"><label class="label" for="fEmail">Email</label><input id="fEmail" type="email" autocomplete="email"><span class="ferr" id="eEmail"></span></div><div class="field"><label class="label" for="fPass">Password</label><input id="fPass" type="password" autocomplete="'+(create?'new-password':'current-password')+'"><span class="ferr" id="ePass"></span></div>'+(create?'<div class="field"><label class="label" for="fZip">Home ZIP</label><input id="fZip" inputmode="numeric" maxlength="5" value="'+esc(S.obs.zip)+'"></div>':'')+'<button class="btn btn-solid dlg-submit" type="submit" id="authSubmit">'+(create?'Create account':'Sign in')+'</button></form>'+
  '<div class="or">OR</div><div class="sso"><button class="btn" type="button" data-sso="google">Google</button><button class="btn" type="button" data-sso="astro">Astro</button></div><p class="dlg-note">Demo sign in. Nothing you type leaves this page.</p>';
  $$('.dtab',b).forEach(function(t){t.addEventListener('click',function(){renderLoginBody(t.dataset.m,reason)})});setTimeout(function(){var f=$(create?'#fName':'#fEmail');if(f)f.focus()},60);
  $('#authForm').addEventListener('submit',function(e){e.preventDefault();var em=$('#fEmail').value.trim(),pw=$('#fPass').value,ok=true;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){$('#eEmail').textContent='Enter an email like name@example.com.';$('#fEmail').setAttribute('aria-invalid','true');ok=false}else{$('#eEmail').textContent='';$('#fEmail').removeAttribute('aria-invalid')}if(pw.length<8){$('#ePass').textContent='Use at least 8 characters.';$('#fPass').setAttribute('aria-invalid','true');ok=false}else{$('#ePass').textContent='';$('#fPass').removeAttribute('aria-invalid')}if(!ok)return;
    var nm=create&&$('#fName').value.trim()?$('#fName').value.trim():em.split('@')[0].replace(/[._]/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()}),zp=create?$('#fZip').value.trim():S.obs.zip;busy($('#authSubmit'),function(){finishLogin({name:nm,email:em,zip:findZip(zp)>=0?zp:S.obs.zip})})});
  $$('[data-sso]',b).forEach(function(s){s.addEventListener('click',function(){var m=s.dataset.sso;busy(s,function(){finishLogin({name:m==='google'?'Google member':'Astro member',email:'signed in with '+(m==='google'?'Google':'Astro'),zip:S.obs.zip})})})})}
function busy(btn,cb){btn.disabled=true;btn.style.width=btn.offsetWidth+'px';btn.innerHTML='<span class="spinner" aria-hidden="true"></span><span class="sr">Signing in</span>';setTimeout(cb,reduce?100:900)}
function finishLogin(u){S.user=u;store.set('radar.user',u);$('#dlgBody').innerHTML='<div class="success"><svg width="64" height="64" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="none" stroke="rgba(95,227,161,.35)" stroke-width="2"/><path d="M22 37 l10 10 l19 -22" fill="none" stroke="#5FE3A1" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg><h2 id="dlgT" style="margin-top:14px">Signed in</h2><p>Welcome, '+esc(u.name.split(' ')[0])+'.</p></div>';renderAuth();setTimeout(function(){closeLogin();if(pendingRem){var id=pendingRem;pendingRem=null;toggleRem(id,null)}},reduce?300:1300)}


/* ===== tabs ===== */
var TABS=['sky','launches','watch','astro'];
function moveInk(){var t=$('.ptab[aria-selected="true"]'),ink=$('#ptabInk');if(!t)return;ink.style.left=t.offsetLeft+'px';ink.style.width=t.offsetWidth+'px'}
function showTab(id,push){if(TABS.indexOf(id)<0)id='sky';$$('.ptab').forEach(function(b){var on=b.dataset.tab===id;b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1});TABS.forEach(function(k){var p=$('#p-'+k);p.hidden=k!==id;if(k===id){p.style.animation='none';void p.offsetWidth;p.style.animation=''}});moveInk();
  if(id==='sky')setTimeout(sizeSky,30);if(id==='watch')setTimeout(drawFeature,30);if(id==='astro')setTimeout(drawPostArt,30);try{history.replaceState(null,'','#'+id)}catch(e){}}
$$('.ptab').forEach(function(b){b.addEventListener('click',function(){showTab(b.dataset.tab)});b.addEventListener('keydown',function(e){var i=TABS.indexOf(b.dataset.tab);if(e.key==='ArrowRight'||e.key==='ArrowLeft'){var n=TABS[(i+(e.key==='ArrowRight'?1:3))%4];showTab(n);$('#t-'+n).focus();e.preventDefault()}})});
$$('.nav-links a[data-tab]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();showTab(a.dataset.tab);$('.tabsec').scrollIntoView({behavior:reduce?'auto':'smooth'})})});
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
function loadWx(o){if(NWS[o.zip]||!window.fetch||!/^https?:$/.test(location.protocol))return;var rec=NWS[o.zip]={ok:false};
  fetch('https://api.weather.gov/points/'+o.lat.toFixed(4)+','+o.lon.toFixed(4)).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){return fetch(j.properties.forecastGridData)}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){var p=j.properties;rec.sky=nwsSeries(p.skyCover);rec.temp=nwsSeries(p.temperature);rec.wspd=nwsSeries(p.windSpeed);rec.wdir=nwsSeries(p.windDirection);rec.ok=rec.sky.length>0;if(rec.ok&&S.obs&&S.obs.zip===o.zip)renderWx()}).catch(function(){rec.ok=false})}
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
  $('#wxTemp').textContent=w.temp==null?'n/a':w.temp+'°';$('#wxTag').textContent=w.live?'NWS forecast':w.beyond?'Sample · beyond NWS range':'Sample forecast';$('#wxCloud').textContent=w.clouds+'%';$('#wxWind').textContent=w.wind;$('#wxSky').textContent=v.sunObs>0?'Daylight':v.sunObs>-12?'Twilight':'Dark';
  var am=parseInt(d.toLocaleString('en-US',{hour:'numeric',hour12:false,timeZone:tz}),10)<12,cr=ORB.sunCross(o.lat,o.lon,d,-.833,am?1:-1);$('#wxSunK').textContent=am?'Sunrise':'Sunset';$('#wxSun').textContent=cr?new Date(cr).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:tz}):'n/a';
  var pathPts=[0,4,6,8,10][v.score];if(v.best&&v.day)pathPts=Math.max(2,pathPts-3);var score=v.best?Math.round(pathPts*(1-w.clouds/100*.8)*(.6+.4*(L.go==null?.8:L.go/100))):0;
  var t1,t2;if(!v.best){t1='Not visible from here';t2='The rocket never clears your horizon. Watch the live stream instead.'}else if(score>=8){t1='Clear view likely';t2='It climbs '+Math.round(v.best.el)+'° above your horizon and clouds should stay out of the way.'}else if(score>=5){t1='Good chance';t2='Look '+DIRW[ORB.dir16(v.best.az)]+'. Some clouds, so find a spot with an open horizon.'}else if(score>=3){t1='Partly blocked';t2='Clouds or a low angle may hide part of the climb. Worth a look if you are up.'}else{t1='Unlikely';t2='Clouds and a low angle make it hard to spot. The live stream is your best bet.'}
  $('#olT').textContent=t1;$('#olS').textContent=t2;$('#olScore').textContent=score+' / 10';$('#olBar').style.width=(score*10)+'%';$('#olPath').textContent=v.best?(v.day?'Daytime':v.rating):'Below horizon';$('#olCloud').textContent=w.clouds<25?'Low':w.clouds<60?'Some':'Heavy';$('#olSite').textContent=goTxt(L)}

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
function renderWatch(){var L=L0(),P0=provOf(L);$('#featWatch').href=watchUrl(L);$('#featT').textContent=L.veh+' · '+L.mis;$('#featS').textContent=fmtDay(L)+' · '+fmtTime(L)+(L.vid?' · live webcast link':' · on '+P0.n+'’s YouTube channel');
  var extra=[['nasaplus','NASA+','https://plus.nasa.gov/','NASA’s free streaming service with live launch coverage and documentaries.']];
  $('#providers').innerHTML=Object.keys(PROV).map(function(k){var p=PROV[k];return '<div class="prov"><div class="prov-h"><svg class="ico" width="26" height="26" aria-hidden="true"><use href="#i-rocket"/></svg><b>'+p.n+'</b></div><p>'+p.d+'</p><div class="prov-l"><a href="'+p.yt+'" target="_blank" rel="noopener">YouTube streams<svg class="ico" width="16" height="16" aria-hidden="true"><use href="#i-ext"/></svg></a><a href="'+p.site+'" target="_blank" rel="noopener">Official site<svg class="ico" width="16" height="16" aria-hidden="true"><use href="#i-ext"/></svg></a></div></div>'}).join('')+extra.map(function(e){return '<div class="prov"><div class="prov-h"><svg class="ico" width="26" height="26" aria-hidden="true"><use href="#i-watch"/></svg><b>'+e[1]+'</b></div><p>'+e[3]+'</p><div class="prov-l"><a href="'+e[2]+'" target="_blank" rel="noopener">Open NASA+<svg class="ico" width="16" height="16" aria-hidden="true"><use href="#i-ext"/></svg></a></div></div>'}).join('');
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
var liked={};
function fmtN(n){return n>=1000?(n/1000).toFixed(1).replace('.0','')+'K':String(n)}
var heart='<svg class="ico" width="19" height="19" aria-hidden="true"><use href="#i-heart"/></svg>';
var reply='<svg class="ico" width="19" height="19" aria-hidden="true"><use href="#i-reply"/></svg>';
function renderPosts(enter){$('#posts').innerHTML=POSTS.map(function(p,i){var on=!!liked[i];return '<article class="post'+(enter&&i<enter?' enter':'')+'"><span class="pav" style="background:'+GR[p.g]+'" aria-hidden="true">'+initials(p.n)+'</span><div class="pbody"><div class="phead"><b>'+esc(p.n)+'</b><span>'+p.h+' · '+p.min+'</span></div><div class="ptext">'+p.t+'</div>'+(p.m?'<div class="pmedia"><canvas data-seed="'+p.m[0]+'" data-tw="'+p.m[1]+'" data-p="'+p.m[2]+'"></canvas><span>Sample photo</span></div>':'')+'<div class="pact"><button class="act" type="button" data-reply="1" aria-label="Reply">'+reply+'Reply</button><button class="act'+(on?' on':'')+'" type="button" data-like="'+i+'" aria-pressed="'+on+'" aria-label="Like">'+heart+'<span>'+fmtN(p.l+(on?1:0))+'</span></button></div></div></article>'}).join('');if(!$('#p-astro').hidden)drawPostArt()}
$('#posts').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;if(!S.user){openLogin('signin','Sign in to join the launch thread.');return}if(b.dataset.reply){$('#compose').focus();return}var i=+b.dataset.like,on=!liked[i];liked[i]=on;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);b.lastChild.textContent=fmtN(POSTS[i].l+(on?1:0));if(on){b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop')}});
var ta=$('#compose'),send=$('#send');
ta.addEventListener('focus',function(){if(!S.user){ta.blur();openLogin('signin','Sign in to post to the launch thread.')}});
ta.addEventListener('input',function(){$('#cc').textContent=280-ta.value.length;send.disabled=!ta.value.trim()});
$('#tagLoc').addEventListener('click',function(){if(!S.user){openLogin('signin','Sign in to post to the launch thread.');return}ta.value=(ta.value+' Watching from '+S.obs.city+'.').trim();ta.dispatchEvent(new Event('input'))});
send.addEventListener('click',function(){var txt=esc(ta.value.trim()).replace(/#(\w+)/g,'<span class="ht">#$1</span>');if(!txt)return;POSTS.unshift({n:S.user.name,h:'@'+S.user.name.toLowerCase().replace(/[^a-z0-9]/g,''),g:2,t:txt,min:'now',l:0});liked={};ta.value='';send.disabled=true;$('#cc').textContent='280';renderPosts(1);toast('Posted to the live thread on Astro')});
function renderFeedHead(){var L=L0();$('#lbT').textContent='Live thread · '+L.veh+' · '+L.mis;$('#lbS').textContent=L.siteObj.full}
var vc=2418;setInterval(function(){vc+=Math.floor(Math.random()*17)-5;$('#viewers').textContent=vc.toLocaleString()+' watching'},2200);

/* loop */
var last=0;function loop(now){var dt=last?Math.min(.1,(now-last)/1000):.016;last=now;if(S.playing){S.simT+=dt*20;if(S.simT>L0().end+8)S.simT=-10}drawHero(dt);drawSky();requestAnimationFrame(loop)}

/* compass ticks */
(function(){var g=$('#cpTicks'),h='';for(var a=0;a<360;a+=5){var big=a%30===0,r1=big?92:96,r2=108,q=(a-90)*Math.PI/180;h+='<line x1="'+(120+r1*Math.cos(q)).toFixed(2)+'" y1="'+(120+r1*Math.sin(q)).toFixed(2)+'" x2="'+(120+r2*Math.cos(q)).toFixed(2)+'" y2="'+(120+r2*Math.sin(q)).toFixed(2)+'" stroke="'+(a===0?'#B9A8FF':big?'rgba(255,255,255,.8)':'rgba(255,255,255,.28)')+'" stroke-width="'+(big?1.6:1)+'"/>';if(big){var lab=a===0?'N':a===90?'E':a===180?'S':a===270?'W':String(a);h+='<text x="'+(120+80*Math.cos(q)).toFixed(2)+'" y="'+(120+80*Math.sin(q)+3.5).toFixed(2)+'" text-anchor="middle" font-family="Barlow, sans-serif" font-weight="600" font-size="'+(/[NESW]/.test(lab)?11:8.5)+'" fill="'+(a===0?'#B9A8FF':/[NESW]/.test(lab)?'#fff':'rgba(255,255,255,.5)')+'">'+lab+'</text>'}}g.innerHTML=h})();
/* boot */
var z0=(S.user&&S.user.zip)||store.get('radar.zip')||'33130';if(findZip(z0)<0)z0='33130';S.obs=zipInfo(findZip(z0));$('#zipInput').value=z0;
renderPosts(0);var h0=(location.hash||'').slice(1);showTab(TABS.indexOf(h0)>=0?h0:'sky');setPlaying(!reduce);if(reduce)S.simT=Math.round(L0().end*.45);sizeHero();refresh();setDataNote();loadLive();setInterval(setDataNote,60000);tick();requestAnimationFrame(loop);
window.addEventListener('resize',function(){clearTimeout(window._rz);window._rz=setTimeout(function(){sizeHero();sizeSky();drawFeature();drawPostArt()},120)});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){sizeSky();moveInk()});
if(S.user)setTimeout(function(){toast('Welcome back, '+S.user.name.split(' ')[0])},800);
var revs=$$('.reveal');if('IntersectionObserver' in window&&!reduce){var vh=window.innerHeight;revs.forEach(function(el){if(el.getBoundingClientRect().top>vh*.95)el.classList.add('pending')});var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.remove('pending');io.unobserve(en.target)}})},{threshold:.1});revs.forEach(function(el){io.observe(el)});setTimeout(function(){revs.forEach(function(el){el.classList.remove('pending')})},10000)}

})();
