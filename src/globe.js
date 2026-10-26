/* ===== globe hero: a night Earth centered on any launch pad, with the real flight path ===== */
var DG=Math.PI/180;
var CITIES=[[19.4,-99.1,1],[20.7,-103.3,.6],[25.7,-100.3,.6],[43.7,-79.4,.9],[45.5,-73.6,.7],[49.3,-123.1,.6],[51,-114,.5],[23.1,-82.4,.6],[14.6,-90.5,.5],[4.7,-74.1,.9],[-12,-77,.9],[-33.4,-70.7,.8],[-34.6,-58.4,1],[-23.5,-46.6,1],[-22.9,-43.2,.9],[-15.8,-47.9,.6],[10.5,-66.9,.7],[-0.2,-78.5,.5],[6.2,-75.6,.6],[-3.7,-38.5,.6],[-8,-34.9,.6],[-19.9,-43.9,.6],[-30,-51.2,.6],[-34.9,-56.2,.5],
[6.5,3.4,1],[30,31.2,1],[-26.2,28,.9],[-33.9,18.4,.6],[-1.3,36.8,.6],[9,38.7,.5],[-4.3,15.3,.7],[-8.8,13.2,.5],[5.6,-0.2,.6],[33.6,-7.6,.6],[36.7,3.1,.6],[36.8,10.2,.4],[15.6,32.5,.5],[-6.8,39.3,.5],[5.3,-4,.5],[14.7,-17.5,.4],[12,8.5,.5],
[51.5,-0.1,1],[48.9,2.35,1],[40.4,-3.7,.8],[41.4,2.2,.6],[41.9,12.5,.7],[45.5,9.2,.8],[52.5,13.4,.8],[50.1,8.7,.7],[52.4,4.9,.7],[50.8,4.4,.6],[48.2,16.4,.6],[52.2,21,.6],[50.1,14.4,.5],[47.5,19,.5],[44.4,26.1,.5],[38,23.7,.6],[41,29,1],[50.5,30.5,.6],[55.8,37.6,1],[59.9,30.3,.7],[59.3,18.1,.5],[59.9,10.7,.4],[60.2,24.9,.4],[55.7,12.6,.5],[38.7,-9.1,.5],[53.3,-6.3,.4],[53.5,-2.2,.6],
[35.7,51.4,.9],[33.3,44.4,.7],[24.7,46.7,.8],[21.5,39.2,.6],[25.2,55.3,.7],[25.3,51.5,.4],[29.4,48,.5],[32.1,34.8,.6],[31.9,35.9,.4],[24.9,67,.9],[31.5,74.3,.8],[28.6,77.2,1],[19.1,72.9,1],[13,77.6,.8],[13.1,80.3,.8],[22.6,88.4,.9],[17.4,78.5,.8],[23,72.6,.7],[18.5,73.9,.6],[23.8,90.4,.9],[6.9,79.9,.4],[27.7,85.3,.4],
[13.8,100.5,.9],[10.8,106.7,.8],[21,105.8,.6],[-6.2,106.8,1],[-7.3,112.7,.6],[14.6,121,.9],[1.35,103.8,.7],[3.1,101.7,.6],
[39.9,116.4,1],[31.2,121.5,1],[23.1,113.3,.9],[22.5,114.1,.8],[30.7,104.1,.8],[29.6,106.5,.7],[30.6,114.3,.7],[34.3,109,.6],[39.1,117.2,.7],[22.3,114.2,.7],[32.1,118.8,.7],[30.3,120.2,.7],[41.8,123.4,.6],[45.8,126.6,.5],[25,121.5,.7],[37.6,127,1],[35.2,129,.6],
[35.7,139.7,1],[34.7,135.5,.9],[35.2,136.9,.7],[33.6,130.4,.5],[43.1,141.4,.4],[-33.9,151.2,.8],[-37.8,145,.7],[-27.5,153,.5],[-32,115.9,.4],[-36.9,174.8,.4],[55,82.9,.4],[43.2,76.9,.4],[41.3,69.3,.5],[40.4,49.9,.4]];
function gv(lat,lon){var p=lat*DG,l=lon*DG;return [Math.cos(p)*Math.cos(l),Math.cos(p)*Math.sin(l),Math.sin(p)]}
function gdot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function gcross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function gnorm(a){var m=Math.sqrt(gdot(a,a))||1;return [a[0]/m,a[1]/m,a[2]/m]}
function nh(x,y,z){var n=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(z,1274126177);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296}
function vn(x,y,z){var xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),fx=x-xi,fy=y-yi,fz=z-zi,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),w=fz*fz*(3-2*fz);
  var a=nh(xi,yi,zi),b=nh(xi+1,yi,zi),c=nh(xi,yi+1,zi),d=nh(xi+1,yi+1,zi),e=nh(xi,yi,zi+1),f=nh(xi+1,yi,zi+1),g=nh(xi,yi+1,zi+1),h=nh(xi+1,yi+1,zi+1);
  var x1=a+(b-a)*u,x2=c+(d-c)*u,x3=e+(f-e)*u,x4=g+(h-g)*u,y1=x1+(x2-x1)*v,y2=x3+(x4-x3)*v;return y1+(y2-y1)*w}
function fbm(x,y,z){return (vn(x,y,z)*.5+vn(x*2.1,y*2.1,z*2.1)*.25+vn(x*4.3,y*4.3,z*4.3)*.125)/.875}
var GCACHE=null;
function globeFor(L){
  var key=L.id+'|'+Math.round(HW)+'x'+Math.round(HH);if(GCACHE&&GCACHE.key===key)return GCACHE;
  try{GCACHE=buildGlobe(L,key)}catch(e){GCACHE=null}return GCACHE}
function buildGlobe(L,key){
  var site=L.siteObj,W=Math.ceil(HW),H=Math.ceil(HH),small=HW<700;
  var R=small?Math.max(H*1.05,W*1.25):Math.max(H*1.3,W*.62),dAng=49;
  var padV=gv(site.lat,site.lon),az=L.az;
  var cc=ORB.dest(site.lat,site.lon,(az+140)%360,dAng/DG*0+dAng*111.19);   // surface point 49 degrees away, behind and to the side of the pad
  var zc=gv(cc[0],cc[1]),yc=gnorm([padV[0]-gdot(padV,zc)*zc[0],padV[1]-gdot(padV,zc)*zc[1],padV[2]-gdot(padV,zc)*zc[2]]),xc=gcross(yc,zc);
  var ang=Math.acos(Math.max(-1,Math.min(1,gdot(padV,zc))));
  var cx=small?W*.5:W*.64,cy=H*(small?.74:.70)+R*Math.sin(ang);
  var ss=ORB.subsolar(new Date(L.utc)),sunE=gv(ss.lat,ss.lon),sv=[gdot(sunE,xc),gdot(sunE,yc),gdot(sunE,zc)];
  var q=.5,w=Math.ceil(W*q),h=Math.ceil(H*q),base=document.createElement('canvas');base.width=w;base.height=h;
  var bx=base.getContext('2d'),img=bx.createImageData(w,h),px=img.data;
  for(var j=0;j<h;j++){var Y=(j+.5)/q,sy=(cy-Y)/R;if(sy>1.001||sy<-1.001)continue;
    for(var i=0;i<w;i++){var X=(i+.5)/q,sx=(X-cx)/R,r2=sx*sx+sy*sy;if(r2>=1.006)continue;var sz=Math.sqrt(Math.max(0,1-r2)),d=sx*sv[0]+sy*sv[1]+sz*sv[2];
      var wx=sx*xc[0]+sy*yc[0]+sz*zc[0],wy=sx*xc[1]+sy*yc[1]+sz*zc[1],wz=sx*xc[2]+sy*yc[2]+sz*zc[2];
      var cl=fbm(wx*2.6+7,wy*2.6+3,wz*2.6+11);cl=Math.max(0,Math.min(1,(cl-.5)*2.7));
      var lit=Math.max(0,Math.min(1,(d+.06)/.5));lit=lit*lit*(3-2*lit);
      var tw=Math.exp(-Math.pow((d-.02)/.11,2));
      var rr=5+(20-5)*lit+cl*(lit*150+9)+tw*34,gg=8+(54-8)*lit+cl*(lit*155+13)+tw*16,bb=19+(112-19)*lit+cl*(lit*160+24)+tw*26;
      var o=(j*w+i)*4;px[o]=rr>255?255:rr;px[o+1]=gg>255?255:gg;px[o+2]=bb>255?255:bb;px[o+3]=255}}
  bx.putImageData(img,0,0);
  var cv=document.createElement('canvas');cv.width=W;cv.height=H;var g=cv.getContext('2d');g.fillStyle='#02040A';g.fillRect(0,0,W,H);
  // stars outside the disk
  var rs=rng(hstr(key));for(var s=0;s<320;s++){var X2=rs()*W,Y2=rs()*H*.8,dx=X2-cx,dy=Y2-cy;if(dx*dx+dy*dy<R*R*1.03)continue;g.globalAlpha=.25+rs()*.7;g.fillStyle=rs()<.15?'#B9A8FF':'#fff';var sz2=rs()<.9?1:1.7;g.fillRect(X2,Y2,sz2,sz2)}g.globalAlpha=1;
  g.imageSmoothingEnabled=true;g.save();g.beginPath();g.arc(cx,cy,R,0,6.283);g.clip();g.drawImage(base,0,0,W,H);g.restore();
  function P(lat,lon,hk,ex){var v=gv(lat,lon),r=1+(hk||0)*(ex||1)/6371;var sx=r*gdot(v,xc),sy=r*gdot(v,yc),sz=r*gdot(v,zc);return [cx+R*sx,cy-R*sy,sz,sx*sx+sy*sy,gdot(v,sunE)]}
  // atmosphere on the limb
  var ag=g.createRadialGradient(cx,cy,R*.965,cx,cy,R*1.07);ag.addColorStop(0,'rgba(120,170,255,0)');ag.addColorStop(.3,'rgba(150,195,255,.5)');ag.addColorStop(.45,'rgba(135,170,255,.32)');ag.addColorStop(1,'rgba(90,110,255,0)');
  g.save();g.globalCompositeOperation='lighter';g.fillStyle=ag;g.beginPath();g.arc(cx,cy,R*1.07,0,6.283);g.fill();g.restore();
  // graticule
  g.save();g.strokeStyle='rgba(160,180,255,.08)';g.lineWidth=1;g.beginPath();
  for(var la=-75;la<=75;la+=15){var pen=false;for(var lo=-180;lo<=180;lo+=3){var p=P(la,lo);if(p[2]>0){if(pen)g.lineTo(p[0],p[1]);else{g.moveTo(p[0],p[1]);pen=true}}else pen=false}}
  for(var lo2=-180;lo2<180;lo2+=15){var pen2=false;for(var la2=-84;la2<=84;la2+=3){var p2=P(la2,lo2);if(p2[2]>0){if(pen2)g.lineTo(p2[0],p2[1]);else{g.moveTo(p2[0],p2[1]);pen2=true}}else pen2=false}}
  g.stroke();g.restore();
  // city lights on the night side: every US ZIP code, plus major world cities
  var tws=[];g.save();g.globalCompositeOperation='lighter';
  function glow(lat,lon,rad,a){var p=P(lat,lon);if(p[2]<=.03||p[4]>.07)return;var f=Math.min(1,(.07-p[4])/.14),gr=g.createRadialGradient(p[0],p[1],0,p[0],p[1],rad);gr.addColorStop(0,'rgba(255,190,120,'+(a*f)+')');gr.addColorStop(1,'rgba(255,150,80,0)');g.fillStyle=gr;g.fillRect(p[0]-rad,p[1]-rad,rad*2,rad*2)}
  function lamp(lat,lon,a,sz){var p=P(lat,lon);if(p[2]<=.03||p[4]>.07)return null;var f=Math.min(1,(.07-p[4])/.14);g.fillStyle='rgba(255,196,128,'+(a*f)+')';g.fillRect(p[0],p[1],sz,sz);return p}
  for(var zi=0;zi<NZ;zi++)lamp(Z.a[zi]/100,Z.o[zi]/100,.2,1.3);
  var rc=rng(hstr(key+'c'));
  CITIES.forEach(function(c){var n=Math.round(40+150*c[2]),sg=.22+.4*c[2],cl2=Math.cos(c[0]*DG)||1;glow(c[0],c[1],8+16*c[2],.16+.1*c[2]);for(var k=0;k<n;k++){var u1=rc()+rc()+rc()-1.5,u2=rc()+rc()+rc()-1.5;lamp(c[0]+u1*sg,c[1]+u2*sg/cl2,.22,1.1)}
    var pc=lamp(c[0],c[1],.5,2);if(pc&&c[2]>=.7)tws.push([pc[0],pc[1],rc()*6.283])});
  for(var tz=0;tz<NZ&&tws.length<190;tz+=Math.max(1,Math.floor(NZ/90))){var pz=P(Z.a[tz]/100,Z.o[tz]/100);if(pz[2]>.05&&pz[4]<.0)tws.push([pz[0],pz[1],rc()*6.283])}
  g.restore();
  var trk=L.trk,end=L.end,EX=2.4;
  function at(k){var t=Math.max(0,Math.min(1,k))*end,i=Math.min(trk.length-2,Math.floor(t/2)),a=trk[i],b=trk[i+1],f=t/2-i;var p=P(a.lat+(b.lat-a.lat)*f,a.lon+(b.lon-a.lon)*f,a.h+(b.h-a.h)*f,EX);return [p[0],p[1]]}
  var pp=P(site.lat,site.lon);
  return {key:key,cv:cv,pad:[pp[0],pp[1]],at:at,tw:tws}}
function globeTwinkle(G,t){hx.save();hx.globalCompositeOperation='lighter';for(var i=0;i<G.tw.length;i++){var q=G.tw[i],a=reduce?.35:.3+.3*Math.sin(t*(1.2+(i%7)*.25)+q[2]);if(a<.15)continue;var gr=hx.createRadialGradient(q[0],q[1],0,q[0],q[1],7);gr.addColorStop(0,'rgba(255,214,150,'+a*.55+')');gr.addColorStop(1,'rgba(255,170,90,0)');hx.fillStyle=gr;hx.fillRect(q[0]-7,q[1]-7,14,14)}hx.restore()}
