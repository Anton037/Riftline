// A readable shell: the centre stays clear while the rim and absorbed hits carry its shape.
import { ShaderMaterial, Color } from "three";
import { GLSL_BAYER4 } from "./pixel-art.js";

export function createAegisMaterial(color) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uFade: { value: 1 }, uColor: { value: new Color(color) } },
    vertexShader: `
 varying vec3 vN; varying vec3 vV; varying vec3 vP;
 void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=-mv.xyz;vP=position;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `
 uniform float uTime,uHit,uFade;uniform vec3 uColor;
 varying vec3 vN,vV,vP;
${GLSL_BAYER4}
 void main(){
  float f=pow(1.0-abs(dot(normalize(vN),normalize(vV))),3.0);
  vec2 p=vec2(atan(vP.z,vP.x)*2.1,vP.y*4.6);
  p.x+=mod(floor(p.y),2.0)*.5;
  vec2 q=abs(fract(p)-.5);float seam=smoothstep(.43,.49,max(q.x,q.y));
  float ripple=pow(.5+.5*cos(length(vP.xy)*25.0-uTime*18.0),7.0)*uHit;
  float alpha=(.012+f*.29+seam*.035+ripple*.28)*uFade;
  // pixel-art shell: step the shell alpha on the pixel grid (the near-invisible centre stays smooth)
  alpha=mix(alpha,floor(alpha*4.0+pxBayer4(gl_FragCoord.xy)*.9+.5)/4.0,step(.02,alpha));
  gl_FragColor=vec4(mix(uColor,vec3(.92,.99,1.0),uHit*.55),alpha);
  #include <colorspace_fragment>
 }`,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}
