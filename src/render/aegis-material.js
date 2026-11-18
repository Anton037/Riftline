// A readable shell: the centre stays clear while the rim and absorbed hits carry its shape.
import { ShaderMaterial, Color } from "three";

export function createAegisMaterial(color) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uFade: { value: 1 }, uColor: { value: new Color(color) } },
    vertexShader: `
 varying vec3 vN; varying vec3 vV; varying vec3 vP;
 void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=-mv.xyz;vP=position;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `
 uniform float uTime,uHit,uFade;uniform vec3 uColor;
 varying vec3 vN,vV,vP;
 void main(){
  float f=pow(1.0-abs(dot(normalize(vN),normalize(vV))),3.0);
  float a=atan(vP.z,vP.x+1e-5);
  float meridians=pow(abs(cos(a*5.0+vP.y*.9)),18.0);
  float parallels=pow(abs(cos(vP.y*16.0+uTime*.17)),25.0);
  float ripple=pow(.5+.5*cos((vP.y+.3)*19.0-uTime*21.0),12.0)*uHit;
  float alpha=(.014+f*.25+meridians*.033+parallels*.07+ripple*.31)*uFade;
  vec3 glaze=mix(uColor,vec3(.56,.76,.61),.41);
  gl_FragColor=vec4(mix(glaze,vec3(.97,.84,.55),clamp(uHit*.62+meridians*.13,0.,1.)),alpha);
  #include <colorspace_fragment>
 }`,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}
