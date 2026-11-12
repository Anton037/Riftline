// Material relief and reflected light in world units: one floor pass, no post-process targets.
// Relief is visual only. The flat navigation surface and hazard geometry remain authoritative.
export const FLOOR_FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform sampler2D uOcclusion, uTerrainMap;
uniform float uTerrainReady;
uniform vec3 uBase, uGrid, uAccent;
uniform vec2 uHalf, uPlayer;
uniform float uTime, uPulse, uStyle, uDark, uVivid, uGain, uLod;
uniform vec4 uL[6]; uniform vec3 uLC[6];
varying vec2 vW;
float hash(vec2 p) { p = fract(p * vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p) {
 vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
}
float stone(vec2 p) { return uLod>1.5?noise(p):noise(p)*0.7+noise(p*2.07+11.0)*0.3; }
// Cell edge and identity for the procedural fallback while the painted atlas loads.
vec2 cell(vec2 p) {
 vec2 i=floor(p), f=fract(p); float a=8.0,b=8.0,id=0.0;
 for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
  vec2 g=vec2(float(x),float(y)); vec2 v=g+vec2(hash(i+g),hash(i+g+7.0))-f;
  float d=dot(v,v); if(d<a){b=a;a=d;id=hash(i+g+19.0);}else if(d<b){b=d;}
 }
 return vec2(sqrt(b)-sqrt(a),id);
}
// Blend shifted tile interiors at every wrap; no mirrored/kaleidoscopic repeats or atlas bleed.
vec3 terrainSample(vec2 tile,vec2 uv) {
 return texture2D(uTerrainMap,(tile+mix(vec2(.002),vec2(.998),uv))/vec2(3,2)).rgb;
}
vec3 terrainPaint(vec2 p,int st) {
 vec2 tile=st==5?vec2(0,0):st==2?vec2(1,0):st==3?vec2(2,0):st==4?vec2(0,1):st==6?vec2(1,1):vec2(2,1);
 vec2 warp=vec2(noise(p*.11),noise(p*.11+7.0))*2.0;
 vec2 a=fract((p+warp+vec2(2.7,6.1))/18.0), b=fract(a+.5);
 vec2 blend=smoothstep(vec2(0),vec2(.18),min(a,1.0-a));
 return mix(mix(terrainSample(tile,b),terrainSample(tile,vec2(a.x,b.y)),blend.x),
            mix(terrainSample(tile,vec2(b.x,a.y)),terrainSample(tile,a),blend.x),blend.y);
}
void main() {
 vec2 p=vW; float edge=min(uHalf.x-abs(p.x),uHalf.y-abs(p.y));
 float inside=step(0.0,edge), grain=stone(p*2.4);
 float height=0.0, gloss=0.0, rough=0.7;
 vec3 albedo=vec3(0), emission=vec3(0), key=vec3(0.72,0.83,1.0);
 int st=int(uStyle+0.5);
 if(uTerrainReady<.5) {
 if(st==5) { // Blackout City: aggregate asphalt, oily pools and recessed tar joints.
  float wet=smoothstep(0.48,0.7,stone(p*0.21+4.0));
  vec2 tile=abs(fract((p+vec2(0,mod(floor(p.y/3.0),2.0)*1.5))/3.0)-0.5);
  float sidewalk=smoothstep(7.8,8.2,abs(p.x));
  float seam=smoothstep(0.47,0.495,max(tile.x,tile.y))*sidewalk;
  albedo=mix(vec3(0.041,0.052,0.063),vec3(0.019,0.03,0.041),wet)*(0.87+0.22*grain);
  albedo=mix(albedo,vec3(0.08,0.092,0.103)*(0.85+grain*0.2),sidewalk*0.6);
  float lane=(1.0-smoothstep(0.08,0.14,abs(abs(p.x)-0.3)))*step(0.28,fract(p.y/4.0));
  albedo=mix(albedo,vec3(0.34,0.25,0.09),lane*smoothstep(0.24,0.55,grain));
  // Worn road shoulders, repaired asphalt and crosswalk paint establish a real street scale.
  float shoulder=(1.0-smoothstep(0.04,0.09,abs(abs(p.x)-8.0)))*smoothstep(0.3,0.55,grain);
  float crossing=step(abs(p.y+7.0),1.4)*step(abs(p.x),7.8)*step(0.38,fract(p.x/1.2));
  float wear=smoothstep(0.28,0.65,stone(p*3.5));
  albedo=mix(albedo,vec3(0.18,0.2,0.19),max(shoulder,crossing*wear*0.55));
  float repair=step(0.78,hash(floor((p+1.7)/2.8)))*(1.0-seam);
  albedo*=1.0-repair*0.28;
  height=(grain*0.035-seam*0.055)*(1.0-wet); gloss=wet*0.8; rough=0.18;
  // Warm street lights smear across water, never a bright stripe across the combat space.
  emission=vec3(0.08,0.035,0.008)*wet*pow(max(0.0,sin(p.y*0.7+p.x*0.2)),8.0);
 } else if(st==2) { // Aurora Shelf: deep ice with snow accumulated in fissures.
  vec2 c=cell(p*0.27+3.0); float crack=1.0-smoothstep(0.015,0.08,c.x);
  float drift=sin(p.x*0.8+p.y*1.6+stone(p*0.15)*6.0);
  float snow=smoothstep(0.42,0.7,stone(p*0.22)+drift*0.075);
  albedo=mix(vec3(0.027,0.09,0.15)*(0.8+0.4*grain),vec3(0.32,0.44,0.48),snow);
  albedo*=1.0-0.09*snow*(0.5+0.5*sin(p.y*9.0+p.x*2.0+grain*2.0));
  height=snow*0.08+grain*0.012-crack*0.025; gloss=(1.0-snow)*0.75; rough=0.15;
  emission=vec3(0.025,0.12,0.17)*crack*(1.0-snow)*0.18;
  key=vec3(0.65,0.84,1.0);
 } else if(st==3) { // Glowmarsh: rounded peat islands over ink-black reflective water.
  float bank=smoothstep(0.43,0.6,stone(p*0.23));
  float ripple=sin(p.x*2.5+p.y*1.7+uTime*0.65)*sin(p.y*2.0-uTime*0.4);
  albedo=mix(vec3(0.009,0.026,0.03),vec3(0.032,0.063,0.043)*(0.65+grain*0.6),bank);
  height=bank*0.2+grain*0.04*bank+ripple*0.008*(1.0-bank);
  gloss=(1.0-bank)*0.7; rough=0.24; key=vec3(0.54,0.9,0.82);
  float shore=1.0-smoothstep(0.02,0.075,abs(stone(p*0.23)-0.5));
  // Broken colonies along the banks, rather than a continuous glowing contour.
  float colonies=smoothstep(0.48,0.7,stone(p*1.3));
  emission=vec3(0.015,0.13,0.09)*shore*colonies*(0.45+0.1*sin(uTime*0.7));
  albedo+=vec3(0.018,0.028,0.009)*bank*smoothstep(0.55,0.75,grain);
 } else if(st==4) { // Shattered Core: beveled hex slabs, dark gaps and a low rift glow.
  vec2 q=p/2.3, r=vec2(1.0,1.7320508), a=mod(q,r)-r*0.5, b=mod(q-r*0.5,r)-r*0.5;
  vec2 g=dot(a,a)<dot(b,b)?a:b; float d=max(dot(abs(g),normalize(r)),abs(g.x));
  vec2 id=floor((q-g)*2.0+0.5); float bevel=smoothstep(0.41,0.48,d), gap=smoothstep(0.475,0.49,d);
  albedo=mix(vec3(0.065,0.056,0.105)*(0.72+hash(id)*0.5),vec3(0.006,0.008,0.022),gap);
  float fracture=1.0-smoothstep(0.008,0.025,abs(g.y-g.x*0.48+(hash(id)-0.5)*0.5));
  fracture*=step(0.62,hash(id+9.0))*(1.0-gap);
  albedo*=1.0-fracture*0.65;
  albedo+=vec3(0.012,0.017,0.025)*smoothstep(0.5,0.8,grain)*(1.0-bevel);
  height=(1.0-bevel)*0.16+grain*0.012-fracture*0.035; gloss=0.28; rough=0.38;
  emission=vec3(0.075,0.025,0.16)*gap+vec3(0.04,0.1,0.14)*bevel*(1.0-gap)*0.15;
  key=vec3(0.78,0.68,1.0);
 } else if(st==6) { // Ashfall Caldera: volcanic plates; molten rock stays below their edges.
  vec2 warp=vec2(stone(p*.17),stone(p*.17+13.0));
  vec2 c=cell(p*.48+warp*.55);
  float seam=1.0-smoothstep(.008,.025,c.x);
  float ash=smoothstep(.3,.73,stone(p*.29+3.0));
  albedo=mix(vec3(.028,.037,.049),vec3(.07,.072,.074),ash)*(.83+grain*.25);
  height=grain*.026+ash*.022+sin(p.x*.65+p.y*.4)*.014;
  gloss=.07; rough=.9; key=vec3(.82,.86,.92);
  float hot=smoothstep(.55,.78,stone(p*.16+7.0));
  emission=vec3(.16,.035,.008)*seam*hot*.45;
 } else { // Glass Flats: cool translucent fragments embedded in wind-rippled ochre sand.
  vec2 c=cell(p*0.72+4.0); float glass=smoothstep(0.045,0.2,c.x)*smoothstep(0.51,0.74,stone(p*0.31));
  float dune=sin(p.x*2.3+p.y*1.4+stone(p*0.22)*5.0);
  vec3 sand=vec3(0.235,0.182,0.113)*(0.9+grain*0.16);
  vec3 sheet=mix(vec3(0.14,0.22,0.22),vec3(0.24,0.3,0.27),c.y);
  sand*=0.96+0.04*dune;
  sand*=1.0-0.035*(0.5+0.5*sin(p.x*8.0+p.y*4.0+stone(p*.3)*3.0));
  albedo=mix(sand,sheet,glass);
  emission=vec3(0.035,0.05,0.045)*glass*(1.0-smoothstep(0.05,0.1,c.x));
  height=(1.0-glass)*(dune*0.025+grain*0.012)+glass*smoothstep(0.05,0.2,c.x)*0.1;
  gloss=glass*0.65; rough=0.2; key=vec3(1.0,0.88,0.65);
 }
 } else {
  albedo=terrainPaint(p,st);
  height=dot(albedo,vec3(.2126,.7152,.0722))*.16;
  if(st==5) {
   gloss=.35; rough=.3;
   float lane=(1.0-smoothstep(.08,.14,abs(abs(p.x)-.3)))*step(.28,fract(p.y/4.0));
   float crossing=step(abs(p.y+7.0),1.4)*step(abs(p.x),7.8)*step(.38,fract(p.x/1.2));
   float wear=smoothstep(.28,.65,stone(p*3.5));
   albedo=mix(albedo,vec3(.34,.26,.105),lane*wear);
   albedo=mix(albedo,vec3(.24,.25,.235),crossing*wear*.5);
   float shoulder=1.0-smoothstep(.04,.09,abs(abs(p.x)-8.0));
   albedo=mix(albedo,vec3(.25,.26,.25),shoulder*.7);
  } else if(st==2) {
   gloss=.55; rough=.2; key=vec3(.7,.87,1.0);
  } else if(st==3) {
   gloss=.32; rough=.4; key=vec3(.6,.86,.8);
   height+=sin(p.x*2.5+p.y*1.7+uTime*.65)*.002;
  } else if(st==4) {
   gloss=.18; rough=.65; key=vec3(.8,.73,.92);
  } else if(st==6) {
   gloss=.06; rough=.9; key=vec3(.82,.86,.92);
  } else {
   gloss=.08; rough=.8; key=vec3(1.0,.9,.72);
  }
 }
 // Screen derivatives reconstruct a world-space height normal without extra texture samples/passes.
 // Preserve the material relief at the standard High detail level.
 vec2 dx=dFdx(p),dy=dFdy(p); float det=dx.x*dy.y-dx.y*dy.x;
 float hx=dFdx(height),hy=dFdy(height);
 vec2 grad=vec2(hx*dy.y-hy*dx.y,hy*dx.x-hx*dy.x)/max(abs(det),0.000001)*sign(det);
 grad*=uLod>1.5?0.45:1.0;
 vec3 N=normalize(vec3(-grad.x,1.0,-grad.y)), L=normalize(vec3(0.35,0.8,0.45));
 vec3 V=normalize(cameraPosition-vec3(p.x,0.0,p.y));
 float diffuse=max(dot(N,L),0.0), spec=pow(max(dot(N,normalize(L+V)),0.0),mix(70.0,18.0,rough));
 vec3 col=albedo*(0.55+diffuse*1.2)+key*spec*gloss*0.3+emission;
 // The arena edge has thickness and a quiet contact vignette rather than a neon border.
 col*=mix(0.65,1.0,smoothstep(0.0,1.0,edge));
 col*=texture2D(uOcclusion,p/(uHalf*2.0)+0.5).r;
 col*=mix(0.5,1.0,getShadowMask());
 col+=uGrid*uPulse*0.06*inside;
 col*=1.0-uDark;
 for(int i=0;i<6;i++) {
  if(uL[i].w<=0.0) continue;
  vec2 d=p-uL[i].xy; float fall=exp(-dot(d,d)/max(0.01,uL[i].z*uL[i].z));
  col+=uLC[i]*uL[i].w*fall*(0.35+gloss*0.55);
 }
 col*=mix(st==4?0.16:0.32,1.0,inside);
 col=mix(vec3(dot(col,vec3(0.299,0.587,0.114))),col,min(uVivid,1.2))*uGain;
 gl_FragColor=vec4(max(col,vec3(0.0)),1.0);
 #include <fog_fragment>
 #include <colorspace_fragment>
}`;
