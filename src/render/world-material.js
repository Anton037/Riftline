// Shared weathered surfaces: restrained grain, deposited dust and directional material highlights.
import { MeshPhongMaterial } from "three";
import { actorMaterial } from "../data/materials.js";

export const WORLD_SURFACES = {
  map: { value: null },
  ready: { value: 0 },
  finishMap: { value: null },
  finishReady: { value: 0 },
};

export function worldMaterial({ color = 0xffffff, surface = "stone", ...options }) {
  const metal = surface === "metal",
    ice = surface === "ice" || surface === "crystal";
  const material = new MeshPhongMaterial({
    color,
    flatShading: true,
    specular: ice ? 0x88bbcf : metal ? 0x697b83 : 0x363d42,
    shininess: ice ? 72 : metal ? 38 : 12,
    ...options,
  });
  return paintMaterial(material, surface);
}

export function paintMaterial(material, surface = "armor") {
  const metal = surface === "metal",
    ice = surface === "ice" || surface === "crystal";
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  const finishTiles = {
    metal: [0, 0, 0.09],
    armor: [1, 0, 0.25],
    organic: [2, 0, 0.24],
    rubber: [0, 1, 0.07],
    wood: [1, 1, 0.09],
    ice: [2, 1, 0.3],
    crystal: [2, 1, 0.3],
  };
  const finish = finishTiles[surface];
  const tile = finish
    ? `vec2(${finish[0]},${finish[1]})`
    : surface === "basalt"
      ? "vec2(1,1)"
      : surface === "sandstone"
        ? "vec2(2,1)"
        : "vec2(0,1)";
  const average = finish ? finish[2] : surface === "basalt" ? 0.07 : surface === "sandstone" ? 0.3 : 0.16;
  const scale = surface === "basalt" ? 0.65 : ["armor", "organic", "metal", "rubber"].includes(surface) ? 0.8 : 0.22;
  const relief = surface === "basalt" || surface === "stone" ? 0.055 : surface === "organic" ? 0.012 : 0.018;
  material.onBeforeCompile = (shader, ...args) => {
    previousCompile.call(material, shader, ...args);
    shader.uniforms.uArtMap = finish ? WORLD_SURFACES.finishMap : WORLD_SURFACES.map;
    shader.uniforms.uArtReady = finish ? WORLD_SURFACES.finishReady : WORLD_SURFACES.ready;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vArtSurface;\nvarying float vArtUp;\nvarying vec3 vArtNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvArtSurface = position;\nvArtUp = objectNormal.y;\nvArtNormal = objectNormal;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vArtSurface;
varying float vArtUp;
varying vec3 vArtNormal;
uniform sampler2D uArtMap;
uniform float uArtReady;
float artGrain(vec3 p) { return fract(sin(dot(floor(p),vec3(12.9898,78.233,39.425)))*43758.5453); }
`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 ap = vArtSurface;
float grain = artGrain(ap * 46.0);
float strata = 0.5 + 0.5 * sin(ap.y * ${ice ? "12.0" : "23.0"} + sin(ap.x * 4.1 + ap.z * 3.7) * 1.7);
float dust = smoothstep(0.35,0.95,vArtUp * 0.5 + 0.5);
float artHeight = 0.0;
diffuseColor.rgb *= ${ice ? "0.93 + grain * 0.12" : "0.93 + grain * 0.05"};
diffuseColor.rgb *= 0.92 + strata * ${metal ? "0.07" : "0.12"};
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12,1.08,1.01), dust * 0.2);
if(uArtReady>.5) {
 vec3 weights=pow(abs(normalize(vArtNormal)),vec3(4.0)); weights/=max(dot(weights,vec3(1.0)),.001);
 vec2 tile=${tile};
 vec3 tx=texture2D(uArtMap,(tile+mix(vec2(.003),vec2(.997),fract(ap.zy*${scale.toFixed(2)})))/vec2(3,2)).rgb;
 vec3 ty=texture2D(uArtMap,(tile+mix(vec2(.003),vec2(.997),fract(ap.xz*${scale.toFixed(2)})))/vec2(3,2)).rgb;
 vec3 tz=texture2D(uArtMap,(tile+mix(vec2(.003),vec2(.997),fract(ap.xy*${scale.toFixed(2)})))/vec2(3,2)).rgb;
 vec3 pigment=tx*weights.x+ty*weights.y+tz*weights.z;
 float ink=dot(pigment,vec3(.2126,.7152,.0722));
 artHeight=ink;
 diffuseColor.rgb*=mix(1.0,clamp(ink/${average.toFixed(3)},.5,1.6),.72);
 diffuseColor.rgb*=mix(vec3(1.0),clamp(pigment/max(ink,.025),vec3(.75),vec3(1.25)),.18);
}

${surface === "dust" ? "diffuseColor.a *= smoothstep(0.0,0.3,ap.y) * (1.0-smoothstep(2.1,2.7,ap.y));" : ""}
`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
// Reuse the painted material's luminance for shallow surface relief; no extra texture or render pass.
vec3 artDx=dFdx(-vViewPosition), artDy=dFdy(-vViewPosition);
vec3 artR1=cross(artDy,normal), artR2=cross(normal,artDx);
float artDet=dot(artDx,artR1);
if(abs(artDet)>1e-10) {
  vec3 artGrad=dFdx(artHeight)*artR1+dFdy(artHeight)*artR2;
  normal=normalize(abs(artDet)*normal-sign(artDet)*artGrad*${relief.toFixed(3)});
}
`,
      );
  };
  material.customProgramCacheKey = () => "world-weather-" + surface + ":" + previousKey;
  material.userData.paintedSurface = surface;
  return material;
}

export function enemySurface(type) {
  const surface = actorMaterial(type);
  return surface === "energy" ? "crystal" : surface;
}

// Only physical lit meshes cast shadows; glow cards and attack geometry stay transparent to light.
export function setWorldShadows(root) {
  root.traverse((object) => {
    if (object.isMesh && object.material && !object.material.isMeshBasicMaterial && !object.material.isShaderMaterial)
      object.castShadow = object.receiveShadow = true;
  });
}
