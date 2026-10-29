/* Radar flight and visibility model: a modeled estimate of the flight path and of where a rocket can be seen from, not a prediction */
var ORB=(function(){
  var R=6371,D=Math.PI/180;
  var SITES={
    SLC40:{n:'SLC 40',full:'Space Launch Complex 40, Cape Canaveral SFS, Florida',lat:28.5618,lon:-80.5772,st:'FL'},
    LC39A:{n:'LC 39A',full:'Launch Complex 39A, Kennedy Space Center, Florida',lat:28.6082,lon:-80.6041,st:'FL'},
    LC36:{n:'LC 36',full:'Launch Complex 36, Cape Canaveral SFS, Florida',lat:28.4713,lon:-80.5378,st:'FL'},
    SLC41:{n:'SLC 41',full:'Space Launch Complex 41, Cape Canaveral SFS, Florida',lat:28.5833,lon:-80.5829,st:'FL'},
    SLC4E:{n:'SLC 4E',full:'Space Launch Complex 4E, Vandenberg SFB, California',lat:34.6321,lon:-120.6106,st:'CA'},
    STARBASE:{n:'Starbase',full:'Orbital Launch Pad, Starbase, Texas',lat:25.9972,lon:-97.1560,st:'TX'},
    WALLOPS:{n:'LC 2',full:'Launch Complex 2, Wallops Island, Virginia',lat:37.8338,lon:-75.4881,st:'VA'}
  };
  // [t s, alt km, downrange km, speed km/h]; downrange is the integral of the horizontal part of the speed column
  var PROF={
    F9:[[0,0,0,0],[20,1.2,0.8,350],[40,5,1.9,800],[60,11,4.2,1350],[78,15,10.6,1700],[100,26,17.6,2900],[130,46,45.4,5600],[155,66,89.2,8300],[175,80,133,8200],[200,96,191,9100],[260,126,362,11800],[330,152,619,14800],[420,176,1049,19600],[480,190,1408,23500],[530,199,1757,26800],[540,200,1832,27200]],
    FH:[[0,0,0,0],[20,1.1,0.7,330],[40,4.6,1.9,760],[60,10,4.3,1300],[80,15,11.1,1750],[150,58,79.7,7400],[180,78,142,8200],[210,100,210,9100],[270,132,382,11900],[340,160,647,15500],[430,185,1095,20400],[500,200,1536,25000],[560,210,1981,28400],[570,212,2061,29000]],
    NG:[[0,0,0,0],[20,1,0.7,300],[40,4.2,1.8,700],[60,9.5,3.8,1200],[85,15,12.3,1750],[130,40,39.6,4800],[180,72,126,8600],[200,84,174,8900],[260,118,337,11200],[340,150,622,14600],[440,178,1099,19800],[520,195,1595,24800],[580,205,2034,28000]],
    VUL:[[0,0,0,0],[20,1.3,0.8,380],[40,5.4,2.1,860],[60,12,4.4,1450],[80,17,11.9,1800],[120,40,36.5,4900],[170,72,122,8300],[300,128,495,12600],[400,165,915,17800],[500,190,1491,23700],[560,200,1918,27500]],
    SS:[[0,0,0,0],[30,1.8,1.5,420],[60,8,5.2,1150],[90,18,12.3,2100],[120,34,31.4,4200],[160,64,79.1,6000],[175,72,103,5900],[240,108,237,9600],[320,140,491,13400],[420,165,940,19000],[500,178,1418,24000],[520,180,1555,25500]],
    EL:[[0,0,0,0],[20,1.2,0.9,380],[40,5,2.5,900],[60,11,5.4,1500],[90,26,16.4,3200],[150,72,92.5,8000],[160,78,114,8100],[300,170,568,15800],[420,215,1210,22800],[530,250,1978,27500]],
    // New Shepard: straight up past the Karman line and back down, with only a few km of drift; the path follows the capsule
    NS:[[0,0,0,0],[20,1.2,0,330],[40,4.8,.1,900],[60,11,.2,1500],[90,25,.4,2600],[120,43,.7,3300],[141,56,1,3600],[165,72,1.3,2900],[200,89,1.6,1900],[245,106,1.9,30],[290,96,2.1,1600],[330,72,2.3,2900],[370,40,2.5,3300],[410,14,2.6,1200],[450,4,2.7,500],[520,1.2,2.8,60],[600,0,2.9,0]],
    // a generic two stage orbital climb, for vehicles without a profile of their own
    GEN:[[0,0,0,0],[20,1.1,.7,330],[40,4.6,1.9,780],[60,10.5,4.1,1300],[80,16,11,1750],[120,38,35,4600],[160,62,95,7200],[200,88,180,8800],[260,120,350,11500],[340,155,640,15200],[440,182,1120,20300],[520,198,1640,25200],[580,205,2060,28000]]
  };
  PROF.SUB=PROF.NS;  // other suborbital rockets fly the same straight up and down hop
  var EVENTS={
    F9:[[-180,'Go poll complete. Go for launch'],[-60,'Startup. Flight computer in control'],[-3,'Engine ignition sequence'],[0,'Liftoff'],[78,'Max Q'],[155,'MECO'],[159,'Stage separation'],[167,'Second stage ignition'],[195,'Fairing separation'],[392,'First stage landing burn'],[540,'SECO. Orbit reached']],
    FH:[[-180,'Go poll complete. Go for launch'],[-3,'Engine ignition sequence'],[0,'Liftoff'],[80,'Max Q'],[150,'Booster engine cutoff'],[154,'Side boosters separate'],[180,'MECO'],[184,'Stage separation'],[215,'Fairing separation'],[460,'Side booster landings'],[570,'SECO. Orbit reached']],
    NG:[[-180,'Go poll complete. Go for launch'],[-5,'BE-4 ignition'],[0,'Liftoff'],[85,'Max Q'],[180,'Main engine cutoff'],[184,'Stage separation'],[192,'Upper stage ignition'],[230,'Fairing separation'],[560,'Booster landing on ship'],[580,'Upper stage cutoff']],
    VUL:[[-180,'Go poll complete. Go for launch'],[-4,'BE-4 ignition'],[0,'Liftoff'],[80,'Max Q'],[100,'Solid boosters jettison'],[300,'Booster engine cutoff'],[306,'Stage separation'],[316,'Centaur ignition'],[560,'Centaur cutoff. Orbit reached']],
    SS:[[-180,'Go poll complete. Go for launch'],[-5,'Raptor ignition'],[0,'Liftoff'],[62,'Max Q'],[160,'Hot staging'],[175,'Ship engines at full thrust'],[240,'Booster boostback'],[420,'Booster splashdown attempt'],[520,'Ship engine cutoff']],
    EL:[[-120,'Go for launch'],[-2,'Rutherford ignition'],[0,'Liftoff'],[70,'Max Q'],[150,'MECO'],[154,'Stage separation'],[157,'Second stage ignition'],[180,'Fairing separation'],[530,'Second stage cutoff']],
    NS:[[-120,'Go for launch'],[-7,'BE 3PM ignition'],[0,'Liftoff'],[60,'Max Q'],[141,'Main engine cutoff'],[165,'Capsule separation'],[245,'Apogee'],[440,'Booster landing'],[600,'Capsule touchdown']],
    SUB:[[-60,'Go for launch'],[0,'Liftoff'],[60,'Max Q'],[141,'Main engine cutoff'],[165,'Payload separation'],[245,'Apogee'],[600,'Payload landing']],
    GEN:[[-180,'Go poll complete. Go for launch'],[-5,'Engine ignition sequence'],[0,'Liftoff'],[80,'Max Q'],[160,'Main engine cutoff'],[164,'Stage separation'],[172,'Upper stage ignition'],[200,'Fairing separation'],[580,'Upper stage cutoff. Orbit reached']]
  };
  // key flight events read from EVENTS, so the hero animation stays in step with the event times above
  function staging(v){
    var ev=EVENTS[v]||EVENTS.GEN,o={};
    ev.forEach(function(e){var t=e[0],n=e[1];if(t<=0)return;
      if(/side boosters? separate/i.test(n))o.side=t;
      else if(/solid boosters/i.test(n))o.srb=t;
      else if(/hot staging/i.test(n)){o.hot=t;o.sep=t}
      else if(/(capsule|payload) separation/i.test(n)){o.sep=t;o.solo=true}
      else if(/stage separation/i.test(n))o.sep=t;
      else if(/^(MECO|main engine cutoff|booster engine cutoff)/i.test(n))o.meco=t;
      else if(/(second|upper) stage ignition|centaur ignition/i.test(n))o.ign2=t;
      else if(/boostback/i.test(n))o.bb=t;
      else if(/landing|splashdown/i.test(n)&&o.land==null)o.land=t});
    if(o.sep==null)o.sep=150;
    if(o.hot){o.meco=o.hot;o.ign2=o.hot}
    if(o.meco==null)o.meco=o.sep-4;
    // a single stage hop (New Shepard) has no upper stage to light
    if(o.ign2==null)o.ign2=o.solo?1e9:o.sep+6;
    return o;
  }
  function interp(prof,t){
    if(t<=0)return [0,0,0];var L=prof.length;if(t>=prof[L-1][0]){var p=prof[L-1];return [p[1],p[2],p[3]]}
    for(var i=1;i<L;i++){if(t<=prof[i][0]){var a=prof[i-1],b=prof[i],f=(t-a[0])/(b[0]-a[0]);return [a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f,a[3]+(b[3]-a[3])*f]}}
  }
  function dest(lat,lon,az,dkm){var d=dkm/R,p1=lat*D,l1=lon*D,a=az*D;var p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(a));var l2=l1+Math.atan2(Math.sin(a)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2));return [p2/D,l2/D]}
  function ecef(lat,lon,h){var p=lat*D,l=lon*D,r=R+h;return [r*Math.cos(p)*Math.cos(l),r*Math.cos(p)*Math.sin(l),r*Math.sin(p)]}
  function look(oLat,oLon,tLat,tLon,tH){
    var o=ecef(oLat,oLon,0),t=ecef(tLat,tLon,tH),dx=t[0]-o[0],dy=t[1]-o[1],dz=t[2]-o[2];var p=oLat*D,l=oLon*D;
    var e=-Math.sin(l)*dx+Math.cos(l)*dy,n=-Math.sin(p)*Math.cos(l)*dx-Math.sin(p)*Math.sin(l)*dy+Math.cos(p)*dz,u=Math.cos(p)*Math.cos(l)*dx+Math.cos(p)*Math.sin(l)*dy+Math.sin(p)*dz;
    var rng=Math.sqrt(e*e+n*n+u*u);return {az:(Math.atan2(e,n)/D+360)%360,el:Math.asin(u/rng)/D,range:rng}
  }
  // The sun: right ascension, declination and sidereal time for one instant (low precision formulas of the Astronomical Almanac, about 0.01 degrees),
  // so the observer's sun and the rocket's sun are worked out from one set of numbers
  function sunPos(date){
    var jd=date.getTime()/86400000+2440587.5,n=jd-2451545.0;var L=(280.46+0.9856474*n)%360,g=((357.528+0.9856003*n)%360)*D;
    var lam=(L+1.915*Math.sin(g)+0.02*Math.sin(2*g))*D,eps=(23.439-0.0000004*n)*D;
    return {dec:Math.asin(Math.sin(eps)*Math.sin(lam)),ra:Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam)),gmst:(18.697374558+24.06570982441908*n)%24};
  }
  function elOf(lat,lon,s){var ha=(s.gmst*15+lon)*D-s.ra;return Math.asin(Math.sin(lat*D)*Math.sin(s.dec)+Math.cos(lat*D)*Math.cos(s.dec)*Math.cos(ha))/D}
  function sunEl(lat,lon,date){return elOf(lat,lon,sunPos(date))}
  function sunAz(lat,lon,date){
    var s=sunPos(date),ha=(s.gmst*15+lon)*D-s.ra;
    return (Math.atan2(-Math.sin(ha),Math.tan(s.dec)*Math.cos(lat*D)-Math.sin(lat*D)*Math.cos(ha))/D+360)%360;
  }
  // find time (ms) near date when sun crosses elevation e0; dir +1 rising, -1 setting; search within +-14h
  function sunCross(lat,lon,date,e0,dir){
    var t0=date.getTime(),best=null;
    for(var m=-14*60;m<=14*60;m+=4){var a=sunEl(lat,lon,new Date(t0+m*60000))-e0,b=sunEl(lat,lon,new Date(t0+(m+4)*60000))-e0;
      if((dir>0&&a<0&&b>=0)||(dir<0&&a>0&&b<=0)){var tt=t0+(m+4*Math.abs(a)/(Math.abs(a)+Math.abs(b)))*60000;if(best===null||Math.abs(tt-t0)<Math.abs(best-t0))best=tt}}
    return best;
  }
  function subsolar(date){var s=sunPos(date);return {lat:s.dec/D,lon:(((s.ra/D-s.gmst*15)%360)+540)%360-180}}
  // Height (km) of the Earth's shadow above a spot where the sun is s degrees above the horizon: with the sun d degrees below it, a ray grazing the
  // ground at the horizon passes R*(1/cos d - 1) above that spot. Sunlight reaches anything higher than this; 0 while the sun is up. Geometric, so it
  // ignores refraction (which lets the shadow edge sit a little lower), the safe side for saying "sunlit".
  function shadowFromEl(s){return s>=0?0:R*(1/Math.cos(-s*D)-1)}
  function shadowH(lat,lon,date){return shadowFromEl(sunEl(lat,lon,date))}
  // build track for a launch
  function track(L,step){
    step=step||2;var prof=PROF[L.v],site=SITES[L.site],end=prof[prof.length-1][0],pts=[];
    for(var t=0;t<=end;t+=step){var s=interp(prof,t),g=dest(site.lat,site.lon,L.az,s[1]);pts.push({t:t,h:s[0],dr:s[1],v:s[2],lat:g[0],lon:g[1]})}
    return pts;
  }

  /* ===== where to look: can this rocket be seen from here? =====
     A modeled estimate, not a prediction. Five things decide it, and each is worked out for every second of the flight:
     1. Geometry: the rocket must clear the horizon. Earth's curvature is in look() (a 100 km high rocket 1,000 km away is only a few degrees up).
        Under MINEL degrees trees, buildings, hills and haze hide it.
     2. Sun: the rocket is lit when it is above the Earth's shadow at the spot below it (shadowFromEl), using the sun at THAT second, not at liftoff.
        The sky is bright, twilight or dark from the sun at the observer at that second.
     3. Brightness, which sets how far away it can be seen (RANGE): a white trail in daylight, a plume lit by the sun against a darker sky (the
        twilight "jellyfish", seen to about 800 km), or only engine glow in the shade, which fades quickly with distance and is shortest for the upper stage.
     4. Distance and angle set the rating inside what is visible at all: Excellent needs a view at least 30 degrees up, within 150 km and long; Great 18 degrees
        and 250 km; Good 10 degrees and 400 km; anything lower or farther is a Low view. A daylight trail is rated one step lower, and "hard to spot" past 150 km.
     5. Time: a view that lasts seconds is not rated like one that lasts a minute.
     The numbers come from documented sightings (tests/visibility.test.mjs lists each source). Where the evidence is thin the choice is the cautious
     one: a false "Excellent view" is worse than a false "Low view". */
  var MINEL=3;                 // degrees above the horizon
  var RANGE={day:200,lit:800,nightFirst:400,nightUpper:250,glowTwilight:150}; // farthest km, see the list above
  var VSCALE={EL:.6,NS:.35,SUB:.35};  // smaller rockets are fainter; bigger ones are not credited with more than the F9 sized default (cautious)
  var NIGHT=-6,DAYS=0;                // observer sun elevation: above 0 is day; under -6 the sky is dark enough for engine glow to stand out
  function skyOf(sun){return sun>DAYS?'day':sun>NIGHT?'twilight':'dark'}
  function visibility(L,trk,oLat,oLon){
    var date=new Date(L.utc),t0=date.getTime(),sc=VSCALE[L.v]||1,st=staging(L.v),meco=st.meco,samples=[],best=null,first=null,last=null,nvis=0,step=trk.length>1?trk[1].t-trk[0].t:2;
    var near=1e9,above=false;
    for(var i=0;i<trk.length;i++){
      var p=trk[i],lk=look(oLat,oLon,p.lat,p.lon,p.h),sp=sunPos(new Date(t0+p.t*1000)),so=elOf(oLat,oLon,sp),sr=elOf(p.lat,p.lon,sp),lit=p.h>shadowFromEl(sr)+3,sky=skyOf(so),cap,reg;
      if(sky==='day'){cap=RANGE.day;reg='day'}
      else if(lit){cap=RANGE.lit;reg='lit'}
      else if(sky==='twilight'){cap=RANGE.glowTwilight;reg='glow'}
      else{cap=p.t<=meco?RANGE.nightFirst:RANGE.nightUpper;reg='glow'}
      // a single stage hop (New Shepard) has no burning stage after cutoff, so in the shade there is nothing to see
      if(reg==='glow'&&st.solo&&p.t>meco)cap=0;
      cap*=sc;
      var up=lk.el>=MINEL;if(up){above=true;if(lk.range<near)near=lk.range}
      var vis=up&&lk.range<=cap,sco=0;
      if(vis){var es=lk.el>=30?4:lk.el>=18?3:lk.el>=10?2:1,rs=lk.range<=150?4:lk.range<=250?3:lk.range<=400?2:1;sco=Math.min(es,rs);if(reg==='day')sco=lk.range>150?1:Math.max(1,sco-1);
        nvis++;if(first===null)first=p.t;last=p.t}
      samples.push({t:p.t,az:lk.az,el:lk.el,range:lk.range,h:p.h,lit:lit,sun:so,sky:sky,reg:reg,cap:cap,vis:vis,score:sco});
      if(vis&&(!best||sco>best.score||(sco===best.score&&lk.el>best.el)))best={t:p.t,az:lk.az,el:lk.el,range:lk.range,h:p.h,lit:lit,sun:so,sky:sky,reg:reg,cap:cap,score:sco};
    }
    var visSec=nvis*step,score=best?best.score:0,capBy=null;
    if(best){var raw=score;
      // a view that lasts seconds is not a good view, however high it gets
      if(visSec<20)score=Math.min(score,1);else if(visSec<45)score=Math.min(score,2);
      if(score<raw)capBy='short';else if(best.reg==='day')capBy='day';else if(best.range>300)capBy='distance';else if(best.el<=12)capBy='low'}
    var sunObs=sunEl(oLat,oLon,date),day=best?best.sky==='day':skyOf(sunObs)==='day';
    var rating='Not visible';
    if(best){rating=score>=4?'Excellent':score===3?'Great':score===2?'Good':'Low view';
      if(best.sky==='day'){rating=score>=2?'Daytime, look for the trail':'Daytime, hard to spot'}}
    var firstS=null;if(first!==null){for(var j=0;j<samples.length;j++){if(samples[j].t>=first){firstS=samples[j];break}}}
    // "twilight jellyfish": a dark sky and a rocket high in sunlight, at the best moment
    var jelly=best&&best.sky!=='day'&&best.lit&&best.sun<=-3?'High':best&&best.sky==='dark'?'Low':'None';
    return {samples:samples,best:best,first:first,last:last,dur:first!==null?last-first:0,visSec:visSec,rating:rating,score:score,capBy:capBy,jelly:jelly,sunObs:sunObs,firstS:firstS,
      dark:skyOf(sunObs)==='dark',day:day,sunlit:!!(best&&best.lit),why:best?null:(above?'far':'below'),nearest:above?near:null};
  }
  function maxEl(trk,oLat,oLon){var m=-90;for(var i=0;i<trk.length;i++){var p=trk[i],lk=look(oLat,oLon,p.lat,p.lon,p.h);if(lk.range<RANGE.dark&&lk.el>m)m=lk.el}return m}
  function dir16(b){return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(b/22.5)%16]}
  function dist(a1,o1,a2,o2){var dl=(a2-a1)*D,dn=(o2-o1)*D;var a=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a1*D)*Math.cos(a2*D)*Math.sin(dn/2)*Math.sin(dn/2);return 2*R*Math.asin(Math.sqrt(a))}
  return {SITES:SITES,PROF:PROF,EVENTS:EVENTS,RANGE:RANGE,MINEL:MINEL,staging:staging,interp:interp,track:track,visibility:visibility,maxEl:maxEl,look:look,sunEl:sunEl,sunAz:sunAz,sunPos:sunPos,skyOf:skyOf,sunCross:sunCross,shadowH:shadowH,shadowFromEl:shadowFromEl,dir16:dir16,dist:dist,dest:dest,subsolar:subsolar};
})();
if(typeof module!=='undefined')module.exports=ORB;
