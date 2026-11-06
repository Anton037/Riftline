// Material relief and reflected light in world units: one floor pass, no post-process targets.
// Relief is visual only. The flat navigation surface and hazard geometry remain authoritative.
export const FLOOR_FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
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
// Cell edge, cell identity. Same silhouette on every quality tier; Saver drops microstructure only.
vec2 cell(vec2 p) {
 vec2 i=floor(p), f=fract(p); float a=8.0,b=8.0,id=0.0;
 for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
  vec2 g=vec2(float(x),float(y)); vec2 v=g+vec2(hash(i+g),hash(i+g+7.0))-f;
  float d=dot(v,v); if(d<a){b=a;a=d;id=hash(i+g+19.0);}else if(d<b){b=d;}
 }
 return vec2(sqrt(b)-sqrt(a),id);
}
void main() {
 vec2 p=vW; float edge=min(uHalf.x-abs(p.x),uHalf.y-abs(p.y));
 float inside=step(0.0,edge), grain=stone(p*2.4);
 float height=0.0, gloss=0.0, rough=0.7;
 vec3 albedo=vec3(0), emission=vec3(0), key=vec3(0.72,0.83,1.0);
 int st=int(uStyle+0.5);
 if(st==5) { // Blackout City: aggregate asphalt, oily pools and recessed tar joints.
  float wet=smoothstep(0.48,0.7,stone(p*0.21+4.0));
  vec2 tile=abs(fract((p+vec2(0,mod(floor(p.y/3.0),2.0)*1.5))/3.0)-0.5);
  float seam=smoothstep(0.47,0.495,max(tile.x,tile.y));
  albedo=mix(vec3(0.035,0.048,0.063),vec3(0.015,0.023,0.031),wet)*(0.7+0.5*grain);
  float lane=(1.0-smoothstep(0.08,0.14,abs(abs(p.x)-0.3)))*step(0.28,fract(p.y/4.0));
  albedo=mix(albedo,vec3(0.34,0.25,0.09),lane*smoothstep(0.24,0.55,grain));
  height=(grain*0.035-seam*0.055)*(1.0-wet); gloss=wet*0.8; rough=0.18;
  // Warm street lights smear across water, never a bright stripe across the combat space.
  emission=vec3(0.08,0.035,0.008)*wet*pow(max(0.0,sin(p.y*0.7+p.x*0.2)),8.0);
 } else if(st==2) { // Aurora Shelf: deep ice with snow accumulated in fissures.
  vec2 c=cell(p*0.27+3.0); float crack=1.0-smoothstep(0.015,0.08,c.x);
  float snow=smoothstep(0.48,0.73,stone(p*0.22));
  albedo=mix(vec3(0.027,0.09,0.15)*(0.8+0.4*grain),vec3(0.32,0.44,0.48),snow);
  height=snow*0.16+grain*0.025-crack*0.09; gloss=(1.0-snow)*0.75; rough=0.15;
  emission=vec3(0.025,0.12,0.17)*crack*(1.0-snow)*0.5;
  key=vec3(0.65,0.84,1.0);
 } else if(st==3) { // Glowmarsh: rounded peat islands over ink-black reflective water.
  float bank=smoothstep(0.43,0.6,stone(p*0.23));
  float ripple=sin(p.x*2.5+p.y*1.7+uTime*0.65)*sin(p.y*2.0-uTime*0.4);
  albedo=mix(vec3(0.009,0.026,0.03),vec3(0.032,0.063,0.043)*(0.65+grain*0.6),bank);
  height=bank*0.2+grain*0.04*bank+ripple*0.008*(1.0-bank);
  gloss=(1.0-bank)*0.7; rough=0.24; key=vec3(0.54,0.9,0.82);
  float shore=1.0-smoothstep(0.02,0.075,abs(stone(p*0.23)-0.5));
  emission=vec3(0.015,0.13,0.09)*shore*(0.65+0.15*sin(uTime*0.7));
 } else if(st==4) { // Shattered Core: beveled hex slabs, dark gaps and a low rift glow.
  vec2 q=p/2.3, r=vec2(1.0,1.7320508), a=mod(q,r)-r*0.5, b=mod(q-r*0.5,r)-r*0.5;
  vec2 g=dot(a,a)<dot(b,b)?a:b; float d=max(dot(abs(g),normalize(r)),abs(g.x));
  vec2 id=floor((q-g)*2.0+0.5); float bevel=smoothstep(0.41,0.48,d), gap=smoothstep(0.475,0.49,d);
  albedo=mix(vec3(0.065,0.056,0.105)*(0.72+hash(id)*0.5),vec3(0.006,0.008,0.022),gap);
  height=(1.0-bevel)*0.16+grain*0.012; gloss=0.28; rough=0.38;
  emission=vec3(0.075,0.025,0.16)*gap+vec3(0.04,0.1,0.14)*bevel*(1.0-gap)*0.15;
  key=vec3(0.78,0.68,1.0);
 } else if(st==6) { // Ashfall Caldera: volcanic plates; molten rock stays below their edges.
  vec2 c=cell(p*0.42); float crack=1.0-smoothstep(0.015,0.07,c.x);
  float shelf=smoothstep(0.02,0.18,c.x);
  albedo=vec3(0.055,0.04,0.035)*(0.55+grain*0.65+c.y*0.25);
  height=shelf*0.19+grain*0.055; gloss=0.08; rough=0.65; key=vec3(1.0,0.73,0.5);
  emission=mix(vec3(0.22,0.018,0.001),vec3(0.7,0.16,0.015),stone(p*0.3))*crack*0.65;
 } else { // Glass Flats: cool translucent fragments embedded in wind-rippled ochre sand.
  vec2 c=cell(p*0.24+4.0); float glass=smoothstep(0.04,0.15,c.x)*smoothstep(0.25,0.55,stone(p*0.17));
  float dune=sin(p.x*2.3+p.y*1.4+stone(p*0.22)*5.0);
  vec3 sand=vec3(0.25,0.18,0.095)*(0.9+grain*0.2);
  vec3 sheet=mix(vec3(0.12,0.22,0.24),vec3(0.28,0.34,0.29),c.y);
  albedo=mix(sand,sheet,glass);
  height=(1.0-glass)*(dune*0.025+grain*0.012)+glass*smoothstep(0.05,0.2,c.x)*0.1;
  gloss=glass*0.65; rough=0.2; key=vec3(1.0,0.88,0.65);
 }
 // Screen derivatives reconstruct a world-space height normal without extra texture samples/passes.
 // Microrelief fades out in Saver; the larger material shapes remain consistent.
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
