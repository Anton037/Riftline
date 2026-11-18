// Glazed floor tiles and engraved survey marks, all on the existing flat arena plane.
export const FLOOR_FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform sampler2D uOcclusion, uTerrainMap;
uniform float uTerrainReady;
uniform vec3 uGrid, uGlaze;
uniform vec2 uHalf;
uniform float uTime, uPulse, uStyle, uDark;
uniform vec4 uL[6]; uniform vec3 uLC[6];
varying vec2 vW;

float stroke(float d, float w) {
  float aa=max(fwidth(d),.004);
  return 1.0-smoothstep(w-aa*.5,w+aa*.5,abs(d));
}
float hash(vec2 p) {
  vec3 q=fract(vec3(p.xyx)*.1031);
  q+=dot(q,q.yzx+33.33);
  return fract((q.x+q.y)*q.z);
}
vec2 atlasTile(int style) {
  if(style==5) return vec2(0,0);
  if(style==2) return vec2(1,0);
  if(style==3) return vec2(2,0);
  if(style==4) return vec2(0,1);
  if(style==6) return vec2(1,1);
  return vec2(2,1);
}
void main() {
  vec2 p=vW;
  int style=int(uStyle+.5);
  float edge=min(uHalf.x-abs(p.x),uHalf.y-abs(p.y));
  float inside=step(0.0,edge);
  vec2 uv=p/3.4;
  if(style==3) uv=vec2(p.x+p.y,p.y-p.x)*.235;
  if(style==7) uv=vec2(p.x+p.y,p.y-p.x)*.17;
  if(style==6) uv=vec2(p.x/4.0,p.y/2.6+floor(p.x/4.0)*.5);
  if(style==2) uv=vec2(p.x/2.6+floor(p.y/4.2)*.5,p.y/4.2);
  vec2 q=fract(uv)-.5;
  float seam=stroke(.5-max(abs(q.x),abs(q.y)),.012);
  float bevel=stroke(.48-max(abs(q.x),abs(q.y)),.012)*(1.0-seam);
  vec2 atlas=atlasTile(style);
  vec3 pigment=uGlaze;
  if(uTerrainReady>.5) pigment=texture2D(uTerrainMap,(atlas+mix(vec2(.004),vec2(.996),q+.5))/vec2(3,2)).rgb;
  float tileTone=.86+.26*hash(floor(uv));
  float kiln=.91+.09*cos(p.x*.16+p.y*.23);
  vec3 color=pigment*tileTone*kiln*(1.0-seam*.47)+pigment*bevel*.3;

  float r=length(p);
  float ang=atan(p.y,p.x+.00001);
  float rose=stroke(r-6.6,.022)+stroke(r-6.83,.025)+stroke(r-2.45,.035);
  float scale=stroke(r-6.55,.08)*smoothstep(.89,.98,cos(ang*48.0));
  float north=stroke(abs(p.x)+abs(p.y)-1.2,.027);
  float grid;
  if(style==5) grid=stroke(abs(p.x)-3.36,.025)*step(.32,fract(p.y/2.2))+stroke(abs(p.y)-8.1,.024);
  else if(style==2) grid=stroke(r-11.4,.027)*step(.15,fract(ang*2.55));
  else if(style==3) grid=stroke(length(q)-.28,.012);
  else if(style==4) grid=stroke(abs(p.x)+abs(p.y)-12.5,.033)+stroke(abs(p.x)+abs(p.y)-13.0,.017);
  else if(style==6) grid=stroke(length(vec2(q.x,q.y*.6))-.34,.014)*step(0.0,q.x*q.y);
  else grid=stroke(abs(q.x)+abs(q.y)-.28,.013);
  float border=stroke(edge-.26,.028)+stroke(edge-.56,.014);
  float measure=stroke(edge-.4,.09)*step(.88,max(fract(p.x*1.4),fract(p.y*1.4)));
  float shading=texture2D(uOcclusion,p/(uHalf*2.0)+.5).r;
  vec3 V=normalize(cameraPosition-vec3(p.x,0.0,p.y));
  float sheen=pow(max(0.0,V.y),8.0)*(.52+.48*sin(p.x*.26+p.y*.2+uTime*.45));
  color=color*(1.05+.17*sheen)+uGlaze*sheen*.22;
  color=mix(color,uGrid*.66,clamp((rose*.27+scale*.35+north*.48+grid*.18+border*.52+measure*.3)*inside,0.0,.62));
  color*=mix(.52,1.0,shading)*mix(.52,1.0,getShadowMask());
  color*=1.0-uDark*.75;
  if(style==5){
    // Reflected pools stay next to the fixed gallery lamps, outside the main combat sightline.
    vec2 distanceToWall=uHalf-abs(p);
    vec2 alongLamp=8.4*(fract(p/8.4+.5)-.5);
    vec2 fromLamp=alongLamp.yx*alongLamp.yx+pow(max(distanceToWall+.6,vec2(0.)),vec2(2.0));
    float reflection=max(exp(-fromLamp.x*.36),exp(-fromLamp.y*.36));
    float warm=(.74+.16*cos(uTime*.87))*(1.0-uDark*.64);
    color+=vec3(.33,.16,.066)*reflection*warm*.33*inside;
  }
  color+=uGrid*uPulse*.048*inside;
  for(int i=0;i<6;i++) {
    if(uL[i].w<=0.0) continue;
    vec2 d=p-uL[i].xy;
    color+=uLC[i]*uL[i].w*exp(-dot(d,d)/max(.01,uL[i].z*uL[i].z))*.4;
  }
  color*=mix(.22,1.0,inside);
  gl_FragColor=vec4(color,1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;
