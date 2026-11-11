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
// The ZIP table is its own file (zips.json, base 36 deltas), fetched once the page has painted. The hosted artifact has no files beside it, so it keeps the table in the page (#zipdata).
// Until the table arrives the page runs on the home ZIP this browser saved (radar.zipinfo) or on the default (ZIP0); setZip waits for the table when someone types a ZIP before it is here.
function undelta(str){var out=[],p=0,a=str.split(',');for(var i=0;i<a.length;i++){p+=parseInt(a[i],36);out.push(p)}return out}
var Z=null,NZ=0,ZP=null,ZIP0=__ZIP0__;
function zipsIn(j){if(j.v===2){j.z=undelta(j.z).map(function(n){return String(n).padStart(5,'0')}).join('');j.a=undelta(j.a);j.o=undelta(j.o);j.c=undelta(j.c)}Z=j;NZ=j.a.length;return j}
function loadZips(){if(ZP)return ZP;var tag=$('#zipdata');ZP=tag?Promise.resolve().then(function(){return zipsIn(JSON.parse(tag.textContent))}):fetch('zips.json').then(function(r){if(!r.ok)throw new Error('zips '+r.status);return r.json()}).then(zipsIn);ZP.then(null,function(){ZP=null});return ZP}
function afterLoad(f){function go(){(window.requestIdleCallback||function(c){setTimeout(c,200)})(f,{timeout:1000})}document.readyState==='complete'?go():window.addEventListener('load',go)}
function zipAt(i){return Z.z.substr(i*5,5)}
function findZip(z){if(!Z)return -1;var lo=0,hi=NZ-1;while(lo<=hi){var m=(lo+hi)>>1,v=zipAt(m);if(v===z)return m;if(v<z)lo=m+1;else hi=m-1}return -1}
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
// Provider logos (ports of logo_of, mono_of and logo_chip in launch_pages.py: change them together). A provider's logo (a white SVG in
// providers/, its width over height in ar) or, with none, a monogram; a wordmark stands in for the name, a mark sits beside it
var POTH=[];try{POTH=JSON.parse($('#provother').textContent)}catch(e){}
var MONO_SKIP=/^(the|of|and|co|inc|ltd|llc|corp|corporation|company|group|agency|administration|organisation|organization|space|aerospace|technology|technologies|science|sciences)$/i;
function monoOf(n){var w=String(n||'').replace(/\(.*?\)/g,' ').split(/[^A-Za-z0-9]+/).filter(Boolean);if(!w.length)return 'LP';if(/^[A-Z0-9]{2,4}$/.test(w[0]))return w[0];
  var k=w.filter(function(x){return !MONO_SKIP.test(x)});if(!k.length)k=w;if(k.length===1){var c=k[0].match(/[A-Z]/g)||[];return c.length>1?c.slice(0,3).join(''):k[0].slice(0,2).toUpperCase()}
  return k.slice(0,3).map(function(x){return x[0]}).join('').toUpperCase()}
function normN(n){return String(n||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function provLogo(L){var p=PROV[L.prov],n,s;if(p){n=p.n;s=p}else{n=(L.pv&&L.pv.n)||'Launch provider';s=POTH.filter(function(o){return (o.names||[]).map(normN).indexOf(normN(n))>=0})[0]||{}}
  return s.logo?{n:n,logo:s.logo,kind:s.logoKind||'mark',ar:s.ar||3,bc:s.brand||''}:{n:n,mono:s.mono||monoOf(n),bc:s.brand||''}}
// the logo chip, the anchor of every launch (ports: logo_chip in launch_pages.py): the logo sized by the same area rule at the slot's
// height h and no wider than w, but never under 10 px tall; a mark or a monogram carries the short name beside it inside the chip. --bc,
// the provider's brand color, tints the chip's edge and glow
var CHIP={row:[28,112],hero:[36,210],card:[30,150]};
function chipSize(ar,k){var c=CHIP[k],h=c[0],hh=Math.min(h,Math.sqrt(3.2/ar)*h),w=hh*ar;if(w>c[1]){hh=Math.max(10,c[1]/ar);w=hh*ar}return [Math.round(w),Math.round(hh)]}
function logoChip(g,k){var bc=g.bc?' style="--bc:'+g.bc+'"':'',inner;
  if(g.logo){var z=chipSize(g.ar,k);inner='<img class="plogo" src="'+esc(g.logo)+'" width="'+z[0]+'" height="'+z[1]+'"'+(k==='hero'?'':' loading="lazy" decoding="async"')+' alt="'+(g.kind==='word'?esc(g.n):'')+'">'+(g.kind==='word'?'':'<span class="lchip-n">'+esc(g.n)+'</span>')}
  else inner='<span class="pmono" aria-hidden="true">'+esc(g.mono)+'</span><span class="'+(g.mono.toUpperCase()===String(g.n).toUpperCase()?'sr':'lchip-n')+'">'+esc(g.n)+'</span>';
  return '<span class="lchip lchip-'+k+(g.logo&&g.kind==='word'?'':' lchip-m')+'"'+bc+'>'+inner+'</span>'}
var STATUS={go:['s-go','Go for launch','Go'],tbd:['s-tbd','Time to be confirmed','Time TBC'],hold:['s-hold','On hold','On hold'],flight:['s-go','Launched','Launched']};
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
// Up to two options: main is the launch's own webcast from the feed, else the provider's official live page; alt is that page as a second
// link when the launch has its own webcast and the page is a different address. The button says "Watch live" only from 15 minutes before
// liftoff (or when it is live), "Watch page" before that (liveOf), with the source as small text beside it.
function sameUrl(a,b){try{var x=new URL(a),y=new URL(b);return x.host.toLowerCase()===y.host.toLowerCase()&&x.pathname.replace(/\/+$/,'')===y.pathname.replace(/\/+$/,'')&&x.search===y.search}catch(e){return a===b}}
function watchOpts(L){var P=provOf(L),u=safeUrl(L.vid,null),g=safeUrl(P.live,null),a=u&&{url:u,src:L.vsrc||srcOf(u,P),own:true},b=g&&{url:g,src:P.liveSrc||srcOf(g,P),own:false,name:P.n};
  if(a&&b&&sameUrl(a.url,b.url))b=null;return a?{main:a,alt:b}:b?{main:b,alt:null}:null}
function watchOf(L){var o=watchOpts(L);return o&&o.main}
function wlabel(live){return live?'Watch live':'Watch page'}
function tx(e,t){if(e.textContent!==t)e.textContent=t}
// the second line of the hero: the official live page as a second link, or what the main button opens. Its markup is written by build.py too (hero_static).
function heroWatch(L){var o=watchOpts(L),hw=$('#heroWatch'),hs=$('#heroSrc');hw.hidden=!o;
  if(!o){tx(hs,'No official stream listed yet');delete hs.dataset.k;return}
  var t=wlabel(liveOf(L));hw.href=o.main.url;hw.removeAttribute('aria-label');tx($('#heroWatchT'),t);tx($('#heroWatchS'),o.main.src);
  var k=o.alt?o.alt.url+'|'+o.alt.name+'|'+o.alt.src:o.main.own?'w':'p';if(hs.dataset.k===k)return;hs.dataset.k=k;hs.textContent='';
  if(o.alt){var a=document.createElement('a');a.href=o.alt.url;a.target='_blank';a.rel='noopener';a.textContent=o.alt.name+' live page';a.setAttribute('aria-label',o.alt.name+' live page on '+o.alt.src+' (opens in a new tab)');
    hs.appendChild(document.createTextNode('Also '));hs.appendChild(a);hs.appendChild(document.createTextNode(' · '+o.alt.src))}
  else hs.textContent=o.main.own?'Webcast for this launch':'Provider live page'}
function infoUrl(L){return safeUrl(L.info,null)}
function goTxt(L){return L.go==null?'Pending':L.go+'% go'}
var LIVE={on:false,gen:null,src:'',stale:false,poll:0};
// a time zone the browser does not know would throw in every date format, so it falls back to UTC
function okTz(z){try{new Intl.DateTimeFormat('en-US',{timeZone:z});return z}catch(e){return 'UTC'}}
function fromFeed(f){if(!f||!f.pad||!ORB.PROF[f.v]||!isFinite(f.pad.lat)||!isFinite(f.pad.lon)||!isFinite(Date.parse(f.utc)))return null;ORB.SITES[f.site]={n:f.pad.n,full:f.pad.full,lat:f.pad.lat,lon:f.pad.lon,st:f.pad.st};return {id:f.id,prov:f.prov,pv:f.pv&&{n:String(f.pv.n||'Launch provider'),site:safeUrl(f.pv.site,null)},orbit:f.orbit,go:f.go,v:f.v,veh:f.veh,mis:f.mis,site:f.site,az:f.az,utc:f.utc,tz:okTz(f.tz||'UTC'),st:STATUS[f.st]?f.st:'tbd',vid:f.vid,vsrc:f.vsrc?String(f.vsrc):'',info:f.info,n:(f.n|0)>0?f.n|0:0,mt:typeof f.mt==='string'?f.mt.slice(0,40):'',desc:typeof f.desc==='string'?f.desc.slice(0,420):'',lu:typeof f.lu==='string'&&isFinite(Date.parse(f.lu))?f.lu:'',bst:f.bst&&typeof f.bst.sn==='string'?{sn:f.bst.sn.slice(0,16),fl:(f.bst.fl|0)>0?f.bst.fl|0:0}:null,_sig:JSON.stringify(f)}}
function setLaunches(list){S.cache={};LAUNCHES.length=0;list.forEach(function(L){LAUNCHES.push(L)});LAUNCHES.forEach(prep);S.cur=0;S.simT=-10}
var MAN={file:'Sample manifest. Live launch data loads when the site is online.',loading:'Loading launch data from Launch Library 2.',feed:'Live launch data could not be loaded, so this is a sample manifest. Reload the page to try again.',offline:'You are offline, so this is a sample manifest. Live launch data loads when you are back online.',empty:'The live feed lists no upcoming launches right now, so this is a sample manifest.'};
function setDataNote(){var t=$('#dataTag');document.documentElement.classList.toggle('ld-feed',!!LIVE.loading);if(LIVE.loading){t.textContent='Loading live data';t.className='dtag';$('#manNote').textContent=MAN.loading;return}if(LIVE.on){var m=Math.max(0,Math.round((Date.now()-Date.parse(LIVE.gen))/60000)),ago=agoTxt(LIVE.gen);var late=LIVE.stale||m>=(LIVE.src==='worker'?20:75);t.textContent=LIVE.off?'Offline, showing last update · '+ago:(late?'Data delayed':'Live data')+' · updated '+ago;t.className=late||LIVE.off?'dtag':'dtag live';$('#manNote').textContent='Launch data from Launch Library 2 by The Space Devs, '+(LIVE.src==='worker'?'checked every minute while this tab is open':'refreshed every 30 minutes')+'. Visibility is a modeled estimate from the launch pad, vehicle and a typical flight path.';$('#footNote').textContent='Live launch data · Visibility is a modeled estimate'}else{var e=LIVE.err==='offline'||(LIVE.err&&navigator.onLine===false)?'offline':LIVE.err||'file';t.textContent={offline:'Offline · sample data',feed:'Sample data · live feed unavailable',empty:'Sample data · no live launches listed',file:'Sample data'}[e];t.className='dtag';$('#manNote').textContent=MAN[e];$('#footNote').textContent='Sample data · Visibility is a modeled estimate'}}
// a feed file (launches.json, or the copy the build inlines) into the manifest; false when it holds no upcoming launch
function listFrom(j){var cut=Date.now()-30*60000;return ((j&&j.launches)||[]).map(function(f){try{return fromFeed(f)}catch(e){return null}}).filter(function(L){return L&&Date.parse(L.utc)>cut})}
function applyFeed(j,src){var list=listFrom(j);if(!list.length)return false;LIVE.on=true;LIVE.err=null;LIVE.gen=j.generated;LIVE.stale=!!j.stale;LIVE.src=src||'file';setLaunches(list);setRecent(recentFrom(j));return true}
// The deploy inlines the latest feed, so the page opens on live launches; the feed is fetched again right away in case the page itself
// was cached. Without an inlined feed the manifest shows placeholders meanwhile. The feed gets 10 seconds; on failure the sample
// manifest stays (or the inlined feed, quietly) and the note says why
function loadLive(){if(!/^https?:$/.test(location.protocol)||!window.fetch)return;var quiet=LIVE.on;
  function done(){LIVE.loading=false;setDataNote();refresh()}
  if(!quiet){LIVE.loading=true;setDataNote();renderRows()}
  LIVE.poll=Date.now();
  fetchFeed(10000).then(function(r){offline(r.off||navigator.onLine===false);if(quiet){mergeFeed(r.j,r.src);if(pickWanted())refresh();WANT=null;return}if(!applyFeed(r.j,r.src)){LIVE.err='empty';WANT=null;done();return}pickWanted();WANT=null;done();sizeSky()}).catch(function(){WANT=null;if(quiet){offline(navigator.onLine===false);return}LIVE.err=navigator.onLine===false?'offline':'feed';done()})}
// Offline with live data on show (the page or its last launches.json came from the service worker's saved copy, or the browser is offline):
// the data tag says so, and a toast says it once, so old data is never passed off as live
function offline(on){on=!!on;if(LIVE.off===on)return;LIVE.off=on;if(on&&LIVE.on&&!LIVE.offSaid){LIVE.offSaid=true;toast('You are offline. Showing the last update, '+agoTxt(LIVE.gen)+'.',5000)}if(!on)LIVE.offSaid=false;setDataNote()}

/* live feed. FEED_URL is the Cloudflare Worker (worker/README.md; data/config.json or the FEED_URL variable of the deploy sets it). While the tab
   is visible the page asks it every minute and falls back to launches.json, the copy the deploy refreshes every 30 minutes. A new copy is
   merged in place: launches that did not change keep their objects, only the rows that changed are rewritten, and status changes toast */
var FEED_URL=__FEEDURL__,POLL_MS=60000,LIVE_BEFORE=15*60000,LIVE_AFTER=30*60000;
function fetchJSON(url,ms,meta){var ac=window.AbortController?new AbortController():null,to=setTimeout(function(){if(ac)ac.abort()},ms);return fetch(url,ac?{signal:ac.signal}:{}).then(function(r){clearTimeout(to);if(!r.ok)throw 0;if(meta&&r.headers&&r.headers.get('X-Astro-Offline'))meta.off=true;return r.json()},function(e){clearTimeout(to);throw e})}
function fetchFeed(ms){
  // off: the service worker answered with its saved copy (sw.js), since the network failed
  var file=function(){var m={};return fetchJSON('launches.json?_='+Math.floor(Date.now()/60000),ms,m).then(function(j){return {j:j,src:'file',off:!!m.off}})};
  if(!FEED_URL)return file();
  return fetchJSON(FEED_URL,Math.min(ms,8000)).then(function(j){if(!j||!Array.isArray(j.launches)||!j.launches.length)throw 0;return {j:j,src:'worker'}}).then(function(w){
    // the Worker is serving its last good copy: the file from the deploy may be newer
    if(!w.j.stale)return w;return file().then(function(f){return Date.parse(f.j.generated)>Date.parse(w.j.generated)?f:w},function(){return w})},file)}
var pollBusy=false;
function poll(){if(pollBusy||LIVE.loading||document.hidden||!window.fetch||!/^https?:$/.test(location.protocol))return;pollBusy=true;LIVE.poll=Date.now();
  fetchFeed(10000).then(function(r){offline(r.off||navigator.onLine===false);mergeFeed(r.j,r.src)},function(){offline(navigator.onLine===false)}).then(function(){pollBusy=false;setDataNote()})}
function startPolling(){setInterval(poll,POLL_MS);setInterval(renderRecent,60000);document.addEventListener('visibilitychange',function(){if(!document.hidden&&Date.now()-LIVE.poll>=POLL_MS)poll()})}
// LIVE NOW: within 15 minutes of liftoff, or launched in the last 30 (the feed keeps a launch listed for 30 minutes after its time). A launch
// whose time is still to be confirmed is not live
function liveOf(L){if(L.st==='flight')return true;if(L.st==='tbd')return false;var dt=Date.parse(L.utc)-Date.now();return dt<=LIVE_BEFORE&&dt>=-LIVE_AFTER}
// the badge floats above the status row, so showing it moves nothing; after liftoff it says how long ago
function liveText(L){var dt=Date.parse(L.utc)-Date.now();if(dt>=0)return 'Live now';var m=Math.max(1,Math.round(-dt/60000));return 'Live now · launched '+m+' min ago'}
var LSIG='';function setLiveText(){var e=$('#heroLiveT'),t=liveText(L0());if(e.textContent!==t)e.textContent=t}
function applyLive(){var L=L0(),live=liveOf(L),b=$('#heroLive');if(b.hidden===live)b.hidden=!live;if(live)setLiveText();$('.hero-actions').classList.toggle('is-live',live);heroWatch(L);updateRemind()}
function liveTick(){if(!S.obs)return;var ids=[];LAUNCHES.forEach(function(L){if(liveOf(L))ids.push(L.id)});var sig=ids.join(',')+'|'+L0().id;if(liveOf(L0()))setLiveText();
  if(sig!==LSIG){LSIG=sig;applyLive();updateRemind();renderRows();renderWatch()}}
// recent launches (the last 7 days, with their result and a replay link where the feed has one)
var RECENT=[],RES={success:'Success',partial:'Partial failure',failure:'Failure'};
function fromRecent(r){try{if(!r||!RES[r.res]||!isFinite(Date.parse(r.utc))||!r.mis)return null;return {id:String(r.id),prov:r.prov,pv:r.pv&&{n:String(r.pv.n||'Launch provider'),site:safeUrl(r.pv.site,null)},veh:String(r.veh||''),mis:String(r.mis),utc:r.utc,pad:String((r.pad&&(r.pad.full||r.pad.n))||''),res:r.res,vid:safeUrl(r.vid,null),vsrc:r.vsrc?String(r.vsrc):'',info:safeUrl(r.info,null)}}catch(e){return null}}
function recentFrom(j){return ((j&&j.recent)||[]).map(fromRecent).filter(Boolean)}
function setRecent(list){RECENT=list;renderRecent()}
function agoTxt(utc){var m=Math.max(0,Math.round((Date.now()-Date.parse(utc))/60000));return m<60?m+' min ago':m<2880?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago'}
$('#provMore').addEventListener('click',function(){S.allProv=!S.allProv;renderWatch();if(!S.allProv)$('#providers').scrollIntoView({behavior:reduce?'auto':'smooth',block:'nearest'})});
function renderRecent(){var s=$('#recent');if(!s)return;var list=RECENT.filter(function(r){return Date.now()-Date.parse(r.utc)<7*86400000+3600000}).slice(0,12);
  if(!list.length){s.hidden=true;s._h='';return}
  var h=list.map(function(r){var P=PROV[r.prov]||r.pv||{n:'Launch provider'},ps=safeUrl(P.site,null),nm=ORB.fullName(r.mis,r.veh),ext='<svg class="ico" width="12" height="12" aria-hidden="true"><use href="#i-ext"/></svg>',
    rep=r.vid?'<a href="'+esc(r.vid)+'" target="_blank" rel="noopener" aria-label="Replay '+esc(nm)+' on '+esc(r.vsrc||srcOf(r.vid,P))+' (opens in a new tab)"><svg class="ico" width="12" height="12" aria-hidden="true"><use href="#i-play"/></svg>Replay</a>':'',
    inf=r.info?'<a href="'+esc(r.info)+'" target="_blank" rel="noopener" aria-label="Mission page for '+esc(nm)+' (opens in a new tab)">Mission page'+ext+'</a>':'';
    return '<li class="rc"><div class="rc-top">'+logoChip(provLogo(r),'card')+'<span class="rc-r"><span class="res res-'+r.res+'">'+RES[r.res]+'</span><span class="rc-when tnum">'+agoTxt(r.utc)+'</span></span></div><b class="rc-t">'+esc(ORB.title(r.mis,r.veh))+'</b><span class="rc-s">'+(ORB.undisclosed(r.mis)?'Payload not disclosed':esc(r.veh))+'</span><span class="rc-p">'+esc(r.pad)+'</span>'+(rep||inf?'<div class="rc-l">'+rep+inf+'</div>':'')+'</li>'}).join('');
  if(h!==s._h){s._h=h;$('#recentList').innerHTML=h}s.hidden=false;rcEdges()}
// the arrows over the Recent launches strip: shown when it overflows, each end's arrow off at that end; a press moves about a screen of cards
function rcEdges(){var l=$('#recentList'),s=$('#recent');if(!l||!s)return;var max=l.scrollWidth-l.clientWidth;s.classList.toggle('ovf',max>2);
  $$('.rc-arrow').forEach(function(b){b.disabled=+b.dataset.dir<0?l.scrollLeft<=2:l.scrollLeft>=max-2})}
(function(){var l=$('#recentList'),q=0;if(!l)return;l.addEventListener('scroll',function(){if(!q){q=1;requestAnimationFrame(function(){q=0;rcEdges()})}},{passive:true});addEventListener('resize',rcEdges);
  $$('.rc-arrow').forEach(function(b){b.addEventListener('click',function(){var c=l.querySelector('.rc'),w=c?c.getBoundingClientRect().width+14:280;l.scrollBy({left:+b.dataset.dir*Math.max(w,Math.floor((l.clientWidth-60)/w)*w),behavior:reduce?'auto':'smooth'})})})})();
// what changed between two copies of the feed, worth a toast: GO, HOLD, SCRUB or LAUNCHED. Launch Library has no scrub status, so a scrub is a
// go or hold launch within the next day that moves 15 minutes or more later, or goes back to a time to be confirmed
function relevant(L){return L.id===L0().id||!!S.rem[L.id]||Math.abs(Date.parse(L.utc)-Date.now())<24*3600000}
function diffEvents(oldList,newList,rec){var by={},rb={},ev=[];newList.forEach(function(L){by[L.id]=L});rec.forEach(function(r){rb[r.id]=r});
  oldList.forEach(function(o){var n=by[o.id],r=rb[o.id],ot=Date.parse(o.utc);
    if(!n){if(r&&relevant(o))ev.push({k:'launched',L:o,res:r.res});return}
    if(!relevant(n))return;if(n.st==='flight'&&o.st!=='flight'){ev.push({k:'launched',L:n});return}
    if((o.st==='go'||o.st==='hold')&&ot-Date.now()<24*3600000&&(Date.parse(n.utc)-ot>=15*60000||n.st==='tbd')){ev.push({k:'scrub',L:n});return}
    if(n.st==='hold'&&o.st!=='hold'){ev.push({k:'hold',L:n});return}
    if(n.st==='go'&&o.st!=='go'&&o.st!=='flight')ev.push({k:'go',L:n})});return ev}
function evText(e){var L=e.L,nm=ORB.fullName(L.mis,L.veh);return e.k==='go'?nm+' is go for launch':e.k==='hold'?nm+' is on hold':e.k==='scrub'?(L.st==='tbd'?nm+' stood down, new time to be confirmed':nm+' moved to '+fmtDay(L)+' · '+fmtTime(L)):nm+' has launched'+(e.res?' · '+RES[e.res].toLowerCase():'')}
// a copy of the feed into the page without a reload: launches that did not change keep their objects (and so their caches), the hero and the
// sky view are redrawn only if the launch on show changed, and the rows are patched one by one
function mergeFeed(j,src){if(!j||!Array.isArray(j.launches))return false;var list=listFrom(j);if(!list.length)return false;
  if(LIVE.gen&&j.generated&&Date.parse(j.generated)<Date.parse(LIVE.gen))return true;
  var rec=recentFrom(j),old={},evs=[],changed=list.length!==LAUNCHES.length,cur=L0(),curId=cur.id;
  LAUNCHES.forEach(function(L){old[L.id]=L});
  if(LIVE.on&&!LIVE.loading)evs=diffEvents(LAUNCHES,list,rec);
  var next=list.map(function(L,i){var o=old[L.id];if(o&&o._sig===L._sig){if(LAUNCHES[i]!==o)changed=true;return o}changed=true;return L});
  LIVE.on=true;LIVE.err=null;LIVE.gen=j.generated;LIVE.stale=!!j.stale;LIVE.src=src;
  if(changed){LAUNCHES.length=0;next.forEach(function(L){if(old[L.id]!==L)prep(L);LAUNCHES.push(L)});S.cache={};
    var k=0;LAUNCHES.forEach(function(L,i){if(L.id===curId)k=i});var gone=LAUNCHES[k].id!==curId;S.cur=k;if(gone)S.simT=-10;
    if(gone||LAUNCHES[k]!==cur)refresh();else{renderRows();renderWatch();renderShare()}}
  setRecent(rec);setDataNote();
  // the most telling first, three at most
  var PRI={launched:0,scrub:1,hold:2,go:3};evs.sort(function(a,b){return PRI[a.k]-PRI[b.k]});
  evs.slice(0,3).forEach(function(e){toastEv(e.k,evText(e))});if(evs.length>3)toastEv('more',(evs.length-3)+' more launch '+(evs.length===4?'update':'updates')+' in the list');
  return true}
// status toasts wait their turn, so a burst of changes is read one at a time
var TQ=[],tBusy=false,TQT=0;
function toastEv(kind,msg){TQ.push([kind,msg]);if(!tBusy)nextToast()}
function nextToast(){var q=TQ.shift();if(!q){tBusy=false;return}tBusy=true;var t=$('#toast');t.innerHTML='<b class="tk tk-'+q[0]+'">'+(q[0]==='more'?'Updates':q[0])+'</b> '+esc(q[1]);t.classList.add('show');clearTimeout(t._h);clearTimeout(TQT);TQT=setTimeout(function(){t.classList.remove('show');TQT=setTimeout(nextToast,500)},5200)}
var DTF={};function dtf(k,tz,o){var key=k+(tz||'');return DTF[key]||(DTF[key]=new Intl.DateTimeFormat('en-US',Object.assign({timeZone:tz},o)))}
function fmtDay(L){return dtf('d',L.tz,{weekday:'short',month:'short',day:'numeric'}).format(new Date(L.utc))}
function fmtTime(L){return dtf('t',L.tz,{hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(L.utc))}
var S={cur:0,obs:null,rem:store.get('radar.rem')||{},simT:-10,playing:!reduce,cache:{}};
// the demo login and posts of earlier versions left these in the browser; this site has no accounts any more
['radar.user','radar.posts','radar.likes'].forEach(function(k){store.del(k)});
function L0(){return LAUNCHES[S.cur]}
function vis(L,o){o=o||S.obs;var k=L.id+'|'+o.zip;if(!S.cache[k])S.cache[k]=ORB.visibility(L,L.trk,o.lat,o.lon);return S.cache[k]}
var DIRW={N:'north',NNE:'north northeast',NE:'northeast',ENE:'east northeast',E:'east',ESE:'east southeast',SE:'southeast',SSE:'south southeast',S:'south',SSW:'south southwest',SW:'southwest',WSW:'west southwest',W:'west',WNW:'west northwest',NW:'northwest',NNW:'north northwest'};
function bearingTo(o,lat,lon){return ORB.look(o.lat,o.lon,lat,lon,0).az}
function elWord(e){return e>=30?'high in the sky':e>=18?'well above the horizon':e>=10?'fairly low above the horizon':'low above the horizon'}

/* hero */
function renderHero(){swapHero();var L=L0(),lg=logoChip(provLogo(L),'hero'),he=$('#heroLogo');if(he._h!==lg){he._h=lg;if(he.innerHTML!==lg)he.innerHTML=lg}var hd=ORB.title(L.mis,L.veh);$('#heroTitle').textContent=hd;$('#heroTitle').style.setProperty('--n',hd.length);$('#heroKicker').textContent=S.cur===0?'Next launch':'Selected launch';var st=STATUS[L.st],hs=$('#heroStatus');hs.className='status '+st[0];hs.textContent=st[1];
  var P0=provOf(L);heroWatch(L);var inf=infoUrl(L)||safeUrl(P0.site,null),hsb=$('#heroSite');hsb.hidden=!inf;if(inf){hsb.href=inf;hsb.firstChild.textContent=infoUrl(L)?'Mission page':P0.n+' site'}tx($('#hfWhen'),fmtDay(L)+' · '+fmtTime(L));$('#hfZip').textContent=S.obs.zip;$('#hfVis').textContent=rateOf(L).row;$('#ncName').textContent=hd;
  $('#heroSub').innerHTML=(ORB.undisclosed(L.mis)?'<span class="nd">Payload not disclosed</span>':'<span>'+esc(L.veh)+'</span>')+'<span>'+esc(L.siteObj.full)+'</span>';updateRemind();applyLive()}
/* motion helpers */
// countdown digits: each digit that changes slides up and out while the new one slides in; the seconds give a soft pulse
// the countdown's digits change in place (no roll: the hero is calm)
function setDigit(sel,val){var e=$(sel);if(e._v===val)return;e._v=val;e.textContent=val}
var lastCur=null;
// switching launches: the old hero frame fades out over the new one while the headline and details blur in
function swapHero(){if(!reduce&&lastCur!==null&&lastCur!==S.cur){['.hero-top','#heroTitle','.hero-sub','.count','.hero-facts','#p-sky .verdict','#p-sky .facts','.wxrow'].forEach(function(s){var e=$(s);if(e){e.classList.remove('swap');void e.offsetWidth;e.classList.add('swap')}})}lastCur=S.cur}
// the countdown; once a launch is live (liveOf) it counts the time since liftoff instead of resting on zeros, and says so to a screen reader
function tick(){var raw=Math.round((new Date(L0().utc).getTime()-Date.now())/1000),up=raw<0&&liveOf(L0()),s=up?-raw:Math.max(0,raw),ce=$('.count');if(ce&&ce._up!==up){ce._up=up;ce.classList.toggle('up',up);ce.setAttribute('aria-label',up?'Time since liftoff':'Countdown to launch')}setDigit('#cD',pad2(Math.min(99,Math.floor(s/86400))));setDigit('#cH',pad2(Math.floor(s%86400/3600)));setDigit('#cM',pad2(Math.floor(s%3600/60)));setDigit('#cS',pad2(s%60));var nt=raw>0?pad2(Math.min(99,Math.floor(s/86400)))+'d '+pad2(Math.floor(s%86400/3600))+':'+pad2(Math.floor(s%3600/60))+':'+pad2(s%60):liveOf(L0())?'Live now':'Launched',nc=$('#ncTime');if(nc.textContent!==nt)nc.textContent=nt;liveTick()}
setInterval(tick,1000);

// phones and other low power devices
var LOWP=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches)||(navigator.hardwareConcurrency||8)<=4;
// slow one time work runs in slices between frames, so it never blocks the page
var JOBS=[];function runJobs(ms){var t0=performance.now();while(JOBS.length&&performance.now()-t0<ms){if(JOBS[0]())JOBS.shift()}}
// quality tiers. The hero draws nothing (its planet is one NASA photograph, assets/earth/), so a tier only sets how the page's starfield
// and the Your sky view are drawn: high (desktops), medium (every touch device, iOS from the start, computers with four cores or fewer) and
// low. cap is the most canvas pixels per CSS pixel, fps a frame rate cap (0: every frame). The tier only ever steps down, once the browser
// stays under 40 frames a second for 3 seconds. ?q=high, ?q=medium or ?q=low forces a tier for testing; ?fps shows the diagnostics
var QP=new URLSearchParams(location.search),IOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
var TIERS={high:{cap:2},medium:{cap:1.25},low:{cap:1,fps:24}};
var QF=TIERS[QP.get('q')]?QP.get('q'):null,QWHY=QF?'forced':'auto';
var QT=QF||((navigator.deviceMemory||8)<=2||(navigator.hardwareConcurrency||8)<=2||(IOS&&Math.min(screen.width,screen.height)<375)?'low':IOS||LOWP?'medium':'high'),LITE=QT!=='high';
document.documentElement.classList.add('vid');
// frame watch: the browser's own frame rate (every animation frame, drawn or skipped) in half second windows, the time our drawing takes,
// and the step down
var FW={t0:0,n:0,slow:0,cool:0,fps:0,ft:0,dfps:0,wk:0,work:0,wn:0,drawn:0},DIAG=QP.has('fps')?document.createElement('div'):null;
function frameWatch(now){if(!FW.t0){FW.t0=now;FW.n=0;FW.drawn=0;FW.work=0;FW.wn=0;return}FW.n++;var el=now-FW.t0;if(el<500)return;
  FW.fps=FW.n*1000/el;FW.ft=el/FW.n;FW.dfps=FW.drawn*1000/el;FW.wk=FW.wn?FW.work/FW.wn:0;FW.t0=now;FW.n=FW.drawn=FW.work=FW.wn=0;if(DIAG)showDiag();
  if(QF||now<FW.cool){FW.slow=0;return}
  if(FW.fps<40){FW.slow+=el;if(FW.slow>=3000){FW.slow=0;stepDown()}}else FW.slow=0}
function stepDown(){if(QT==='low')return;QT=QT==='high'?'medium':'low';QWHY='stepped down';LITE=true;setFmin();FW.cool=performance.now()+2000}
function heroDiag(){return {tier:QT,why:QWHY,fps:+FW.fps.toFixed(1),drawn:+FW.dfps.toFixed(1),frameMs:+FW.ft.toFixed(1),workMs:+FW.wk.toFixed(2),dpr:window.devicePixelRatio||1,film:((document.querySelector('#heroPst img')||{}).currentSrc||'').split('/').pop()}}
// (?fps only) the frame rate while the page scrolls: frames counted from the first scroll event until 300 ms after the last
var SF2={on:0,n:0,t0:0,fps:0};function scrollFps(){if(SF2.on)return;SF2.on=1;SF2.n=0;SF2.t0=performance.now();(function f(t){SF2.n++;if(t-SCR<300)requestAnimationFrame(f);else{SF2.on=0;var el=t-SF2.t0-300;if(el>200){SF2.fps=SF2.n*1000/(t-SF2.t0);showDiag()}}})(SF2.t0)}
function showDiag(){var d=heroDiag();DIAG.textContent=(SF2.fps?'scroll '+SF2.fps.toFixed(0)+' fps   ':'')+'FPS '+d.fps.toFixed(0)+'   drawn '+d.drawn.toFixed(0)+' a second\nframe '+d.frameMs+' ms   work '+d.workMs.toFixed(1)+' ms\ndevice pixel ratio '+d.dpr+'\ntier '+d.tier+' ('+d.why+')\nphoto '+d.film}
if(DIAG){DIAG.className='fps-diag';DIAG.setAttribute('aria-hidden','true');document.body.appendChild(DIAG);window.__heroDiag=heroDiag}
// the hero's height, for the page background (--hero-h: the page color reaches exactly the hero's foot)
function sizeHero(){var hs=$('.hero');if(hs)document.documentElement.style.setProperty('--hero-h',hs.offsetHeight+'px')}
// canvas fonts are set only when they change (setting one is slow)
function font(g,f){if(g._f!==f){g._f=f;g.font=f}}
/* ===== where to look: the rating, in plain words ===== */
// The model (ORB.visibility in src/model.js) says what the geometry, the sun and the distance allow. The NWS sky cover forecast at the visitor's ZIP,
// at launch time, can only lower it: 25% or more caps the rating at Great, 50% at Good, 75% at Low view, 90% means it will probably be hidden.
// Without a live forecast (sample numbers, offline, or too far ahead) clouds are not counted, and the page says so.
function cloudCap(c){return c>=90?0:c>=75?1:c>=50?2:c>=25?3:4}
// Every distance the page shows comes from here (and launch_pages.py's mi uses the same rule): whole miles (km x 0.621371, rounded half up)
// and whole kilometres, with thousands separators. distTxt is the long form, "7,931 mi (12,763 km)"; miTxt the short one.
var KM_MI=.621371;
function grp(n){return String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',')}
function miTxt(km){return grp(Math.round(km*KM_MI))+' mi'}
function kmTxt(km){return grp(Math.round(km))+' km'}
function distTxt(km){return miTxt(km)+' ('+kmTxt(km)+')'}
function padKmOf(L,o){return ORB.dist(o.lat,o.lon,L.siteObj.lat,L.siteObj.lon)}
function rateOf(L,o){o=o||S.obs;var v=vis(L,o),w=wxLive(L,o),c=w?w.clouds:null,s=v.score,cut=false;
  if(w&&v.best){var k=cloudCap(c);if(k<s){s=k;cut=true}}
  var day=!!(v.best&&v.best.sky==='day'),big=s===4?'Excellent view':s===3?'Great view':s===2?'Good view':s===1?'Low view':v.best?'Cloud likely hides it':'Not visible',
    row=s===4?'Excellent':s===3?'Great':s===2?'Good':s===1?'Low view':v.best?'Hidden by cloud':'Not visible';
  if(day&&s>=1){big=s>=2?'Daytime view':'Daytime, hard to spot';row=s>=2?'Daytime':'Daytime, hard to spot'}
  return {v:v,w:w,clouds:c,score:s,cut:cut,big:big,row:row}}
// the sentence under the rating and the list "Why this rating": the real reasons, from the sun, the distance, the direction and the weather
function ratingText(L,o,r){var v=r.v,b=v.best,az=b?b.az:bearingTo(o,L.siteObj.lat,L.siteObj.lon),dw=DIRW[ORB.dir16(az)],padKm=padKmOf(L,o),sky=b?b.sky:ORB.skyOf(v.sunObs),sub,why=[];
  if(!b)sub=v.why==='far'?'It is too far away to see from '+o.short+'. Watch the stream.':'It stays below the horizon from '+o.short+'. Watch the stream.';
  else if(r.score===0)sub='Forecast cloud cover of '+r.clouds+'% means you will probably not see it. Watch the stream.';
  else{sub=(sky==='day'?'It is daylight. Look '+dw+' for the exhaust trail':'Look '+dw+', '+elWord(b.el))+', from T+'+fmtTs(v.first)+'.';
    if(r.cut)sub+=' Cloud ('+r.clouds+'%) lowers the odds.';else if(r.score<=1)sub+=' It will be faint or low.'}
  // sun
  var su;
  if(!b)su=sky==='day'?'It is daylight at launch time, so there is no glow to see, only a faint trail.':sky==='twilight'?'It is twilight at launch time.':'Your sky is dark at launch time.';
  else if(b.reg==='day')su='It is daylight where you are, so only a white exhaust trail shows, and that is much harder to see than a glow.';
  else if(b.reg==='lit')su=b.sky==='twilight'?'The sun has just set where you are, but the rocket climbs high enough to stay in sunlight (above Earth\'s shadow). Sunlit exhaust can glow against the darkening sky.':'Your sky is dark, but the rocket climbs high enough to reach sunlight (above Earth\'s shadow), so its exhaust can glow.';
  else su=b.sky==='twilight'?'It is twilight and the rocket stays in Earth\'s shadow, so only the engine flame shows.':'Your sky is dark and the rocket stays in Earth\'s shadow, so you would see only the engine flame, which fades quickly with distance.';
  why.push(['Sun',su]);
  // distance
  var di='The pad is '+distTxt(padKm)+' from you. ';
  if(b)di+='At its best the rocket is about '+distTxt(b.range)+' away, and a rocket like this is rarely seen from farther than about '+distTxt(b.cap)+' in these conditions.';
  else if(v.why==='far')di+='It rises above your horizon, but at its closest it is still about '+distTxt(v.nearest)+' away, farther than we think it can be seen in these conditions.';
  else di+='That is too far for it to climb above your horizon, because Earth curves away.';
  why.push(['Distance',di]);
  // direction
  var dr;
  if(b){var s1=v.firstS,toward=v.samples.filter(function(x){return x.vis}).slice(-1)[0].range<s1.range;
    dr='Look '+dw+' ('+Math.round(az)+'°). It peaks about '+Math.round(b.el)+'° above your horizon, from T+'+fmtTs(v.first)+' to T+'+fmtTs(v.last)+'. The rocket heads '+DIRW[ORB.dir16(L.az)]+', '+(toward?'toward':'away from')+' you.'+(b.el<10?' It stays low, so trees, buildings and haze can hide it.':'')}
  else dr=v.why==='far'?'Look '+dw+'. The rocket never gets close enough to see.':'The pad is '+dw+' of you, but the rocket never clears your horizon.';
  why.push(['Direction',dr]);
  // weather
  var nr=NWS[o.zip],we;
  if(r.w)we='The NWS forecasts about '+r.clouds+'% sky cover ('+r.w.cond.toLowerCase()+') at your ZIP at launch time. '+(r.cut?'That lowers the rating.':r.clouds>=25?'Some cloud could get in the way.':'Cloud should not be a problem.');
  else if(nr&&nr.ok)we='No NWS cloud forecast reaches that far ahead yet, so clouds are not counted. Check again closer to launch.';
  else if(nr&&nr.err)we='We could not get a cloud forecast, so clouds are not counted.';
  else we='The NWS cloud forecast is loading. Until it arrives, clouds are not counted.';
  why.push(['Weather',we]);
  // what holds the rating down besides cloud
  if(b){var hd=v.capBy==='short'?'It is in view for only about '+v.visSec+' seconds, which holds the rating down.':v.capBy==='day'?'In daylight a trail is much harder to see than a glow, which holds the rating down.':v.capBy==='distance'?'The distance holds the rating down: from far away you see only a faint glow.':v.capBy==='low'?'It stays low in your sky, which holds the rating down.':'';
    if(hd)why.push(['Held down by',hd])}
  why.push(['Timing','Launch times often move, and the sun angle changes the picture within minutes. Check again near launch.']);
  return {sub:sub,why:why}}
function renderRating(){var L=L0(),o=S.obs,r=rateOf(L,o),t=ratingText(L,o,r);setTxt('#vcBig',r.big);setTxt('#vcSub',t.sub);
  var ul=$('#whyList'),h=t.why.map(function(x){return '<li><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></li>'}).join('');if(ul._h!==h){ul._h=h;ul.innerHTML=h}
  $('#hfVis').textContent=r.row}
// "How we estimate this": its distances come from the model's limits (RANGE) and the rating tiers, through the same rule
$$('[data-km]').forEach(function(e){var k=e.getAttribute('data-km'),km=ORB.RANGE[k]!=null?ORB.RANGE[k]:+k;if(km>0)e.textContent=distTxt(km)});
// Why this rating and How we estimate this open and close smoothly: the content slides and fades (transform and opacity only), then closes
$$('.sky-more details').forEach(function(d){var c=d.querySelector('summary').nextElementSibling;d.querySelector('summary').addEventListener('click',function(e){if(reduce||!c.animate)return;e.preventDefault();if(d._a)d._a.cancel();
  if(!d.open){d.open=true;d._a=c.animate([{opacity:0,transform:'translateY(-8px)'},{opacity:1,transform:'none'}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'})}
  else{var a=d._a=c.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-6px)'}],{duration:180,easing:'ease-in',fill:'forwards'});a.onfinish=function(){d.open=false;a.cancel();if(d._a===a)d._a=null}}})});
$('#skyDet').addEventListener('toggle',function(){if(this.open){sizeSky();kick()}});
$('#howLink').addEventListener('click',function(e){e.preventDefault();$('#skyDet').open=true;var d=$('#howEst');d.open=true;d.scrollIntoView({behavior:reduce?'auto':'smooth',block:'nearest'})});

/* view card */
function setTxt(sel,v){$(sel).textContent=v}
function renderView(){var L=L0(),o=S.obs,v=vis(L);setTxt('#vcLoc',o.city+' '+o.zip);
  var az=v.best?v.best.az:bearingTo(o,L.siteObj.lat,L.siteObj.lon),dw=DIRW[ORB.dir16(az)];renderRating();
  // the sky view only when the rocket rises into view: otherwise it is hidden (so it is not drawn) and the short card stands in its place
  var seen=!!v.best;$('.view').classList.toggle('nv',!seen);$('#skyWrap').hidden=!seen;$('#nvCard').hidden=seen;if(!seen)renderNv(L,o,v,az);
  if(!WHYU)$('#whyBox').open=seen&&innerWidth>=900;
  
  setTxt('#vcDir',ORB.dir16(az)+' '+Math.round(az)+'°');setTxt('#vcPeak',v.best?Math.round(v.best.el)+'°':'Below horizon');setTxt('#vcWin',v.best?'T+'+fmtTs(v.first)+' to '+fmtTs(v.last):'Not in view');var pk=padKmOf(L,o);setTxt('#vcDist',miTxt(pk));setTxt('#vcDistKm',kmTxt(pk));
  aimNeedle(az);$('#cpDeg').textContent=String(Math.round(az)).padStart(3,'0')+'°';$('#cpDir').textContent=ORB.dir16(az);var wd='';if(v.best&&v.firstS){var a1=v.firstS.az,a2=v.samples[Math.min(v.samples.length-1,Math.round(v.last/2))].az,dd=wrap180(a2-a1);if(Math.abs(dd)<6){a1-=3;dd=6*(dd<0?-1:1)}var R1=96,R2=106,Pp=function(a,r){var q=(a-90)*Math.PI/180;return (120+r*Math.cos(q)).toFixed(1)+' '+(120+r*Math.sin(q)).toFixed(1)},sw=dd>0?1:0,lg=Math.abs(dd)>180?1:0;wd='M'+Pp(a1,R2)+' A'+R2+' '+R2+' 0 '+lg+' '+sw+' '+Pp(a1+dd,R2)+' L'+Pp(a1+dd,R1)+' A'+R1+' '+R1+' 0 '+lg+' '+(1-sw)+' '+Pp(a1,R1)+' Z'}$('#vcWedge').setAttribute('d',wd);setTxt('#skyFace',ORB.dir16(az));SV={};sizeSky()}

// "Not visible from here": the distance and direction, and the two reasons that decide it (the full list stays in Why this rating)
var WHYU=false;$('#whyBox summary').addEventListener('click',function(){WHYU=true});
function renderNv(L,o,v,az){var pk=padKmOf(L,o),t=ratingText(L,o,rateOf(L,o)),w=watchOf(L),a=$('#nvWatch');
  setTxt('#nvT',v.why==='far'?'Too far to see':'Below your horizon');setTxt('#nvDist',miTxt(pk));setTxt('#nvDistKm',kmTxt(pk));setTxt('#nvDir',ORB.dir16(az)+' '+Math.round(az)+'°');
  var h=t.why.filter(function(x){return x[0]==='Distance'||x[0]==='Direction'}).map(function(x){return '<li><b>'+esc(x[0])+'.</b> '+esc(x[1])+'</li>'}).join('');if($('#nvWhy')._h!==h){$('#nvWhy')._h=h;$('#nvWhy').innerHTML=h}
  a.hidden=!w;if(w){a.href=w.url;a.textContent='Watch the stream · '+w.src}}

/* sky sim */
var sc=$('#skyc'),sx=sc.getContext('2d'),SW=0,SH=0,SD=1,SV={},sstars=[];
function sizeSky(){var r=sc.getBoundingClientRect();if(!r.width)return;RPW=RPT.clientWidth;RPF0=-1;SW=r.width;SH=r.height;SD=Math.min(2,window.devicePixelRatio||1);sc.width=Math.round(SW*SD);sc.height=Math.round(SH*SD);sx.setTransform(SD,0,0,SD,0,0);sstars=[];for(var i=0;i<140;i++)sstars.push({a:Math.random()*360,e:Math.pow(Math.random(),.9)*80,r:.4+Math.random()*.8,b:Math.random()});
  var L=L0(),v=vis(L),o=S.obs,hy=SH-(SW<600?64:72),top=50,avail=hy-top;var pts=v.samples.filter(function(s){return s.vis});
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
  var smp=v.samples,pts=[];for(var j=0;j<smp.length;j++){var q=smp[j];pts.push(q.vis?skyXY(q.az,q.el):null)}
  // the predicted path, drawn in over a second and a half when the card first shows (and after a change of launch or ZIP)
  var nv=0,ak=reduce?1:arcT0?clamp((performance.now()-arcT0)/1500,0,1):0;ak=1-Math.pow(1-ak,3);for(j=0;j<pts.length;j++)if(pts[j])nv++;var lim=Math.ceil(nv*ak),dn=0;
  sx.save();sx.setLineDash([3,7]);sx.strokeStyle='rgba(255,255,255,.28)';sx.lineWidth=1;sx.beginPath();var pen=false;for(j=0;j<pts.length&&dn<lim;j++){if(pts[j]){dn++;if(!pen){sx.moveTo(pts[j][0],pts[j][1]);pen=true}else sx.lineTo(pts[j][0],pts[j][1])}else pen=false}sx.stroke();sx.restore();
  var ci=Math.min(pts.length-1,Math.floor(Math.max(0,S.simT)/2)),cur=sampleAt(L,v,S.simT);
  if(S.simT>0){sx.save();sx.lineCap='round';for(j=1;j<=ci;j++){var a=pts[j-1],b=pts[j];if(!a||!b)continue;var al=Math.max(.08,1-(S.simT-j*2)/240);sx.strokeStyle='rgba(255,'+Math.round(190+50*j/Math.max(1,ci))+','+Math.round(130+100*j/Math.max(1,ci))+','+al*.9+')';sx.lineWidth=1.8;sx.beginPath();sx.moveTo(a[0],a[1]);sx.lineTo(b[0],b[1]);sx.stroke()}sx.restore()}
  // ground
  sx.fillStyle='#000';sx.fillRect(0,hy,SW,SH-hy);sx.strokeStyle='rgba(255,255,255,.35)';sx.beginPath();sx.moveTo(0,hy+.5);sx.lineTo(SW,hy+.5);sx.stroke();
  sx.font='600 10px Barlow, sans-serif';sx.textAlign='center';var card={0:'N',45:'NE',90:'E',135:'SE',180:'S',225:'SW',270:'W',315:'NW'},half=SW/2/SV.k;for(var az=Math.ceil((SV.vc-half)/5)*5;az<=SV.vc+half;az+=5){var xx=SW/2+(az-SV.vc)*SV.k,an=((az%360)+360)%360,big=an%15===0;sx.strokeStyle='rgba(255,255,255,'+(big?.45:.18)+')';sx.beginPath();sx.moveTo(xx,hy+3);sx.lineTo(xx,hy+(big?10:6));sx.stroke();if(card[an]!==undefined){sx.fillStyle='#fff';sx.fillText(card[an],xx,hy+24)}}
  var pdx=SW/2+wrap180(SV.padAz-SV.vc)*SV.k;if(pdx>0&&pdx<SW){sx.fillStyle='#B9A8FF';sx.beginPath();sx.moveTo(pdx,hy+30);sx.lineTo(pdx-4,hy+37);sx.lineTo(pdx+4,hy+37);sx.fill()}sx.textAlign='left';
  var visible=S.simT>0&&S.simT<L.end&&cur.vis;
  if(visible){var rp=skyXY(cur.az,cur.el),fk=reduce?1:.85+Math.random()*.3;sx.save();sx.globalCompositeOperation='lighter';var hg=sx.createRadialGradient(rp[0],rp[1],0,rp[0],rp[1],24*fk);hg.addColorStop(0,'rgba(255,250,240,1)');hg.addColorStop(.2,'rgba(255,225,170,.8)');hg.addColorStop(1,'rgba(255,140,60,0)');sx.fillStyle=hg;sx.beginPath();sx.arc(rp[0],rp[1],24*fk,0,6.283);sx.fill();sx.restore();
    sx.font='500 11px Barlow, sans-serif';var tx=L.veh.toUpperCase()+'  '+fmtT(S.simT)+'   ALT '+Math.round(ORB.interp(ORB.PROF[L.v],S.simT)[0])+' KM   EL '+cur.el.toFixed(0)+'°',tw=sx.measureText(tx).width+16,bx=clamp(rp[0]+18,8,SW-tw-8),by=rp[1]-34;if(by<8)by=rp[1]+20;sx.fillStyle='rgba(0,0,0,.6)';sx.fillRect(bx,by,tw,22);sx.fillStyle='#fff';sx.fillText(tx,bx+8,by+15)}
  else if(SV.ok&&S.simT<v.first){var f0=v.firstS,fp=skyXY(f0.az,Math.max(0,f0.el)),pul=reduce?1:.5+.5*Math.sin(T*3);sx.strokeStyle='rgba(185,168,255,'+(.35+.5*pul)+')';sx.lineWidth=1.2;sx.beginPath();sx.arc(fp[0],fp[1],8+6*pul,0,6.283);sx.stroke();sx.font='500 11px Barlow, sans-serif';sx.fillStyle='#fff';var lb='RISES HERE AT T+'+fmtTs(v.first),lw=sx.measureText(lb).width;sx.fillText(lb,clamp(fp[0]-lw/2,8,SW-lw-8),fp[1]-22)}
  if(!SV.ok){sx.font='600 22px "Barlow Condensed", sans-serif';sx.textAlign='center';sx.fillStyle='rgba(255,255,255,.9)';sx.fillText(v.why==='far'?'TOO FAR TO SEE':'BELOW YOUR HORIZON',SW/2,hy-60);sx.font='400 13px Barlow, sans-serif';sx.fillStyle='rgba(255,255,255,.6)';sx.fillText(v.why==='far'?'This launch is too far away to see from '+o.city+'.':'This launch never clears the horizon from '+o.city+'.',SW/2,hy-38);sx.textAlign='left'}
  var sp2=[-10,L.end+8],f=clamp((S.simT-sp2[0])/(sp2[1]-sp2[0]),0,1);if(Math.abs(f-RPF0)>.0005){RPF0=f;RPF.style.transform='scaleX('+f.toFixed(4)+')';RPH.style.transform='translateX('+(f*RPW).toFixed(1)+'px)'}
  var vt=fmtT(S.simT);if(vt!==lastVt){lastVt=vt;RPC.textContent=vt;RPT.setAttribute('aria-valuenow',Math.round(f*100));RPT.setAttribute('aria-valuetext',vt)}}
var lastVt='',SKG={},RPF=$('#rpFill'),RPH=$('#rpHead'),RPC=$('#rpClock'),RPT=$('#rpTrack'),RPW=0,RPF0=-1;
var playI='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',pauseI='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
function setPlaying(p){S.playing=p;$('#rpPlay').innerHTML=p?pauseI:playI;$('#rpPlay').setAttribute('aria-label',p?'Pause':'Play')}
$('#rpPlay').addEventListener('click',function(){setPlaying(!S.playing)});
(function(){var tr=$('#rpTrack'),drag=false;function setFrom(e){var r=tr.getBoundingClientRect(),f=clamp((e.clientX-r.left)/r.width,0,1);S.simT=-10+f*(L0().end+18)}tr.addEventListener('pointerdown',function(e){drag=true;tr.setPointerCapture(e.pointerId);setFrom(e)});tr.addEventListener('pointermove',function(e){if(drag)setFrom(e)});tr.addEventListener('pointerup',function(){drag=false});tr.addEventListener('keydown',function(e){if(e.key==='ArrowRight'){S.simT+=10;e.preventDefault()}if(e.key==='ArrowLeft'){S.simT-=10;e.preventDefault()}if(e.key===' '){setPlaying(!S.playing);e.preventDefault()}})})();

/* manifest */
var bellSvg='<svg class="ico" width="20" height="20" aria-hidden="true"><use href="#i-bell"/></svg>';
function watchBtn(L,live){var w=watchOf(L),t=wlabel(live);return w?'<a class="btn btn-sm btn-watch'+(live?' btn-solid':'')+'" href="'+esc(w.url)+'" target="_blank" rel="noopener" aria-label="'+t+': '+esc(ORB.fullName(L.mis,L.veh))+' on '+esc(w.src)+' (opens in a new tab)"><span class="w-main"><svg class="ico" width="14" height="14" aria-hidden="true"><use href="#i-play"/></svg>'+t+'</span><small class="w-src">'+esc(w.src)+'</small></a>':'<span class="btn btn-sm btn-off" aria-disabled="true">No stream</span>'}
// under a row: the provider's official live page as the second option, or that no stream is listed
function altLink(L){var o=watchOpts(L);if(!o)return '<span class="r-src">No official stream listed yet</span>';return o.alt?'<a href="'+esc(o.alt.url)+'" target="_blank" rel="noopener" aria-label="'+esc(o.alt.name+' live page on '+o.alt.src)+' (opens in a new tab)">'+esc(o.alt.name)+' live page</a>':''}
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
// while the live feed loads, placeholder rows and chips stand in for the sample manifest
var SKROW='<div class="row skel" aria-hidden="true"><div><i class="sk" style="width:70%"></i><i class="sk" style="width:45%"></i></div><div><i class="sk" style="width:30%"></i><i class="sk sk-t" style="width:55%"></i><i class="sk" style="width:40%"></i></div><div class="r-pad"><i class="sk" style="width:85%"></i><i class="sk" style="width:50%"></i></div><div class="r-vis"><i class="sk sk-t" style="width:60%"></i></div><div class="r-st"><i class="sk" style="width:70%"></i></div><div class="r-acts"><i class="sk sk-b"></i></div></div>';
// the flight tag: the provider's launch count with this one (#162 is its 162nd launch), only when the feed has it
function flightTag(L,P){return L.n?' <span class="r-tag" title="'+esc((P&&P.n||'The provider')+"'s launch number "+L.n)+'"><span class="sr">'+esc((P&&P.n||'Provider')+' launch number')+' </span>#'+L.n+'</span>':''}
// Nerd mode's line: the vehicle, the booster and its flight, the pad, the orbit and the mission type, from what the feed has
function ordinal(n){var s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0])}
function nerdLine(L){var b=L.bst?'Booster '+L.bst.sn+(L.bst.fl?', '+ordinal(L.bst.fl)+' flight':''):'';return [L.veh,b,L.siteObj&&L.siteObj.n,L.orbit,L.mt].filter(function(x){return x&&x!=='To be announced'}).join(' \u00b7 ')}
// Nerd mode: off by default; kept in this browser (radar.nerd) when turned on
var NERD=!!store.get('radar.nerd');document.documentElement.classList.toggle('nerd',NERD);
function setNerd(on){NERD=!!on;document.documentElement.classList.toggle('nerd',NERD);if(NERD)store.set('radar.nerd',true);else store.del('radar.nerd');var b=$('#nerdBtn');if(b)b.setAttribute('aria-pressed',String(NERD));if(NERD&&typeof issCard==='function')issCard();else{var c=$('#issCard');if(c)c.remove()}}
// the plain sentence above the list: the next launch the visitor may see from their ZIP (a modeled estimate), with when and which way
// to look; with no ZIP set, or none in view, the next launch overall
function launchSum(){if(NERD&&typeof issCard==='function')issCard();var el=$('#launchSum');if(!el)return;var hasZip=!!store.get('radar.zip'),nx=null,seen=null;
  for(var i=0;i<LAUNCHES.length;i++){var L=LAUNCHES[i];if(Date.parse(L.utc)<Date.now()-15*60000)continue;if(!nx)nx=L;if(hasZip&&!seen){var v=vis(L);if(v&&v.best){seen=[L,v];break}}}
  if(seen){var L1=seen[0];el.textContent='From '+S.zip+', the next launch you may see is '+ORB.shortName(L1.mis,L1.veh)+', '+fmtDay(L1)+' at '+fmtTime(L1)+', looking '+ORB.dir16(seen[1].best.az)+' (a modeled estimate).';return}
  el.textContent=nx?(hasZip?'None of the next launches is expected to be visible from '+S.zip+'. ':'')+'Next launch: '+ORB.shortName(nx.mis,nx.veh)+', '+fmtDay(nx)+' at '+fmtTime(nx)+'.':''}
// Space today: what the build fetched from NASA (data/nasa.json): Earth from EPIC, the Sun from DONKI, the picture of the day, the
// week's asteroids. Each card has its credit and source; a section the last fetch could not refresh says how old it is. Images have
// fixed sizes and load lazily. Collapsed on phones; Nerd mode shows the details
function renderSpace(){var box=$('#spaceToday'),d=null;try{d=JSON.parse($('#nasadata').textContent)}catch(e){}if(!box||!d)return;var cards=[];
  function img(a,alt){return a&&a.length===3&&/^nasa\/[a-z0-9-]+\.jpg$/i.test(a[0])?'<img class="sp-img" src="'+esc(a[0])+'" width="'+(a[1]|0)+'" height="'+(a[2]|0)+'" alt="'+esc(alt)+'" loading="lazy" decoding="async">':''}
  function card(t,im,txt,m,nerd){return '<article class="sp-card">'+im+'<h3>'+esc(t)+'</h3><p>'+esc(txt)+'</p>'+(nerd?'<p class="sp-nerd">'+esc(nerd)+'</p>':'')+
    '<p class="sp-src">'+esc(m.credit||'NASA')+' \u00b7 <a href="'+esc(safeUrl(m.src||m.page,'https://www.nasa.gov/'))+'" target="_blank" rel="noopener">Source</a>'+(m.stale?'<span class="sp-stale">Last updated '+esc(agoTxt(m.at))+'</span>':'')+'</p></article>'}
  try{
    if(d.epic)cards.push(card('Earth today',img(d.epic.img,"The sunlit side of Earth, seen by NASA's EPIC camera about a million miles away"),"The whole sunlit Earth from NASA's EPIC camera on the DSCOVR spacecraft, taken "+fmtUtcShort(d.epic.utc)+'.',d.epic,''));
    if(d.sun)cards.push(card('The Sun','',d.sun.summary+' '+d.sun.aurora,d.sun,(d.sun.flares&&d.sun.flares.length?'Flare classes: '+d.sun.flares.join(', ')+'. ':'')+'Highest Kp: '+d.sun.kp+'. A rough guide, not a forecast.'));
    if(d.apod)cards.push(card('Picture of the day',d.apod.img?img(d.apod.img,d.apod.title):'',d.apod.title+(d.apod.copyright?'. The image belongs to '+d.apod.credit+'; see it on APOD.':'.'),{credit:d.apod.copyright?'Image '+d.apod.credit:'NASA APOD',src:d.apod.page,at:d.apod.at,stale:d.apod.stale},''));
    if(d.neo&&d.neo.closest){var c=d.neo.closest;cards.push(card('Asteroids this week','',d.neo.count+' asteroids pass Earth in the next 7 days. The closest, '+c.name+', passes on '+c.date+' at '+distTxt(c.km)+', far beyond the Moon.',d.neo,'NASA lists '+d.neo.hazardous+' as potentially hazardous (a size and orbit class, not a threat this week). The closest is about '+c.m[0]+' to '+c.m[1]+' meters across.'))}
  }catch(e){}
  cards=cards.slice(0,4);$('#spaceCards').innerHTML=cards.join('');if(cards.length){box.hidden=false;if(innerWidth>=700)box.open=true}issCard()}
// The ISS pass card (Nerd mode, in Space today): the next pass over the visitor's ZIP that can be seen (a dark sky and a sunlit
// station, ORB.issPasses) in the next three days, from the elements the feed carries (CelesTrak, fetched with the launches). satellite.js
// (MIT, vendor/) loads only when the card is wanted. Nothing shows when no pass is visible or the elements are over ten days old
var ISS=null,ISSJS=0,ISSK='';(function(){try{var f=JSON.parse($('#feeddata').textContent);if(f&&f.iss&&f.iss.tle&&f.iss.tle.length===2)ISS=f.iss}catch(e){}})();
function issCard(){var box=$('#spaceToday'),cards=$('#spaceCards');if(!box||!cards||!NERD||!ISS||!S.obs)return;var old=$('#issCard');
  if(Date.now()-Date.parse(ISS.epoch)>10*864e5){if(old)old.remove();return}
  if(!window.satellite){if(!ISSJS){ISSJS=1;var s=document.createElement('script');s.src='vendor/satellite.min.js';s.onload=issCard;s.onerror=function(){ISSJS=0};document.head.appendChild(s)}return}
  var k=S.obs.zip+'|'+ISS.epoch+'|'+Math.floor(Date.now()/6e5);if(k===ISSK&&old)return;ISSK=k;
  var ps=[];try{ps=ORB.issPasses(window.satellite,ISS.tle,S.obs.lat,S.obs.lon,Date.now(),72)}catch(e){}
  var p=ps.filter(function(x){return x.vis&&x.end>Date.now()})[0];if(old)old.remove();if(!p)return;
  var t=function(ms){var d=new Date(ms);return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})},day=new Date(p.tmax).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  var hint=p.max>=40?'High and bright, easy to see.':p.max>=20?'Bright, but lower in the sky.':'Low in the sky: look for a steady moving light.';
  var el=document.createElement('article');el.className='sp-card';el.id='issCard';
  el.innerHTML='<h3>ISS overhead</h3><p>'+esc('The International Space Station passes over '+S.obs.zip+' on '+day+' at '+t(p.tmax)+': from the '+ORB.dir16(p.az0)+' to the '+ORB.dir16(p.az1)+', up to '+Math.round(p.max)+'\u00b0 high. '+hint)+'</p>'+
    '<details class="sp-more"><summary>Details</summary><p>'+esc('Above 10\u00b0 from '+t(p.start)+' to '+t(p.end)+' ('+Math.max(1,Math.round((p.end-p.start)/6e4))+' min), highest in the '+ORB.dir16(p.azmax)+' at '+t(p.tmax)+'. It shines by sunlight, so it shows only while the sky is dark and the station is still lit. A prediction from orbital elements dated '+fmtUtcShort(ISS.epoch)+(ISS.stale?' (the last good copy)':'')+'; the station\'s orbit is adjusted now and then.')+'</p></details>'+
    '<p class="sp-src">Elements: CelesTrak \u00b7 <a href="https://celestrak.org/" target="_blank" rel="noopener">Source</a>. Not affiliated with NASA or CelesTrak.</p>';
  cards.appendChild(el);box.hidden=false}
function fmtUtcShort(u){var t=Date.parse(u);if(!isFinite(t))return 'recently';var d=new Date(t);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})+' at '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'})+' UTC'}
function renderRows(){if(LIVE.loading){$('#rows').innerHTML='<p class="sr">Loading launches</p>'+[0,1,2,3,4].map(function(){return SKROW}).join('');$('#rows').setAttribute('aria-busy','true');$('#pfilter').innerHTML=[60,90,110,70,96].map(function(w){return '<i class="sk sk-chip" style="width:'+w+'px" aria-hidden="true"></i>'}).join('');return}
  $('#rows').removeAttribute('aria-busy');launchSum();var shown=0,items=[],html=LAUNCHES.map(function(L,i){if(S.pf&&provKey(L)!==S.pf)return '';var live=liveOf(L),v=vis(L),on=!!S.rem[L.id],st=STATUS[L.st],P=provOf(L),ps=safeUrl(P.site,null),d=shown++;if(d>=ROWS0&&!S.allRows)return '';
  var rt=rateOf(L),vt=v.best?'<b'+(rt.score?'':' style="color:var(--fg-3)"')+'>'+rt.row+'</b><span>Look '+ORB.dir16(v.best.az)+' · peak '+Math.round(v.best.el)+'°'+(rt.w&&rt.clouds>=25?' · cloud '+rt.clouds+'%':'')+'</span>':'<b style="color:var(--fg-3)">Not visible</b><span>'+(v.why==='far'?'Too far to see':'Below your horizon')+'</span>';
  // a row is the provider's logo, the mission, the date with a countdown and the status; a tap opens the rest (the pad, the view from your
  // ZIP, Watch, Show on the radar, the reminder and the links). Which rows are open is kept (S.open), so a redraw leaves them open
  var op=!!S.open[L.id],rid='rd-'+String(L.id).replace(/[^A-Za-z0-9_-]/g,''),nm=esc(ORB.fullName(L.mis,L.veh));
  var h='<div class="row'+(live?' is-live':'')+(!live&&Date.parse(L.utc)-Date.now()<864e5?' near':'')+(i===S.cur?' sel" aria-current="true':'')+(op?' open':'')+'" style="animation-delay:'+(d*.06)+'s"><button type="button" class="r-head" data-open="'+esc(L.id)+'" aria-expanded="'+op+'" aria-controls="'+rid+'">'+
    '<span class="r-logo">'+logoChip(provLogo(L),'row')+'</span><span class="r-main"><span class="r-mis"><span class="r-sn">'+esc(ORB.shortName(L.mis,L.veh))+'</span>'+flightTag(L,P)+'</span><span class="r-veh">'+esc(L.veh)+'</span><span class="r-nerd">'+esc(nerdLine(L))+'</span></span>'+
    '<span class="r-when">'+flightTag(L,P).replace('r-tag','r-tag r-tag2')+'<span class="r-day">'+fmtDay(L)+' · '+fmtTime(L)+'</span><span class="r-cd tnum" data-cd="'+i+'">'+rowCd(L)+'</span></span>'+
    '<span class="r-st">'+(live?'<span class="live-badge"><i aria-hidden="true"></i>Live</span>':'<span class="status '+st[0]+'">'+st[2]+'</span>')+'</span>'+
    '<svg class="r-chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'+
    '<div class="r-more" id="'+rid+'"'+(op?'':' hidden')+'><p class="r-full">'+(ORB.undisclosed(L.mis)?esc(ORB.title(L.mis,L.veh))+' <span>Payload not disclosed</span>':esc(L.mis)+' <span>'+esc(L.veh)+'</span>')+'</p>'+(L.desc?'<p class="r-desc">'+esc(L.desc)+' <span class="r-dsrc">Launch Library 2</span></p>':'')+'<div class="r-info"><div class="r-pad">'+esc(L.siteObj.full)+'</div><div class="r-vis">'+vt+'</div></div>'+
    '<div class="r-acts">'+watchBtn(L,live)+'<button class="btn btn-sm" type="button" data-track="'+i+'" aria-label="Show '+nm+' on the radar">Show on radar</button><button class="bell" type="button" data-id="'+L.id+'" aria-pressed="'+on+'" aria-label="Reminder for '+nm+'">'+bellSvg+'</button></div>'+
    '<div class="r-links">'+altLink(L)+(infoUrl(L)?'<a href="'+esc(infoUrl(L))+'" target="_blank" rel="noopener">Mission page</a>':ps?'<a href="'+esc(ps)+'" target="_blank" rel="noopener">'+esc(P.n)+' site</a>':'')+'<button type="button" class="lnk" data-ics="'+i+'">Add to calendar</button>'+shareLinks(L,i)+'</div></div></div>';items.push([L,h]);return h}).join('');
  if(!shown){var P=PROV[S.pf],lk=function(u,t){u=safeUrl(u,null);return u?'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+t+'</a>':''};html='<div class="rows-empty"><p>No '+esc(P?P.n:'')+' launches in the next 30 days.</p><div class="r-links">'+(P?lk(P.live,'Watch live')+lk(P.site,'Website')+lk(P.social,'Social'):'')+'<button type="button" class="lnk" data-pf="">Show all launches</button></div></div>'}
  // rewrite only the rows that changed when the same launches are listed in the same order (a poll, a live badge), so the list does not jump
  var rows=$('#rows'),kids=rows.children,same=shown>0&&kids.length===items.length;for(var q=0;same&&q<items.length;q++)if(kids[q]._id!==items[q][0].id)same=false;
  if(same)items.forEach(function(it,q){if(kids[q]._h!==it[1]){var tp=document.createElement('template');tp.innerHTML=it[1];var nr=tp.content.firstChild;nr._id=it[0].id;nr._h=it[1];rows.replaceChild(nr,kids[q])}});
  else{rows.innerHTML=html;if(shown)items.forEach(function(it,q){kids[q]._id=it[0].id;kids[q]._h=it[1]})}
  var mr=$('#rowsMore');mr.hidden=shown<=ROWS0;mr.textContent=S.allRows?'Show fewer':'Show all '+shown+' launches';mr.setAttribute('aria-expanded',String(!!S.allRows));
  renderFilter()}
// the list shows the next ROWS0 launches; Show all lists the rest of the 30 days (and Show fewer goes back, keeping the list in view)
var ROWS0=6,PROV0=6;
S.open={};
function rowCd(L){if(liveOf(L))return 'Live now';var m=Math.round((Date.parse(L.utc)-Date.now())/60000);if(m<=0)return 'Launched';if(L.st==='tbd'&&m>1440)return 'in about '+Math.round(m/1440)+' days';
  var dd=Math.floor(m/1440),hh=Math.floor(m%1440/60),mm=m%60;return 'in '+(dd?dd+'d '+hh+'h':hh?hh+'h '+mm+'m':mm+'m')}
setInterval(function(){$$('[data-cd]').forEach(function(e){var L=LAUNCHES[+e.dataset.cd];if(L)tx(e,rowCd(L))})},30000);
$('#rowsMore').addEventListener('click',function(){S.allRows=!S.allRows;renderRows();if(!S.allRows)$('#p-launches').scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'})});
$('#rows').addEventListener('click',function(e){var o=e.target.closest('[data-open]');if(o){var r=o.parentNode,id=o.dataset.open,on=!S.open[id];if(on)S.open[id]=1;else delete S.open[id];r.classList.toggle('open',on);o.setAttribute('aria-expanded',String(on));r.querySelector('.r-more').hidden=!on;return}var f=e.target.closest('[data-pf]');if(f){setFilter(f.dataset.pf);return}var c=e.target.closest('[data-ics]');if(c){saveIcs(LAUNCHES[+c.dataset.ics]);return}var cp=e.target.closest('[data-copy]');if(cp){copyLaunch(LAUNCHES[+cp.dataset.copy]);return}var t=e.target.closest('[data-track]');if(t){WANT=null;S.cur=+t.dataset.track;S.simT=-10;refresh();showTab('sky');$('#top').scrollIntoView({behavior:reduce?'auto':'smooth'});return}var b=e.target.closest('.bell');if(b)toggleRem(b.dataset.id,b)});
// clicking a provider card (anywhere but its links) filters the manifest to that company
$('#providers').addEventListener('click',function(e){if(e.target.closest('a'))return;var c=e.target.closest('[data-pf]');if(!c)return;setFilter(c.dataset.pf);showTab('launches');$('#p-launches').scrollIntoView({behavior:reduce?'auto':'smooth'})});
function toggleRem(id,btn){var on=!S.rem[id];if(on)S.rem[id]=1;else delete S.rem[id];store.set('radar.rem',S.rem);var L=LAUNCHES.filter(function(l){return l.id===id})[0];
  if(btn){btn.setAttribute('aria-pressed',on);var sv=btn.querySelector('svg');sv.classList.remove('bell-ring');void sv.offsetWidth;sv.classList.add('bell-ring')}else renderRows();toast(on?'Reminder saved on this device for '+ORB.fullName(L.mis,L.veh)+'. Add it to your calendar for an alert.':'Reminder removed',on?4500:2600);updateRemind()}
// calendar file (.ics) with an alert 30 minutes before liftoff
function icsTxt(v){return String(v).replace(/[\\;,]/g,function(c){return '\\'+c}).replace(/\n/g,'\\n')}
// The same event the build writes for launch pages and the calendar feed (ics_event in launch_pages.py): times in UTC, so every calendar
// shows them in its own zone; a stable UID, so the feed and this file update one event; alerts a day and 30 minutes before; lines folded
// at 75 octets (RFC 5545)
function icsFold(s){var out=[],cur='',n=0,lim=75;for(var i=0;i<s.length;i++){var ch=s[i],b=unescape(encodeURIComponent(ch)).length;if(n+b>lim){out.push(cur);cur='';n=0;lim=74}cur+=ch;n+=b}out.push(cur);return out.join('\r\n ')}
// SEQUENCE: whole minutes from 2020 to the feed's lu (when Launch Library last changed the record), so a calendar takes a changed time as an
// update of the event it has; 0 without lu. A port of ics_revision in launch_pages.py: change the two together
function icsRev(L){var t=Date.parse(L.lu||'');return isFinite(t)?Math.max(0,Math.floor((t-Date.UTC(2020,0,1))/60000)):0}
function icsFor(L){var st=function(d){return d.toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'')},d=new Date(L.utc),W=watchOf(L),w=W?W.url:safeUrl(provOf(L).site,null)||'https://astroradar.io/',pg=launchLink(L);
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Astro Radar//Launches//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT','UID:'+icsTxt(L.id)+'@astroradar.io','DTSTAMP:'+st(new Date()),'DTSTART:'+st(d),'DTEND:'+st(new Date(d.getTime()+1800000)),'SUMMARY:'+icsTxt(ORB.undisclosed(L.mis)?ORB.title(L.mis,L.veh):L.veh+' launch · '+L.mis),'LOCATION:'+icsTxt(L.siteObj.full),'DESCRIPTION:'+icsTxt((L.st==='tbd'?'Time to be confirmed. ':'')+'Watch: '+w+'\nLaunch times often move. Check '+pg+' before you head out.'),'URL:'+pg,'STATUS:'+(L.st==='tbd'||L.st==='hold'?'TENTATIVE':'CONFIRMED'),'SEQUENCE:'+icsRev(L)].concat(L.lu?['LAST-MODIFIED:'+st(new Date(L.lu))]:[],['BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:'+icsTxt(L.veh+' launch tomorrow'),'END:VALARM','BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY','DESCRIPTION:'+icsTxt(L.veh+' launch in 30 minutes'),'END:VALARM','END:VEVENT','END:VCALENDAR']).map(icsFold).join('\r\n')+'\r\n'}
function saveIcs(L){if(!L)return;var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([icsFor(L)],{type:'text/calendar'}));a.download=String(ORB.title(L.mis,L.veh)||'launch').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').toLowerCase()+'.ics';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000);toast('Calendar file saved. Open it to add the launch with an alert.',4000)}
// the reminder is the one main button only when the launch has no stream to watch
function updateRemind(){var b=$('#heroRemind'),on=!!S.rem[L0().id],main=!on&&$('#heroWatch').hidden;b.classList.toggle('on',on);b.classList.toggle('btn-solid',main);b.classList.toggle('btn-ghost',!main&&!on);b.querySelector('span').textContent=on?'Reminder set':'Set reminder'}
$('#heroCal').addEventListener('click',function(){saveIcs(L0())});
// the hero's More menu (calendar, share, copy link, the provider's page): closes on a choice, a click elsewhere or Escape
(function(){var m=$('#heroMore');if(!m)return;m.addEventListener('click',function(e){if(e.target.closest('.more-p a,.more-p button'))setTimeout(function(){m.open=false},0)});
  document.addEventListener('click',function(e){if(m.open&&!m.contains(e.target))m.open=false});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&m.open){m.open=false;m.querySelector('summary').focus()}})})();
$('#heroRemind').addEventListener('click',function(){toggleRem(L0().id,null);var sv=$('#heroRemind svg');sv.classList.remove('bell-ring');void sv.offsetWidth;sv.classList.add('bell-ring')});

/* zip */
function setZip(z,announce){z=String(z).trim();var err=$('#zipErr'),inp=$('#zipInput');function bad(m){err.textContent=m;inp.setAttribute('aria-invalid','true')}if(!/^\d{5}$/.test(z)){bad('Enter a 5 digit US ZIP code.');return}if(!Z){err.textContent='Looking up ZIP '+z;loadZips().then(function(){setZip(z,announce)},function(){bad('We could not load the ZIP list. Check your connection and try again.')});return}var i=findZip(z);if(i<0){bad('We could not find ZIP '+z+'. Check the number or try a nearby ZIP.');return}err.textContent='';inp.removeAttribute('aria-invalid');S.obs=zipInfo(i);store.set('radar.zip',z);store.set('radar.zipinfo',S.obs);$('#zipInput').value=z;S.simT=-10;refresh();if(announce)toast('Checking the sky from '+S.obs.city)}
$('#zipForm').addEventListener('submit',function(e){e.preventDefault();setZip($('#zipInput').value,true)});
$('#zipInput').addEventListener('input',function(){this.value=this.value.replace(/\D/g,'').slice(0,5)});
function refresh(){loadWx(S.obs);renderHero();renderView();renderRows();renderShare();renderWx();renderWatch();drawWedge();if(skySeen)arcT0=performance.now()}


/* ===== tabs ===== */
var TABS=['sky','launches','watch','astro'];
function moveInk(){var t=$('.ptab[aria-selected="true"]'),ink=$('#ptabInk');if(!t)return;ink.style.transform='translateX('+t.offsetLeft+'px) scaleX('+t.offsetWidth+')'}
function showTab(id,push){if(TABS.indexOf(id)<0)id='sky';$$('.ptab').forEach(function(b){var on=b.dataset.tab===id;b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1});TABS.forEach(function(k){var p=$('#p-'+k);p.hidden=k!==id;if(k===id){p.style.animation='none';void p.offsetWidth;p.style.animation=''}});moveInk();curTab=id;navState(true);
  if(id==='sky')setTimeout(sizeSky,30);try{history.replaceState(null,'','#'+id)}catch(e){}}
(function(){var nb=$('#nerdBtn');if(nb){nb.setAttribute('aria-pressed',String(NERD));nb.addEventListener('click',function(){setNerd(!NERD)})}})();
$$('.ptab').forEach(function(b){b.addEventListener('click',function(){showTab(b.dataset.tab);var r=$('.tabsec').getBoundingClientRect();if(r.top>innerHeight*.4||r.bottom<innerHeight*.3)$('.tabsec').scrollIntoView({behavior:reduce?'auto':'smooth'})});b.addEventListener('keydown',function(e){var i=TABS.indexOf(b.dataset.tab);if(e.key==='ArrowRight'||e.key==='ArrowLeft'){var n=TABS[(i+(e.key==='ArrowRight'?1:3))%4];showTab(n);$('#t-'+n).focus();e.preventDefault()}})});
$$('a[data-tab]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();showTab(a.dataset.tab);$('.tabsec').scrollIntoView({behavior:reduce?'auto':'smooth'});
  // "Add your ZIP" in the intro puts the cursor in the ZIP field once the scroll has settled
  var f=a.dataset.focus&&document.getElementById(a.dataset.focus);if(f)setTimeout(function(){f.focus({preventScroll:true});f.select()},reduce?0:600);
  // the skip link hands keyboard focus to the launch list itself
  if(a.classList.contains('skip'))$('#p-launches').focus({preventScroll:true})})});
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
  function done(){if(S.obs&&S.obs.zip===o.zip){renderWx();renderRating();renderRows()}}
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
function renderWx(){var L=L0(),o=S.obs,v=vis(L),w=wxFor(L,o),tz=tzFor(o.st),d=new Date(L.utc),dark=v.sunObs<-4,nr=NWS[o.zip];
  // while the NWS forecast is on its way the cards shimmer instead of showing sample numbers that are about to change
  $('.wxrow').classList.toggle('ld',!!(nr&&!nr.ok&&!nr.err));
  $('#wxIcon').setAttribute('viewBox','0 0 56 56');$('#wxIcon').innerHTML=wxIcon(w.cond,dark);$('#wxCond').textContent=w.cond;$('#wxPlace').textContent=o.city+' · '+d.toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit',timeZone:tz,timeZoneName:'short'});
  $('#wxTemp').textContent=w.temp==null?'n/a':w.temp+'°';$('#wxTag').textContent=wxTagText(w,o);$('#wxCloud').textContent=w.clouds+'%';$('#wxWind').textContent=w.wind;$('#wxSky').textContent=v.sunObs>0?'Daylight':v.sunObs>-12?'Twilight':'Dark';
  var am=parseInt(d.toLocaleString('en-US',{hour:'numeric',hour12:false,timeZone:tz}),10)<12,cr=ORB.sunCross(o.lat,o.lon,d,-.833,am?1:-1);$('#wxSunK').textContent=am?'Sunrise':'Sunset';$('#wxSun').textContent=cr?new Date(cr).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:tz}):'n/a';
  var r=rateOf(L,o),sc10=[0,2,4,7,9][r.score],t1,t2,dw=DIRW[ORB.dir16(v.best?v.best.az:bearingTo(o,L.siteObj.lat,L.siteObj.lon))];
  if(!v.best){t1='Not visible from here';t2=v.why==='far'?'It is too far away to see from here. Watch the live stream instead.':'The rocket never clears your horizon. Watch the live stream instead.'}
  else if(r.score===0){t1='Cloud likely hides it';t2='The NWS forecasts '+r.clouds+'% cloud cover at launch time. Watch the live stream.'}
  else if(r.score>=4){t1='Very good chance';t2='It climbs '+Math.round(v.best.el)+'° above your horizon and you are close. Check the sky again nearer launch.'}
  else if(r.score===3){t1='Good chance';t2='Look '+dw+'. A clear horizon helps'+(r.cut?', and cloud may get in the way':'')+'.'}
  else if(r.score===2){t1='Fair chance';t2='It will be fairly low or far, so find an open horizon'+(r.cut?' and hope the cloud thins':'')+'.'}
  else{t1='Unlikely';t2='It will be low, far or faint'+(r.cut?', and cloud is forecast':'')+'. The live stream is your best bet.'}
  $('#olT').textContent=t1;$('#olS').textContent=t2;$('#olScore').textContent=sc10+' / 10';$('#olBar').style.transform='scaleX('+(sc10/10)+')';$('#olPath').textContent=v.best?r.row:(v.why==='far'?'Too far':'Below horizon');$('#olCloud').textContent=r.w?(r.clouds<25?'Low':r.clouds<60?'Some':'Heavy')+' · '+r.clouds+'%':'No forecast';$('#olSite').textContent=goTxt(L)}

/* ===== art: procedural launch photos (no external images) ===== */

/* ===== watch ===== */
function renderWatch(){var L=L0(),W0=watchOf(L),fw=$('#featWatch');if(W0)fw.href=W0.url;else fw.removeAttribute('href');$('#featT').textContent=ORB.undisclosed(L.mis)?ORB.title(L.mis,L.veh):L.veh+' · '+L.mis;$('#featS').textContent=fmtDay(L)+' · '+fmtTime(L)+' · '+(W0?(W0.own?'official webcast on ':'live page: ')+W0.src:'no official stream listed yet');tx($('#featPlayT'),W0?wlabel(liveOf(L)):'No stream yet');tx($('#featPlayS'),W0?W0.src:'');
  var cnt={};LAUNCHES.forEach(function(x){cnt[x.prov]=(cnt[x.prov]||0)+1});
  var ext=function(u,t,lab,cls){u=safeUrl(u,null);return u?'<a'+(cls?' class="'+cls+'"':'')+' href="'+esc(u)+'" target="_blank" rel="noopener" aria-label="'+esc(lab)+' (opens in a new tab)">'+t+'<svg class="ico" width="14" height="14" aria-hidden="true"><use href="#i-ext"/></svg></a>':''};
  var pl=PROVS.filter(function(p){return cnt[p.key]}).concat(PROVS.filter(function(p){return !cnt[p.key]})),pm=$('#provMore');
  pm.hidden=pl.length<=PROV0;pm.textContent=S.allProv?'Show fewer':'Show all '+pl.length+' providers';pm.setAttribute('aria-expanded',String(!!S.allProv));if(!S.allProv)pl=pl.slice(0,PROV0);
  $('#providers').innerHTML=pl.map(function(p){var c=cnt[p.key]||0,g=provLogo({prov:p.key});return '<div class="prov" data-pf="'+esc(p.key)+'"><button type="button" class="prov-h" data-pf="'+esc(p.key)+'" aria-label="Show '+esc(p.n)+' launches"><span class="prov-id">'+logoChip(g,'card')+'<b class="sr">'+esc(p.n)+'</b></span><span class="prov-n">'+(c?c+' launch'+(c>1?'es':'')+' in 30 days':'None in 30 days')+'</span></button><p>'+esc(p.d)+'</p><a class="prov-pg" href="provider/'+esc(p.key)+'/">'+esc(p.n)+' launches and links</a>'+(p.site||p.live||p.social?'<div class="prov-l">'+ext(p.live,'Watch live'+(p.liveSrc?'<span>'+esc(p.liveSrc)+'</span>':''),p.n+' live page'+(p.liveSrc?' on '+p.liveSrc:''),'pl-live')+ext(p.site,'Website',p.n+' website')+ext(p.social,'Social',p.n+' social page')+'</div>':'<p class="prov-none">No official links we could verify yet.</p>')+'</div>'}).join('');
}

/* ===== share to Astro ===== */
// Astro (astrosocial.io) is the group chat app. A launch goes there as a link that carries its id, name, time and its page on this site;
// Radar keeps no accounts. The buttons show only for live launch data, since the sample manifest has made up launches. A page opened as
// astroradar.io/?launch=ID selects that launch (WANT) once the list has it.
var ASTRO='https://astrosocial.io',HOME='https://astroradar.io/',WANT=null;
try{WANT=new URLSearchParams(location.search).get('launch')}catch(e){}
// every launch in the feed the build inlined has its own page (launch_pages.py); a launch that came in later links to ?launch= instead
var PAGES={};
function pageOf(L){return PAGES[L.id]?'launch/'+encodeURIComponent(L.id)+'/':''}
function launchLink(L){return pageOf(L)?HOME+pageOf(L):HOME+'?launch='+encodeURIComponent(L.id)}
function launchTitle(L){return ORB.undisclosed(L.mis)?ORB.title(L.mis,L.veh):L.mis+' · '+L.veh}
function isoUtc(L){var d=new Date(L.utc);return isNaN(d.getTime())?'':d.toISOString().replace(/\.\d+Z$/,'Z')}
function astroShare(L){var u=isoUtc(L);return ASTRO+'/app/share?launch='+encodeURIComponent(L.id)+'&title='+encodeURIComponent(launchTitle(L))+(u?'&utc='+encodeURIComponent(u):'')+'&url='+encodeURIComponent(HOME+'?launch='+encodeURIComponent(L.id))}
function shareOn(L){return !!(LIVE.on&&L)}
function pickWanted(){if(!WANT)return false;var k=-1;LAUNCHES.forEach(function(L,i){if(L.id===WANT)k=i});if(k<0)return false;WANT=null;if(k===S.cur)return false;S.cur=k;S.simT=-10;return true}
// phones with a share sheet use it for the second button; everything else copies the link
function nativeShare(){return !!(navigator.share&&window.matchMedia&&matchMedia('(pointer:coarse)').matches)}
function copyLabel(){return nativeShare()?'Share link':'Copy link'}
function copyText(t){if(navigator.clipboard&&navigator.clipboard.writeText&&window.isSecureContext)return navigator.clipboard.writeText(t);
  return new Promise(function(ok,no){var a=document.createElement('textarea');a.value=t;a.setAttribute('readonly','');a.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(a);a.select();var r=false;try{r=document.execCommand('copy')}catch(e){}a.remove();r?ok():no()})}
function copyIt(link){copyText(link).then(function(){toast('Link copied.',2600)},function(){try{window.prompt('Copy this link',link)}catch(e){}})}
function copyLaunch(L){if(!shareOn(L))return;var link=launchLink(L);
  if(nativeShare()){navigator.share({title:launchTitle(L)+' · Astro Radar',text:launchTitle(L)+' · '+fmtDay(L)+' · '+fmtTime(L),url:link}).catch(function(e){if(!e||e.name!=='AbortError')copyIt(link)});return}
  copyIt(link)}
// under a row: the two share controls (nothing without live data)
function shareLinks(L,i){if(!shareOn(L))return '';var n=esc(ORB.fullName(L.mis,L.veh)),c=copyLabel(),pg=pageOf(L);
  return (pg?'<a href="'+esc(pg)+'" aria-label="Launch page for '+n+'">Launch page</a>':'')+'<a href="'+esc(astroShare(L))+'" target="_blank" rel="noopener" aria-label="Share '+n+' to Astro (opens in a new tab)">Share to Astro</a><button type="button" class="lnk" data-copy="'+i+'" aria-label="'+c+' for '+n+'">'+c+'</button>'}
// the hero buttons and the Astro tab, for the launch on show
// the Astro tab's next launches to plan: up to five still to come (a plan in Astro needs a time ahead), each with its Share to Astro link
function renderAstroList(){var box=$('#astroNext');if(!box)return;var on=LIVE.on,now=Date.now(),up=on?LAUNCHES.filter(function(L){return L.st!=='flight'&&Date.parse(L.utc)>now}).slice(0,5):[];
  var sig=up.map(function(L){return L.id+L.utc+L.st+L.mis}).join('|');box.hidden=!up.length;if(box._s===sig)return;box._s=sig;
  $('#astroList').innerHTML=up.map(function(L){var n=esc(launchTitle(L));return '<li><span class="an-t"><b>'+esc(ORB.shortName(L.mis,L.veh))+(ORB.undisclosed(L.mis)?'':' <i>'+esc(L.veh)+'</i>')+'</b><span>'+esc(fmtDay(L)+' · '+fmtTime(L))+(L.st==='tbd'?', time to be confirmed':'')+'</span></span><a class="btn" href="'+esc(astroShare(L))+'" target="_blank" rel="noopener" aria-label="Make '+n+' a plan on Astro (opens in a new tab)">Make it a plan</a></li>'}).join('')}
function renderShare(){renderAstroList();var L=L0(),on=shareOn(L);['heroShare','heroCopy','astroShare','astroCopy'].forEach(function(id){$('#'+id).hidden=!on});
  tx($('#astroT'),launchTitle(L));tx($('#astroS'),on?fmtDay(L)+' · '+fmtTime(L)+' · '+L.siteObj.full:'Live launch data is not loaded, so there is nothing to share yet.');
  if(!on)return;var u=astroShare(L),n=launchTitle(L),c=copyLabel();
  ['heroShare','astroShare'].forEach(function(id){var e=$('#'+id);if(e.href!==u)e.href=u;e.setAttribute('aria-label','Share '+n+' to Astro (opens in a new tab)')});
  ['heroCopyT','astroCopyT'].forEach(function(id){tx($('#'+id),c)});
  ['heroCopy','astroCopy'].forEach(function(id){$('#'+id).setAttribute('aria-label',c+' for '+n)})}
$('#heroCopy').addEventListener('click',function(){copyLaunch(L0())});
$('#astroCopy').addEventListener('click',function(){copyLaunch(L0())});

/* loop */
// the globe card's launch and the Your sky view draw only while they are on screen and the tab is visible (the loop stops otherwise and
// starts again when one comes back); the low tier draws 30 frames a second, the rest at the display's rate
var last=0,RUN=false,skyOn=false,FMIN=0;
// the lite tiers (phones) draw their ambient motion at 24 frames a second
function setFmin(){FMIN=QT==='low'?1000/30-4:0}setFmin();
// Scrolling on the lite tiers: nothing is drawn while the page moves. The world, the launch and the sky view are layers that stay put, so
// the last frame stands while the browser scrolls the page on its own; drawing resumes 150 ms after the last scroll event. The scroll
// listener only records the time (passive, no layout reads)
var SCR=-1e9,SCRT=0;addEventListener('scroll',function(){SCR=performance.now();twkScroll();if(DIAG)scrollFps()},{passive:true});
function calm(now){return !LITE||now-SCR>150}
function wantRun(){return !document.hidden&&(skyOn||JOBS.length>0)}
// (the very first frame is left to the browser, so the page's text paints before any hero work)
var FR0=true;function loop(now){if(!wantRun()){RUN=false;last=0;FW.t0=0;return}if(!calm(now)){RUN=false;last=0;FW.t0=0;if(!SCRT)SCRT=setTimeout(function(){SCRT=0;kick()},170);return}requestAnimationFrame(loop);if(FR0){FR0=false;return}frameWatch(now);if(last&&now-last<FMIN)return;var dt=last?Math.min(.1,(now-last)/1000):.016;last=now;var w0=performance.now();runJobs(LOWP?5:8);
  if(skyOn){if(S.playing){S.simT+=dt*20;if(S.simT>L0().end+8)S.simT=-10}drawSky();FW.drawn++}FW.work+=performance.now()-w0;FW.wn++}
function kick(){if(!calm(performance.now())){if(!SCRT)SCRT=setTimeout(function(){SCRT=0;kick()},170);return}if(!RUN&&wantRun()){RUN=true;last=0;FW.t0=0;FW.cool=performance.now()+1500;requestAnimationFrame(loop)}}
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
  drawWedge();arcT0=performance.now();
  var b=$('#olBar'),w=b.style.transform;if(!reduce){b.style.transition='none';b.style.transform='scaleX(0)';void b.offsetWidth;b.style.transition='';b.style.transform=w}}
// blocks fade and rise in the first time they come into view, children staggered, then the classes come off so hovers stay instant.
// Threshold 0: a long manifest on a phone is many screens tall and would never reach a fractional threshold
// on scroll: the tier classes (html.q-lite stops the decorative spins and glows) and a kick for the starfield. Nothing moves with the
// scroll: no parallax, no camera tied to it (the smoke test checks the planet stays put)
function parallax(){var de=document.documentElement;if(de.classList.contains('q-lite')!==LITE)de.classList.toggle('q-lite',LITE);if(de.classList.contains('q-low')!==(QT==='low'))de.classList.toggle('q-low',QT==='low');sfKick()}
// The sparse starfield behind the page below the hero: one fixed canvas. Three depths of stars, each drawn once into a tile and copied
// with an offset, drift slowly sideways (never with the scroll); a few twinkle on their own and, very rarely, a star shoots. It draws only
// while part of it shows below the hero and the tab is visible, at most 30 frames a second; phones (the lite tiers), the low tier and
// reduced motion draw it once and keep it still. A tier step down rebuilds it.
var SF={c:$('#stars'),tier:'',w:0,h:0,d:1,T:384,L:[],tw:[],raf:0,last:0,next:0,shot:null,streak:null,hb:0};
var SFD=[{n:80,r:[.4,.65],a:[.4,.7],v:2.2},{n:28,r:[.6,.95],a:[.55,.9],v:4.5},{n:9,r:[.85,1.3],a:[.75,1],v:8}];
// one calm sky: the field is drawn once and kept still on every tier (no drifting layers, twinkles or shooting stars)
function sfTier(){return 'still'}
function sfRand(s){return function(){s=(s*16807)%2147483647;return (s-1)/2147483646}}
function sfColor(r){return r<.12?'255,214,170':r<.4?'196,214,255':'255,255,255'}
function sfBuild(){var c=SF.c;if(!c)return;var tier=SF.tier=sfTier();if(tier==='still'){SF.L=[];SF.tw=[];c.style.width=c.style.height='';skyStars(c,1/2300,function(){return 1},7);return}c._k='';
  var dens=tier==='high'?1:tier==='medium'?.55:.6,dpr=Math.min(window.devicePixelRatio||1,tier==='high'?1.5:1);
  SF.d=dpr;SF.w=innerWidth;SF.h=innerHeight;c.width=Math.round(SF.w*dpr);c.height=Math.round(SF.h*dpr);var T=SF.T,rnd=sfRand(7);
  SF.L=SFD.map(function(D){var t=document.createElement('canvas');t.width=t.height=Math.round(T*dpr);var x=t.getContext('2d');x.scale(dpr,dpr);
    for(var i=0,n=Math.round(D.n*dens);i<n;i++){var r=D.r[0]+rnd()*(D.r[1]-D.r[0]);x.fillStyle='rgba('+sfColor(rnd())+','+(D.a[0]+rnd()*(D.a[1]-D.a[0])).toFixed(2)+')';x.beginPath();x.arc(rnd()*T,rnd()*T,r,0,6.2832);x.fill()}
    return {t:t,v:D.v,k:D.k}});
  SF.tw=[];if(tier!=='still')for(var i=0,n=Math.round(SF.w*SF.h/60000*dens);i<n;i++)SF.tw.push({x:rnd()*SF.w,y:rnd()*SF.h,l:1+(i%2),s:.45+rnd()*.6,f:.6+rnd()*1.6,p:rnd()*6.28,c:sfColor(rnd())});
  if(!SF.streak){var s=SF.streak=document.createElement('canvas');s.width=220;s.height=6;var x=s.getContext('2d'),g=x.createLinearGradient(0,0,220,0);g.addColorStop(0,'rgba(170,200,255,0)');g.addColorStop(.85,'rgba(220,232,255,.75)');g.addColorStop(1,'#fff');x.fillStyle=g;x.fillRect(0,2,220,2)}
  SF.next=performance.now()+20000+Math.random()*30000;SF.last=0;sfDraw(performance.now());SF.c.classList.add('on')}
function sfShows(){if(document.hidden)return false;if(!SF.hb){var h=$('.hero');SF.hb=h?h.offsetTop+h.offsetHeight:0}return SF.hb-scrollY<innerHeight}
function sfDraw(now){var x=SF.c.getContext('2d'),d=SF.d,T=SF.T,still=SF.tier==='still',t=still?0:now/1000;x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,SF.c.width,SF.c.height);x.setTransform(d,0,0,d,0,0);
  SF.L.forEach(function(L){var ox=-((t*L.v)%T),oy=0;for(var y=oy;y<SF.h;y+=T)for(var xx=ox;xx<SF.w;xx+=T)x.drawImage(L.t,xx,y,T,T)});
  for(var i=0;i<SF.tw.length;i++){var s=SF.tw[i],L=SFD[s.l],px=((s.x-t*L.v)%SF.w+SF.w)%SF.w,py=s.y,a=.5+.5*Math.sin(t*s.f+s.p);
    x.globalAlpha=a*a;x.fillStyle='rgb('+s.c+')';x.fillRect(px-s.s,py-s.s,s.s*2,s.s*2)}
  x.globalAlpha=1;var sh=SF.shot;
  if(!still&&!sh&&now>SF.next){sh=SF.shot={t0:now,x:SF.w*(.15+Math.random()*.7),y:SF.h*(.08+Math.random()*.35),a:.32+Math.random()*.3,len:260+Math.random()*200};SF.next=now+25000+Math.random()*45000}
  if(sh){var k=(now-sh.t0)/900;if(k>=1)SF.shot=null;else{x.save();x.globalAlpha=Math.sin(k*Math.PI);x.translate(sh.x+Math.cos(sh.a)*sh.len*k,sh.y+Math.sin(sh.a)*sh.len*k);x.rotate(sh.a);x.drawImage(SF.streak,-150,-2,150,4);x.restore()}}}
function sfFrame(now){SF.raf=0;if(!sfShows())return;if(SF.tier!==sfTier()){sfBuild();return}if(SF.tier==='still')return;
  var fps=SF.tier==='high'?30:20;if(now-SF.last>=1000/fps-2){SF.last=now;sfDraw(now)}SF.raf=requestAnimationFrame(sfFrame)}
function sfKick(){if(!SF.c||!SF.L.length)return;if(SF.tier==='still'){if(SF.tier!==sfTier())sfBuild();return}if(!SF.raf&&sfShows())SF.raf=requestAnimationFrame(sfFrame)}
// crisp stars: drawn once per size at the screen's own pixel density (up to 3, held under a pixel budget), each star a dot centred on a
// device pixel, so they stay sharp at 3x. The sky is cut into 256 px cells, each seeded by its place, so no pattern repeats and a taller
// or wider canvas only adds stars (nothing jumps when a phone's address bar hides). Most stars are faint, a few bright ones carry a small
// halo, about one in eight is warm and one in six blue. w(f) thins them by height (f from 0 at the top to 1 at the foot). Still: nothing
// runs per frame, so nothing needs pausing off screen or under reduced motion
function skyStars(c,dens,w,seed){if(!c||!c.getContext)return;var W=c.clientWidth,H=c.clientHeight;if(W<2||H<2)return;
  var d=Math.min(window.devicePixelRatio||1,3),cap=LITE?3.6e6:7e6;if(W*H*d*d>cap)d=Math.sqrt(cap/(W*H));
  var cw=Math.round(W*d),ch=Math.round(H*d),key=cw+'x'+ch;if(c._k===key)return;c._k=key;c.width=cw;c.height=ch;
  var x=c.getContext('2d'),C=256,per=dens*C*C;x.clearRect(0,0,cw,ch);
  for(var j=0;j*C<H;j++)for(var i=0;i*C<W;i++){var rnd=sfRand((seed*977+i*7919+j*104729)%2147483646+1),n=Math.round(per*(.6+.8*rnd()));
    for(var k=0;k<n;k++){var px=(i+rnd())*C,py=(j+rnd())*C,m=Math.pow(rnd(),3),t=rnd(),keep=rnd();
      if(px>=W||py>=H||keep>w(py/H))continue;
      var col=t<.12?'255,222,190':t<.28?'198,216,255':'255,255,255',a=.32+.68*Math.pow(m,.6),s=(.5+1.15*m)*d/2,
        cx=Math.floor(px*d)+.5,cy=Math.floor(py*d)+.5;
      if(m>.5){var g=x.createRadialGradient(cx,cy,0,cx,cy,s*4);g.addColorStop(0,'rgba('+col+','+(a*.28).toFixed(3)+')');g.addColorStop(1,'rgba('+col+',0)');x.fillStyle=g;x.fillRect(cx-s*4,cy-s*4,s*8,s*8)}
      x.fillStyle='rgba('+col+','+a.toFixed(3)+')';
      if(s<.75)x.fillRect(cx-.5,cy-.5,1,1);else{x.beginPath();x.arc(cx,cy,s,0,6.2832);x.fill()}}}
  c.classList.add('on')}
function skySmooth(a,b,f){var k=Math.min(1,Math.max(0,(f-a)/(b-a)));return k*k*(3-2*k)}
// the hero's sky: densest at the top, thinning down to none just above the horizon. The footer's: fading in from its top edge (the page's
// own sparse field is above it), sparse behind the footer's text and fuller above the planet, under the photo, whose own sky takes over
// where its mask turns solid
function heroSky(){skyStars($('#heroSky'),1/1700,function(f){return (1-skySmooth(.5,.96,f))*(1-.4*f)},3)}
function footSky(){skyStars($('#footSky'),1/2000,function(f){return skySmooth(0,.25,f)*(.3+.7*skySmooth(.4,.75,f))},5)}
function initSky(){var hs=$('#heroSky'),fs=$('#footSky');if(!hs&&!fs)return;
  requestAnimationFrame(function(){requestAnimationFrame(heroSky)});
  if('ResizeObserver' in window){var ro=new ResizeObserver(function(es){es.forEach(function(e){if(e.target===hs)heroSky();else if(FST)footSky()})});if(hs)ro.observe(hs);if(fs)ro.observe(fs)}
  else addEventListener('resize',function(){clearTimeout(initSky.t);initSky.t=setTimeout(function(){heroSky();if(FST)footSky()},200)})}
// phones keep the canvas still, so a few stars twinkle there instead: three groups of five, each one small element whose stars are its
// box shadows, fading in and out out of step (opacity only, run by the compositor: three layers, not fifteen). They pause while the
// page scrolls. Never with reduced motion
var TWK=null,TWT=0;function twinkles(){if(reduce||!LITE||TWK)return;var d=document.createElement('div'),r=sfRand(11),h='';d.className='twk';d.setAttribute('aria-hidden','true');
  for(var g=0;g<3;g++){var sh=[];for(var i=0;i<5;i++)sh.push(Math.round(r()*innerWidth)+'px '+Math.round(r()*innerHeight)+'px 0 .5px var(--star)');h+='<i style="box-shadow:'+sh.join(',')+';animation-duration:'+(4+g*1.6).toFixed(1)+'s;animation-delay:-'+(g*1.7).toFixed(1)+'s"></i>'}
  d.innerHTML=h;document.body.insertBefore(d,document.body.firstChild);TWK=d}
function twkScroll(){if(!TWK)return;if(!TWT)TWK.classList.add('calm');clearTimeout(TWT);TWT=setTimeout(function(){TWT=0;TWK.classList.remove('calm')},200)}
function initStars(){if(!SF.c||!SF.c.getContext)return;afterLoad(function(){sfBuild();sfKick()});initSky();
  addEventListener('resize',function(){clearTimeout(SF.rz);SF.rz=setTimeout(function(){SF.hb=0;if(SF.L.length)sfBuild();sfKick()},200)});
  document.addEventListener('visibilitychange',sfKick)}
// the footer's planet: a poster of another NASA shot (assets/earth/foot-*: AVIF, else WebP, 1080 wide under 700 px and 2560 above) and
// its video over it, both asked for only when the footer comes within 600 px, the video playing only while the footer is on screen. Not
// in the artifact, which carries one small still inline
var FST=false;
function footStill(){if(FST)return;FST=true;footSky()}
function initFootPlanet(){var ft=$('.site-foot');if(!ft)return;if(!('IntersectionObserver' in window)){footStill();return}
  // kept for offline visits: the service worker saves the earth/ files it serves; on a first visit it does not control the page yet, so
  // the hero photo, loaded before it did, is asked for again once it does
  if('serviceWorker' in navigator&&document.querySelector('link[rel=manifest]')&&!navigator.serviceWorker.controller)navigator.serviceWorker.addEventListener('controllerchange',function(){setTimeout(function(){
    var u=(document.querySelector('#heroPst img')||{}).currentSrc||'';if(u&&!/^data:/.test(u))fetch(u).catch(function(){})},2000)},{once:true});
  new IntersectionObserver(function(es){if(es[0].isIntersecting)footStill()},{rootMargin:'600px 0px'}).observe(ft)}
function initMotion(){initFootPlanet();navState(true);initStars();parallax();addEventListener('scroll',function(){if(!navQ){navQ=1;requestAnimationFrame(function(){navQ=0;navState();parallax()})}},{passive:true});addEventListener('resize',function(){navState(true)});
  if(reduce||!('IntersectionObserver' in window)){skyIn();return}
  var io=new IntersectionObserver(function(es){es.forEach(function(en){if(!en.isIntersecting)return;var t=en.target;io.unobserve(t);if(t._in)t._in();else t.classList.add('in');setTimeout(function(){t.classList.remove('rv','rvs','in')},1600)})},{threshold:0,rootMargin:'0px 0px -6% 0px'});
  $$('#recentList,.sky-more,.panel .sec-head,.wxrow,#providers,.astro,.foot-top,.foot-bot').forEach(function(el){el.classList.add('rvs');Array.prototype.forEach.call(el.children,function(c,i){c.style.setProperty('--i',i)});io.observe(el)});
  $$('.feature,.nv-card').forEach(function(el){el.classList.add('rv');io.observe(el)});
  var v=$('.view');v.classList.add('rv','pre');v._in=function(){v.classList.add('in');skyIn()};io.observe(v);
  var r=$('#rows');r.classList.add('pre');r._in=function(){r.classList.remove('pre');r.classList.add('anim');setTimeout(function(){r.classList.remove('anim')},2600)};io.observe(r)}
// which parts are on screen: the hero and Your sky canvases draw only then, and CSS animations pause in blocks that are off screen
function watchVisible(){if(!('IntersectionObserver' in window)){skyOn=true;kick();return}var hero=$('.hero');
  var io=new IntersectionObserver(function(es){es.forEach(function(e){var on=e.isIntersecting;if(e.target===sc){skyOn=on;if(on)sizeSky()}e.target.classList.toggle('io-off',!on)});kick()},{rootMargin:'80px 0px'});
  // the hero's photo drifts while the hero is on screen
  new IntersectionObserver(function(es){es.forEach(function(e){hero.classList.toggle('io-off',!e.isIntersecting)})},{threshold:0}).observe(hero);
  if('ResizeObserver' in window){var hh=0;new ResizeObserver(function(){var n=hero.offsetHeight;if(n!==hh){hh=n;SF.hb=0;sizeHero();kick()}}).observe(hero)}
  [sc].concat($$('.view,.panel .sec-head,#rows,.feature,.site-foot')).forEach(function(el){io.observe(el)})}
/* boot */
var z0=store.get('radar.zip')||'33130',zc=store.get('radar.zipinfo'),o0=zc&&zc.zip===z0&&typeof zc.lat==='number'&&typeof zc.lon==='number'&&zc.city?zc:z0===ZIP0.zip?ZIP0:null;
function start(o){S.obs=o;$('#zipInput').value=o.zip;$('#zipInput').addEventListener('focus',function(){loadZips().then(null,function(){})});
var h0=(location.hash||'').slice(1);showTab(TABS.indexOf(h0)>=0?h0:'sky');setPlaying(!reduce);if(reduce)S.simT=Math.round(L0().end*.45);var F0=null;try{F0=JSON.parse($('#feeddata').textContent)}catch(e){}if(F0){[].concat(F0.launches||[],F0.recent||[]).forEach(function(x){if(x&&/^[A-Za-z0-9_-]{1,80}$/.test(x.id||''))PAGES[x.id]=1});applyFeed(F0)}pickWanted();sizeHero();refresh();setDataNote();loadLive();startPolling();setInterval(setDataNote,60000);tick();kick();initMotion();watchVisible();renderSpace();document.documentElement.classList.remove('dl');
window.addEventListener('offline',function(){offline(true)});
// the service worker (sw.js, written by the build next to the main page only): the shell, the photo and the last good launches.json for offline use
if('serviceWorker' in navigator&&document.querySelector('link[rel=manifest]')&&(location.protocol==='https:'||/^(localhost|127\.0\.0\.1)$/.test(location.hostname)))afterLoad(function(){navigator.serviceWorker.register('sw.js').catch(function(){});
  // the first visit's feed was fetched before the worker controlled the page: fetch it once more through it, so it keeps a copy for offline
  var keep=function(){if(LIVE.on)fetch('launches.json?_='+Date.now()).catch(function(){})};if(navigator.serviceWorker.controller)keep();else navigator.serviceWorker.addEventListener('controllerchange',function(){setTimeout(keep,500)},{once:true})});
window.addEventListener('online',function(){if(!LIVE.on){LIVE.err=null;loadLive()}else poll();var r=NWS[S.obs.zip];if(r&&!r.ok){delete NWS[S.obs.zip];loadWx(S.obs)}setDataNote();renderWx()});
window.addEventListener('offline',function(){setDataNote();renderWx()});
window.addEventListener('resize',function(){clearTimeout(window._rz);window._rz=setTimeout(function(){sizeHero();sizeSky()},120)});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){sizeSky();moveInk()});
}
if(o0){start(o0);afterLoad(function(){loadZips().then(function(){var i=findZip(z0);if(i>=0&&S.obs.zip===z0){var o=zipInfo(i);if(o.lat!==S.obs.lat||o.lon!==S.obs.lon||o.city!==S.obs.city){S.obs=o;refresh()}store.set('radar.zipinfo',S.obs)}},function(){})})}
else loadZips().then(function(){var i=findZip(z0);start(zipInfo(i<0?findZip('33130'):i))},function(){start(ZIP0)});
// read only hooks for tests/states.cjs (the data on show, a refresh, and the formatters), only with ?test in the address
if(QP.has('test'))window.__radar={launches:function(){return LAUNCHES},poll:poll,fmtDay:fmtDay,fmtTime:fmtTime,distTxt:distTxt};

})();
