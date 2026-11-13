/* The Look Up card on a launch page (docs/LOOKUP.md section 3): Yes, Maybe or No from a ZIP code, with the reason, the direction to face,
   how high to look, the time window, clouds and the sound delay. The ZIP is typed (never GPS) or the home ZIP saved on the radar
   (radar.zipinfo, this browser only). The verdict is ORB.lookUp from model.js (loaded before this file), the same rule the radar uses;
   the ZIP table is the site's own zips.json (fetched only when a ZIP is typed that is not the saved one), clouds the National Weather
   Service forecast for the ZIP at launch time. Distances use the site's one rule (whole miles and km, rounded half up). Nothing here is
   stored except a typed ZIP, kept as the home ZIP like the radar's own ZIP box does. */
(function(){
  var data=document.getElementById('luData'),out=document.getElementById('luOut'),form=document.getElementById('luForm'),inp=document.getElementById('luZip'),zv=document.getElementById('zipv');
  if(!data||!out||!form||typeof ORB==='undefined')return;
  var L;try{L=JSON.parse(data.textContent)}catch(e){return}
  if(!L||!ORB.PROF[L.v]||!isFinite(L.lat)||!isFinite(L.lon)||!isFinite(Date.parse(L.utc)))return;
  ORB.SITES['lu']={lat:L.lat,lon:L.lon};
  var LL={id:L.id,v:L.v,az:L.az,utc:L.utc,site:'lu'},trk=null,ZP=null,Z=null;
  var DIRW={N:'north',NNE:'north northeast',NE:'northeast',ENE:'east northeast',E:'east',ESE:'east southeast',SE:'southeast',SSE:'south southeast',S:'south',SSW:'south southwest',SW:'southwest',WSW:'west southwest',W:'west',WNW:'west northwest',NW:'northwest',NNW:'north northwest'};
  function grp(n){return String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',')}
  function distTxt(km){return grp(Math.round(km*0.621371))+' mi ('+grp(Math.round(km))+' km)'}
  function el(tag,cls,txt){var x=document.createElement(tag);if(cls)x.className=cls;if(txt!=null)x.textContent=txt;return x}
  function clock(ms){return new Date(ms).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit',second:'2-digit'})}
  function zone(ms){try{return new Date(ms).toLocaleTimeString(undefined,{timeZoneName:'short'}).split(' ').pop()}catch(e){return ''}}
  function undelta(s){var o=[],p=0,a=s.split(',');for(var i=0;i<a.length;i++){p+=parseInt(a[i],36);o.push(p)}return o}
  function zips(){if(ZP)return ZP;ZP=fetch('/zips.json').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){if(j.v===2){j.z=undelta(j.z).map(function(n){return String(n).padStart(5,'0')}).join('');j.a=undelta(j.a);j.o=undelta(j.o);j.c=undelta(j.c)}Z=j;return j});ZP.then(null,function(){ZP=null});return ZP}
  function find(code){var lo=0,hi=Z.a.length-1;while(lo<=hi){var m=(lo+hi)>>1,v=Z.z.substr(m*5,5);if(v===code)return m;if(v<code)lo=m+1;else hi=m-1}return -1}
  function place(code){return zips().then(function(){var i=find(code);if(i<0)return null;var nm=Z.n[Z.c[i]];return {zip:code,lat:Z.a[i]/100,lon:Z.o[i]/100,city:nm.split(',')[0]}})}
  // clouds: the NWS sky cover forecast (percent) at liftoff; null when the forecast does not reach that far or the service fails
  var WX={};
  function clouds(o){var k=o.zip;if(WX[k])return WX[k];var t=Date.parse(L.utc),opt={headers:{Accept:'application/geo+json'}};
    WX[k]=fetch('https://api.weather.gov/points/'+o.lat.toFixed(4)+','+o.lon.toFixed(4),opt).then(function(r){if(!r.ok)throw 0;return r.json()})
      .then(function(j){return fetch(j.properties.forecastGridData,opt)}).then(function(r){if(!r.ok)throw 0;return r.json()})
      .then(function(j){var v=((j.properties.skyCover||{}).values)||[];for(var i=0;i<v.length;i++){var p=String(v[i].validTime).split('/'),s=Date.parse(p[0]),m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(p[1]||''),d=m?((+m[1]||0)*86400+(+m[2]||0)*3600+(+m[3]||0)*60)*1000:3600000;
        if(t>=s&&t<s+d&&typeof v[i].value==='number')return v[i].value}return null})
      .catch(function(){return null});return WX[k]}
  function row(list,k,v){var li=el('li');li.appendChild(el('span',null,k));li.appendChild(el('b',null,v));list.appendChild(li)}
  function render(o,c,state){
    if(!trk)trk=ORB.track(LL,2);
    var v=ORB.visibility(LL,trk,o.lat,o.lon),padKm=ORB.dist(o.lat,o.lon,L.lat,L.lon),r=ORB.lookUp(v,c,padKm),t0=Date.parse(L.utc);
    out.textContent='';
    var head=el('p','lu-v lu-'+r.verdict.toLowerCase());head.appendChild(el('b',null,r.verdict));head.appendChild(document.createTextNode(' from '+o.zip+(o.city?' ('+o.city+')':'')));out.appendChild(head);
    out.appendChild(el('p','lu-r',r.reason));
    var ul=el('ul','lu-f');
    if(r.best){
      row(ul,'Face',DIRW[r.dir]+', '+r.az+'°');
      var fists=Math.max(1,Math.round(r.el/10));row(ul,'Look up',r.el+'° above the horizon, about '+fists+(fists>1?' fists':' fist')+' at arm’s length');
      row(ul,'When',r.from!=null&&r.to!=null&&r.to>r.from?clock(t0+r.from*1000)+' to '+clock(t0+r.to*1000)+' '+zone(t0)+', best at '+clock(t0+r.at*1000):'Best at '+clock(t0+r.at*1000)+' '+zone(t0));
      if(r.jelly==='High')row(ul,'Twilight','Good chance of a glowing plume: the rocket is in sunlight while your sky is dark');
    }
    row(ul,'Clouds',state==='wait'?'Checking the forecast…':r.cloudsKnown?r.clouds+' percent sky cover forecast at liftoff (National Weather Service)':'Not counted: no forecast for that time yet');
    row(ul,'Distance','The pad is '+distTxt(padKm)+' away, to the '+DIRW[ORB.dir16(ORB.look(o.lat,o.lon,L.lat,L.lon,0).az)]);
    row(ul,'Sound',r.sound?'You’ll hear it about '+r.sound+' seconds after you see it':'Too far to hear it');
    out.appendChild(ul);
  }
  function run(o){render(o,null,'wait');clouds(o).then(function(c){render(o,c)})}
  function bad(msg){out.textContent='';out.appendChild(el('p','lu-v lu-none',msg))}
  form.addEventListener('submit',function(ev){ev.preventDefault();var code=(inp.value||'').replace(/\D/g,'');
    if(!/^\d{5}$/.test(code)){bad('Enter a five digit US ZIP code.');inp.focus();return}
    bad('Looking up '+code+'…');
    place(code).then(function(o){if(!o){bad('ZIP '+code+' is not in our table. Try a nearby one.');return}
      try{localStorage.setItem('radar.zip',code);localStorage.setItem('radar.zipinfo',JSON.stringify({zip:o.zip,lat:o.lat,lon:o.lon,city:o.city}))}catch(e){}
      if(zv)zv.hidden=true;run(o)},function(){bad(navigator.onLine===false?'You are offline, so the ZIP table cannot load.':'The ZIP table did not load. Try again.')})});
  var z;try{z=JSON.parse(localStorage.getItem('radar.zipinfo'))}catch(e){}
  if(z&&typeof z.lat==='number'&&typeof z.lon==='number'&&/^\d{5}$/.test(z.zip||'')){inp.value=z.zip;run({zip:z.zip,lat:z.lat,lon:z.lon,city:(z.city||'').split(',')[0]});if(zv)zv.hidden=false}
})();
