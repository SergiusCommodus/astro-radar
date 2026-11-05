/* The live world: a WebGL Earth behind the whole page (dist/world.js, loaded by app.js after the page has painted; app.js draws the launch
   over it). Plain WebGL 1, no library. NASA textures from assets/world/ (see SOURCES.md): the 2k set first, then on the high tier the 4k
   set and an 8k tile pair around the launch, each faded in over the last.

   Earth fixed frame, radius 1: y to the north pole, x to latitude 0 longitude 0, east of that toward -z, so p(lat, lon) =
   (cos lat cos lon, sin lat, -cos lat sin lon). The sun is placed from a UTC time (sunAt). The camera looks at the selected pad from above
   a point south of it, so the horizon curves across the top as it did in the photo; a lens shift (added in clip space, the same in every
   shader and in project) puts the pad where the page wants it on screen. Passes: Milky Way, stars (points), Earth, clouds, atmosphere
   (one full screen pass: the blue rim, the warm band along the terminator, a faint aurora on the high tier). Colors are tone mapped
   (ACES fit) in each pass. */
(function () {
  'use strict';
  var RAD = Math.PI / 180;
  function P(la, lo) { la *= RAD; lo *= RAD; return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function nrm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function scl(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function persp(fy, a, n, f) { var t = 1 / Math.tan(fy / 2); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); }
  function view(x, y, z, e) { return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); }
  function slerp(a, b, k) { var d = Math.max(-1, Math.min(1, dot(a, b))), w = Math.acos(d); if (w < 1e-4) return a; var s = Math.sin(w); return nrm([0, 1, 2].map(function (i) { return (Math.sin((1 - k) * w) * a[i] + Math.sin(k * w) * b[i]) / s; })); }
  function ease(k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  // the sun over the Earth at a time (ms since 1970): the low precision solar position of the Astronomical Almanac, about 0.01 degrees
  function sunAt(ms) {
    var d = ms / 864e5 - 10957.5, g = (357.529 + .98560028 * d) * RAD, q = 280.459 + .98564736 * d, L = (q + 1.915 * Math.sin(g) + .02 * Math.sin(2 * g)) * RAD,
      e = (23.439 - 3.6e-7 * d) * RAD, ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD, dec = Math.asin(Math.sin(e) * Math.sin(L)) / RAD,
      gmst = 280.46061837 + 360.98564736629 * d, lon = ((ra - gmst) % 360 + 540) % 360 - 180;
    return P(dec, lon);
  }

  var GLSL_TONE = 'vec3 tone(vec3 x){x*=1.05;return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}vec3 gam(vec3 c){return pow(c,vec3(1./2.2));}';
  var VS_SPHERE = 'attribute vec3 aP;attribute vec2 aUV;uniform mat4 uVP;uniform vec2 uShift;uniform float uR;varying vec3 vN;varying vec2 vUV;varying vec3 vW;' +
    'void main(){vec3 p=aP*uR;vN=aP;vUV=aUV;vW=p;vec4 c=uVP*vec4(p,1.);c.xy+=uShift*c.w;gl_Position=c;}';
  var FS_EARTH = 'precision highp float;uniform sampler2D uDay,uDay0,uNight,uCloud,uRel,uDet,uNoise;uniform vec3 uSun,uCam;uniform vec2 uTex;uniform float uCO,uDetA,uLit,uMix;uniform vec4 uDetB;' +
    'varying vec3 vN;varying vec2 vUV;varying vec3 vW;' + GLSL_TONE +
    'void main(){vec3 n=normalize(vN),V=normalize(uCam-vW);float mu=dot(n,uSun);vec2 uv=vUV;vec3 day=texture2D(uDay,uv).rgb;if(uMix<1.)day=mix(texture2D(uDay0,uv).rgb,day,uMix);' +
    '\n#ifdef DETAIL\nvec2 dl=vec2(fract(uv.x-uDetB.x),uv.y-uDetB.y)/uDetB.zw;if(uDetA>0.&&dl.x>0.&&dl.x<1.&&dl.y>0.&&dl.y<1.){float ef=smoothstep(0.,.06,min(min(dl.x,1.-dl.x),min(dl.y,1.-dl.y)));day=mix(day,texture2D(uDet,dl).rgb,uDetA*ef);}\n#endif\n' +
    'day=pow(day,vec3(2.2));vec4 rel=texture2D(uRel,uv);float water=smoothstep(.3,.7,rel.g);vec3 e=normalize(vec3(n.z,0.,-n.x)+vec3(1e-5,0.,0.)),no=cross(n,e),nr=n;' +
    '\n#ifdef RELIEF\nfloat hl=texture2D(uRel,uv-vec2(uTex.x,0.)).r,hr=texture2D(uRel,uv+vec2(uTex.x,0.)).r,hu=texture2D(uRel,uv-vec2(0.,uTex.y)).r,hd=texture2D(uRel,uv+vec2(0.,uTex.y)).r;' +
    'float k=mix(5.5,.35,water);nr=normalize(n-k*((hr-hl)*e+(hu-hd)*no));\n#ifdef DETAIL\nvec2 fn=texture2D(uNoise,uv*vec2(720.,360.)).rg-.5;nr=normalize(nr+(fn.x*e+fn.y*no)*.09*(1.-water)*smoothstep(1.7,1.1,length(uCam-vW)));\n#endif\n\n#endif\n' +
    'float cl=texture2D(uCloud,uv+vec2(uCO,0.)).r;float sh=0.;' +
    '\n#ifdef SHADOW\nvec3 st=uSun-n*mu;sh=texture2D(uCloud,uv+vec2(uCO,0.)+vec2(dot(st,e),-dot(st,no))*.006).r;\n#endif\n' +
    'float term=smoothstep(-.1,.2,mu),dlit=clamp(dot(nr,uSun),0.,1.);vec3 col=day*(dlit*1.35*term+.008)*(1.-sh*.5*term)+day*vec3(.022,.03,.05)*(1.-term);' +
    'col*=mix(vec3(1.,.6,.36),vec3(1.),smoothstep(0.,.3,mu));col=mix(col,col*vec3(.75,.85,1.05),water*.4);' +
    'vec3 H=normalize(uSun+V),ns=normalize(n+(nr-n)*.3);float fr=.02+.98*pow(1.-max(dot(ns,V),0.),5.);float sp=pow(max(dot(ns,H),0.),110.)*water*term*(1.-cl*.85);col+=vec3(1.,.88,.7)*(sp*2.2+fr*.06*term*water);' +
    'float nl=texture2D(uNight,uv).r,bl=texture2D(uNight,uv,3.).r;float nk=smoothstep(.06,-.16,mu)*(1.-cl*.7);col+=vec3(1.,.7,.4)*(nl*nl*1.25+bl*bl*.9)*nk*uLit;' +
    'float rim=pow(1.-max(dot(n,V),0.),3.);col=mix(col,vec3(.3,.52,1.)*term*.85,rim*.6*term);gl_FragColor=vec4(gam(tone(col)),1.);}';
  var FS_CLOUD = 'precision highp float;uniform sampler2D uCloud,uCloud0,uNoise;uniform vec3 uSun,uCam;uniform float uCO,uT,uMix;varying vec3 vN;varying vec2 vUV;varying vec3 vW;' + GLSL_TONE +
    'void main(){vec3 n=normalize(vN);float mu=dot(n,uSun);vec2 uv=vUV+vec2(uCO,0.);float c=texture2D(uCloud,uv).r;if(uMix<1.)c=mix(texture2D(uCloud0,uv).r,c,uMix);' +
    '\n#ifdef CNOISE\nfloat a=texture2D(uNoise,uv*vec2(19.,9.5)+vec2(uT*.0016,uT*.0011)).r,b=texture2D(uNoise,uv*vec2(53.,26.5)-vec2(uT*.0027,-uT*.0009)).g;c=clamp(c*(.72+.56*a)+(b-.5)*.22*c,0.,1.);\n#endif\n' +
    'float lit=smoothstep(-.12,.28,mu);vec3 col=mix(vec3(1.,.58,.34),vec3(1.),smoothstep(.02,.35,mu))*lit*1.15+vec3(.012,.016,.03);' +
    'float rim=pow(1.-max(dot(n,normalize(uCam-vW)),0.),2.);float a2=c*(.95-rim*.35);gl_FragColor=vec4(gam(tone(col))*a2,a2);}';
  var VS_QUAD = 'attribute vec2 aQ;varying vec2 vQ;void main(){vQ=aQ;gl_Position=vec4(aQ,0.,1.);}';
  var RAY = 'uniform vec3 uRt,uUp,uFw,uCam;uniform vec2 uTan,uShift;vec3 ray(){vec2 q=vQ-uShift;return normalize(uFw+q.x*uTan.x*uRt+q.y*uTan.y*uUp);}';
  var FS_ATMO = 'precision highp float;varying vec2 vQ;uniform vec3 uSun;uniform float uT;uniform sampler2D uNoise;' + RAY + GLSL_TONE +
    'void main(){vec3 d=ray(),O=uCam;float b=dot(O,d),t=-b;if(t<0.){gl_FragColor=vec4(0.);return;}vec3 Pc=O+d*t;float r=length(Pc);vec3 Pn=Pc/r;' +
    'float hit=b*b-dot(O,O)+1.;float g=r>1.?pow(smoothstep(1.06,1.,r),2.6):(hit>0.?pow(smoothstep(.86,1.,r),5.)*.55:0.);if(g<=0.){gl_FragColor=vec4(0.);return;}' +
    'float s=dot(Pn,uSun),lit=smoothstep(-.28,.32,s),fw=max(dot(d,uSun),0.);' +
    'vec3 c=vec3(.26,.5,1.)*lit*g*1.5+vec3(.08,.2,.45)*g*.2+vec3(1.,.5,.24)*exp(-s*s/.02)*g*(.45+1.4*pow(fw,6.));' +
    '\n#ifdef AURORA\nfloat ay=abs(Pn.y);float au=smoothstep(.88,.92,ay)*smoothstep(.97,.93,ay)*(1.-lit)*g;au*=.55+.45*texture2D(uNoise,vec2(atan(Pn.z,Pn.x)*1.6+uT*.01,uT*.004)).b;c+=vec3(.15,.9,.45)*au*.06;\n#endif\n' +
    'gl_FragColor=vec4(gam(tone(c)),1.);}';
  var FS_SKY = 'precision highp float;varying vec2 vQ;uniform sampler2D uNoise;' + RAY +
    'void main(){vec3 d=ray();vec3 G=normalize(vec3(-.48,.62,-.62)),C=normalize(vec3(-.55,-.42,.72));float bl=dot(d,G),cg=max(dot(d,C),0.);' +
    'vec2 u=vec2(atan(d.z,d.x)/6.2832,asin(d.y)/3.1416);float n1=texture2D(uNoise,u*vec2(5.,5.)).r,n2=texture2D(uNoise,u*vec2(17.,17.)).g;' +
    'float band=exp(-bl*bl/.012)*(.45+.55*n1)*(.75+.5*n2)+exp(-bl*bl/.002)*pow(cg,3.)*.6;float dust=smoothstep(.55,.75,n2)*exp(-bl*bl/.002)*.6;' +
    'vec3 col=vec3(.62,.7,1.)*band*(1.-dust)*.055+vec3(1.,.85,.7)*pow(cg,10.)*exp(-bl*bl/.006)*.05;gl_FragColor=vec4(pow(col,vec3(1./2.2)),1.);}';
  var VS_STAR = 'attribute vec4 aS;attribute vec2 aK;uniform mat4 uVPr;uniform vec2 uShift;uniform float uT,uPx;varying float vA;varying vec3 vC;' +
    'void main(){vec4 c=uVPr*vec4(aS.xyz*50.,1.);c.xy+=uShift*c.w;gl_Position=c;float tw=.72+.28*sin(uT*aK.y+aK.x*40.);vA=aS.w*tw;' +
    'vC=mix(vec3(.75,.82,1.),vec3(1.,.86,.7),fract(aK.x*7.));gl_PointSize=uPx*(1.+aS.w*1.8);}';
  var FS_STAR = 'precision mediump float;varying float vA;varying vec3 vC;void main(){vec2 q=gl_PointCoord-.5;float r=dot(q,q)*4.;float a=vA*exp(-r*4.);gl_FragColor=vec4(vC*a,a);}';

  function create(canvas, opt) {
    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: true, premultipliedAlpha: true, powerPreference: opt.tier === 'high' ? 'high-performance' : 'default', failIfMajorPerformanceCaveat: !opt.force });
    if (!gl) return null;
    var W = { gl: gl, ready: false, lost: false, ver: 0, files: [], tier: opt.tier, base: opt.base || 'world/', err: null }, PR = {}, TX = {}, BUF = {}, imgs = {}, lv = 0, detail = { key: '', a: 0 },
      cam = { cur: null, from: null, to: null, k0: 0, dur: 2.2 }, sun = [1, 0, 0], view0 = null, size = [1, 1], dpr = 1, VP = null, shift = [0, 0], basis = null, t0 = performance.now(), lastFrame = 0;
    var ani = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic'), maxAni = ani ? gl.getParameter(ani.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0;
    function Q() { var hi = W.tier === 'high'; return { hi: hi, seg: hi ? [192, 96] : [112, 56], stars: hi ? 3600 : 1700, fps: hi ? 0 : 30, cap: hi ? 1.5 : 1.25 }; }
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; }
    function prog(vs, fs, defs) { var p = gl.createProgram(), d = (defs || []).map(function (x) { return '#define ' + x + '\n'; }).join('');
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, d + fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(p)); p.u = {}; p.a = {}; return p; }
    function U(p, n) { return p.u[n] !== undefined ? p.u[n] : (p.u[n] = gl.getUniformLocation(p, n)); }
    function A(p, n) { return p.a[n] !== undefined ? p.a[n] : (p.a[n] = gl.getAttribLocation(p, n)); }
    function sphere(nx, ny) { var v = [], i = []; for (var y = 0; y <= ny; y++) for (var x = 0; x <= nx; x++) { var u = x / nx, w = y / ny, p = P(90 - w * 180, u * 360 - 180); v.push(p[0], p[1], p[2], u, w); }
      for (y = 0; y < ny; y++) for (x = 0; x < nx; x++) { var a = y * (nx + 1) + x, b = a + nx + 1; i.push(a, b, a + 1, a + 1, b, b + 1); }
      var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, i.length > 65535 ? new Uint32Array(i) : new Uint16Array(i), gl.STATIC_DRAW);
      return { vb: vb, ib: ib, n: i.length, t: i.length > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT }; }
    // a small tiling noise texture (four channels of smooth value noise), made here so nothing more has to load
    function noiseTex() { var N = 256, d = new Uint8Array(N * N * 4), r = 1; function rnd() { r = (r * 16807) % 2147483647; return r / 2147483647; }
      for (var c = 0; c < 4; c++) { var g = 8 << (c & 1), cells = new Float32Array(g * g); for (var j = 0; j < g * g; j++) cells[j] = rnd();
        for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) { var fx = x / N * g, fy = y / N * g, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty),
          v00 = cells[y0 * g + x0], v10 = cells[y0 * g + (x0 + 1) % g], v01 = cells[((y0 + 1) % g) * g + x0], v11 = cells[((y0 + 1) % g) * g + (x0 + 1) % g];
          d[(y * N + x) * 4 + c] = 255 * ((v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy); } }
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, d); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); return t; }
    function upload(src, wrapS) { var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS ? gl.REPEAT : gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (ani) gl.texParameterf(gl.TEXTURE_2D, ani.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, maxAni)); return t; }
    function setup() {
      var q = Q(), defs = q.hi ? ['RELIEF', 'SHADOW', 'DETAIL'] : ['RELIEF'];
      PR.earth = prog(VS_SPHERE, FS_EARTH, defs); PR.cloud = prog(VS_SPHERE, FS_CLOUD, q.hi ? ['CNOISE'] : ['CNOISE']); PR.atmo = prog(VS_QUAD, FS_ATMO, q.hi ? ['AURORA'] : []); PR.sky = prog(VS_QUAD, FS_SKY); PR.star = prog(VS_STAR, FS_STAR);
      BUF.sph = sphere(q.seg[0], q.seg[1]); if (BUF.sph.t === gl.UNSIGNED_INT && !gl.getExtension('OES_element_index_uint')) BUF.sph = sphere(128, 64);
      BUF.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, BUF.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var s = [], k = [], r = 7; function rnd() { r = (r * 16807) % 2147483647; return r / 2147483647; }
      for (var i = 0; i < q.stars; i++) { var z = rnd() * 2 - 1, a = rnd() * 6.2832, m = Math.sqrt(1 - z * z), b = Math.pow(rnd(), 3.2); s.push(m * Math.cos(a), z, m * Math.sin(a), .12 + .88 * b); k.push(rnd(), .4 + rnd() * 1.6); }
      BUF.star = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, BUF.star); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(s), gl.STATIC_DRAW);
      BUF.stark = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, BUF.stark); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(k), gl.STATIC_DRAW); BUF.nstar = q.stars;
      TX.noise = noiseTex(); for (var key in imgs) if (imgs[key].im) TX[key] = upload(imgs[key].im, true);
    }
    // textures: a level is used once all four of its maps are in; until the first level is in nothing is drawn (the page shows its stars)
    var LV = ['2k', '4k'], MAPS = ['day', 'night', 'clouds', 'relief'];
    function load(src) { return new Promise(function (ok, bad) { var im = new Image(); im.decoding = 'async'; im.onload = function () { (im.decode ? im.decode() : Promise.resolve()).then(function () { ok(im); }, function () { ok(im); }); }; im.onerror = bad; im.src = src; }); }
    function loadLevel(i) {
      return Promise.all(MAPS.map(function (m) { return load(W.base + m + '-' + LV[i] + '.webp'); })).then(function (ims) {
        if (W.lost) return; if (TX.day0) gl.deleteTexture(TX.day0); if (TX.clouds0) gl.deleteTexture(TX.clouds0); TX.day0 = TX.day; TX.clouds0 = TX.clouds; W.mix0 = TX.day0 ? performance.now() : 0;
        MAPS.forEach(function (m, j) { var old = TX[m]; imgs[m] = { im: ims[j] }; TX[m] = upload(ims[j], true); if (old && m !== 'day' && m !== 'clouds') gl.deleteTexture(old); }); lv = i; MAPS.forEach(function (m) { W.files.push(W.base + m + '-' + LV[i] + '.webp'); }); W.texW = ims[0].width; W.ready = true; W.fade = performance.now(); W.ver++; if (W.onupdate) W.onupdate();
      });
    }
    function start() { return loadLevel(0).then(function () { if (W.tier === 'high' && !W.lost) return loadLevel(1); }); }
    // the high tier's 8k detail: the 2 by 2 block of 45 degree tiles with the pad well inside it, drawn into one texture and faded in
    function setDetail(la, lo) {
      if (W.tier !== 'high') return; var c0 = Math.floor((lo + 180) / 45 - .5), r0 = Math.max(0, Math.min(2, Math.floor((90 - la) / 45 - .5))), key = c0 + ',' + r0;
      if (detail.key === key) return; detail.key = key; detail.a = 0; detail.want = key; c0 = (c0 + 8) % 8;
      var parts = [[0, 0], [1, 0], [0, 1], [1, 1]];
      var urls = parts.map(function (o) { return W.base + 'tiles/day-8k-' + ((c0 + o[0]) % 8) + '-' + (r0 + o[1]) + '.webp'; });
      Promise.all(urls.map(load)).then(function (ims) {
        W.files = W.files.concat(urls);
        if (W.lost || detail.want !== key) return; var cv = document.createElement('canvas'); cv.width = cv.height = 2048; var g = cv.getContext('2d');
        ims.forEach(function (im, j) { g.drawImage(im, parts[j][0] * 1024, parts[j][1] * 1024); });
        if (TX.det) gl.deleteTexture(TX.det); TX.det = upload(cv, false); detail.b = [c0 / 8, r0 / 4, .25, .5]; detail.t0 = performance.now(); W.ver++; if (W.onupdate) W.onupdate();
      }, function () {});
    }
    // where the camera is for a target pad, before the lens shift: above a point south of the pad, looking at it, north up
    function camFor(t) {
      var la = t.lat, lo = t.lon, T = P(la, lo), tilt = t.phone ? 18 : 24, dist = t.phone ? 2.45 : 2.3;
      return { T: T, S: P(Math.max(-80, la - tilt), lo), D: dist, f: t.f || [.66, .52] };
    }
    W.setView = function (t) {
      sun = sunAt(t.utc || Date.now()); var c = camFor(t);
      if (!cam.cur || t.jump) { cam.cur = c; cam.from = cam.to = null; }
      else if (!cam.to || dot(cam.to.T, c.T) < .99999 || cam.to.D !== c.D || cam.to.f[0] !== c.f[0] || cam.to.f[1] !== c.f[1]) { cam.from = cam.cur; cam.to = c; cam.k0 = performance.now(); }
      setDetail(t.lat, t.lon);
    };
    function camNow(now) {
      if (cam.to) { var k = Math.min(1, (now - cam.k0) / 1000 / cam.dur), e = ease(k), a = cam.from, b = cam.to, far = Math.max(0, 1 - dot(a.T, b.T));
        cam.cur = { T: slerp(a.T, b.T, e), S: slerp(a.S, b.S, e), D: a.D + (b.D - a.D) * e + Math.sin(Math.PI * e) * Math.min(.9, far * 1.2), f: [a.f[0] + (b.f[0] - a.f[0]) * e, a.f[1] + (b.f[1] - a.f[1]) * e] };
        if (k >= 1) { cam.cur = b; cam.to = null; } }
      return cam.cur;
    }
    // the view for this frame: the camera, the slow drift, and the scroll (sc, 0 at the top of the page to 1 a screen and a half down: the
    // planet rises and tilts a little as the page goes by)
    function frameView(now, sc, still) {
      var c = camNow(now), t = still ? 0 : (now - t0) / 1000, drift = still ? 0 : Math.sin(t * .021) * .012, bob = still ? 0 : Math.cos(t * .017) * .008;
      var S = nrm([c.S[0] + drift * c.S[2], c.S[1] + bob, c.S[2] - drift * c.S[0]]), E = scl(S, c.D * (1 + sc * .12)), Fw = nrm(sub(c.T, E));
      var up0 = nrm(sub(c.T, scl(S, dot(c.T, S)))), roll = sc * 7 * RAD, Rt = nrm(cross(Fw, up0)), Up = cross(Rt, Fw);
      Rt = nrm(add(scl(Rt, Math.cos(roll)), scl(Up, Math.sin(roll)))); Up = cross(Rt, Fw);
      var aspect = size[0] / size[1], fy = (aspect < .8 ? 52 : 38) * RAD, pr = persp(fy, aspect, .05, 60), V = view(Rt, Up, scl(Fw, -1), E);
      VP = mul(pr, V); var Vr = view(Rt, Up, scl(Fw, -1), [0, 0, 0]); W.VPr = mul(pr, Vr);
      shift = [c.f[0] * 2 - 1, 1 - c.f[1] * 2 + sc * .55]; basis = { E: E, Rt: Rt, Up: Up, Fw: Fw, tan: [Math.tan(fy / 2) * aspect, Math.tan(fy / 2)] };
    }
    function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    // a point at a latitude, longitude and height (km, exaggerated so a climb shows) to CSS pixels in the canvas, with whether it can be seen
    W.lift = function (h) { return Math.pow(Math.max(0, h), .8) * .0011; };
    W.project = function (la, lo, h) {
      if (!VP) return null; var p = scl(P(la, lo), 1 + W.lift(h || 0)), x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
      if (w <= 0) return null; var nx = x / w + shift[0], ny = y / w + shift[1], E = basis.E, d = sub(p, E), L = Math.sqrt(dot(d, d)), u = scl(d, 1 / L), b = dot(E, u), c = dot(E, E) - 1, disc = b * b - c, hid = disc > 0 && (-b - Math.sqrt(disc)) < L - 1e-4;
      return [(nx + 1) / 2 * size[0], (1 - ny) / 2 * size[1], !hid];
    };
    W.resize = function (w, h, d) { var q = Q(); dpr = Math.min(d || 1, q.cap); if (w * h * dpr * dpr > 4.2e6) dpr = Math.max(1, Math.sqrt(4.2e6 / (w * h))); size = [w, h]; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); };
    W.frame = function (now, sc, still) {
      if (W.lost || !cam.cur) return false; var q = Q(); if (q.fps && !still && now - lastFrame < 1000 / q.fps - 3) return false; lastFrame = now; frameView(now, sc || 0, still);
      if (!W.ready) return true; var t = still ? 30 : (now - t0) / 1000, B = basis;
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(.012, .016, .036, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      function quad(p) { gl.bindBuffer(gl.ARRAY_BUFFER, BUF.quad); var a = A(p, 'aQ'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        gl.uniform3fv(U(p, 'uRt'), B.Rt); gl.uniform3fv(U(p, 'uUp'), B.Up); gl.uniform3fv(U(p, 'uFw'), B.Fw); gl.uniform3fv(U(p, 'uCam'), B.E); gl.uniform2fv(U(p, 'uTan'), B.tan); gl.uniform2fv(U(p, 'uShift'), shift);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, TX.noise); gl.uniform1i(U(p, 'uNoise'), 5); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disableVertexAttribArray(a); }
      gl.useProgram(PR.sky); quad(PR.sky);
      // stars, added
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); var ps = PR.star; gl.useProgram(ps); gl.uniformMatrix4fv(U(ps, 'uVPr'), false, W.VPr); gl.uniform2fv(U(ps, 'uShift'), shift); gl.uniform1f(U(ps, 'uT'), t); gl.uniform1f(U(ps, 'uPx'), 1.6 * dpr);
      var a1 = A(ps, 'aS'), a2 = A(ps, 'aK'); gl.bindBuffer(gl.ARRAY_BUFFER, BUF.star); gl.enableVertexAttribArray(a1); gl.vertexAttribPointer(a1, 4, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ARRAY_BUFFER, BUF.stark); gl.enableVertexAttribArray(a2); gl.vertexAttribPointer(a2, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, BUF.nstar); gl.disableVertexAttribArray(a1); gl.disableVertexAttribArray(a2); gl.disable(gl.BLEND);
      // the Earth, then the clouds over it
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      var co = still ? .3 : (t * .00055) % 1;
      function sph(p, r) { gl.useProgram(p); gl.uniformMatrix4fv(U(p, 'uVP'), false, VP); gl.uniform2fv(U(p, 'uShift'), shift); gl.uniform1f(U(p, 'uR'), r); gl.uniform3fv(U(p, 'uSun'), sun); gl.uniform3fv(U(p, 'uCam'), B.E); gl.uniform1f(U(p, 'uCO'), co); gl.uniform1f(U(p, 'uT'), t);
        gl.bindBuffer(gl.ARRAY_BUFFER, BUF.sph.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, BUF.sph.ib); var ap = A(p, 'aP'), au = A(p, 'aUV'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(au); gl.vertexAttribPointer(au, 2, gl.FLOAT, false, 20, 12);
        return function () { gl.drawElements(gl.TRIANGLES, BUF.sph.n, BUF.sph.t, 0); gl.disableVertexAttribArray(ap); gl.disableVertexAttribArray(au); }; }
      function tex(p, n, i, t2) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t2); gl.uniform1i(U(p, n), i); }
      var pe = PR.earth, draw = sph(pe, 1); tex(pe, 'uDay', 0, TX.day); tex(pe, 'uNight', 1, TX.night); tex(pe, 'uCloud', 2, TX.clouds); tex(pe, 'uRel', 3, TX.relief); tex(pe, 'uDet', 4, TX.det || TX.day);
      var da = TX.det && detail.b ? (still ? 1 : Math.min(1, (now - detail.t0) / 1200)) : 0; gl.uniform1f(U(pe, 'uDetA'), da); gl.uniform4fv(U(pe, 'uDetB'), detail.b || [0, 0, 1, 1]);
      gl.uniform2fv(U(pe, 'uTex'), [1 / (W.texW || 2048), 1 / ((W.texW || 2048) / 2)]); gl.uniform1f(U(pe, 'uLit'), 1);
      var mx = W.mix0 && !still ? Math.min(1, (now - W.mix0) / 1500) : 1; if (mx >= 1 && TX.day0) { gl.deleteTexture(TX.day0); gl.deleteTexture(TX.clouds0); TX.day0 = TX.clouds0 = null; W.mix0 = 0; }
      gl.uniform1f(U(pe, 'uMix'), mx); tex(pe, 'uDay0', 6, TX.day0 || TX.day); gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, TX.noise); gl.uniform1i(U(pe, 'uNoise'), 5); draw();
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); var pc = PR.cloud, dc = sph(pc, 1.006); tex(pc, 'uCloud', 2, TX.clouds); tex(pc, 'uCloud0', 6, TX.clouds0 || TX.clouds); gl.uniform1f(U(pc, 'uMix'), mx); gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, TX.noise); gl.uniform1i(U(pc, 'uNoise'), 5); dc(); gl.depthMask(true);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      // the air, added over everything
      gl.blendFunc(gl.ONE, gl.ONE); var pa = PR.atmo; gl.useProgram(pa); gl.uniform3fv(U(pa, 'uSun'), sun); gl.uniform1f(U(pa, 'uT'), t); quad(pa); gl.disable(gl.BLEND);
      return true;
    };
    W.diag = function () { return { tier: W.tier, level: LV[lv], canvas: canvas.width + 'x' + canvas.height, dpr: +dpr.toFixed(2), detail: TX.det ? 'on' : 'off', ready: W.ready }; };
    W.setTier = function (t) { if (t === W.tier) return; W.tier = t; try { setup(); } catch (e) { W.err = e; } };
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); W.lost = true; W.ready = false; if (W.onlost) W.onlost(); });
    canvas.addEventListener('webglcontextrestored', function () { W.lost = false; PR = {}; TX = {}; BUF = {}; detail.key = ''; try { setup(); W.ready = !!TX.day; } catch (e) { W.err = e; } if (W.onrestored) W.onrestored(); });
    try { setup(); } catch (e) { window.__worldErr = String(e && e.message || e); return null; }
    W.start = start; W.sunAt = sunAt;
    return W;
  }
  window.ARWorld = { create: create, sunAt: sunAt };
})();
