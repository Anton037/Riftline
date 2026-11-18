import { MeshPhongMaterial } from "three";
import { actorMaterial } from "../data/materials.js";

export const WORLD_SURFACES = {
  finishMap: { value: null },
  finishReady: { value: 0 },
};

// Atlas column, row, glaze strength and highlight tightness.
const FINISHES = {
  metal: [0, 0, 0.29, 74],
  armor: [1, 0, 0.37, 52],
  organic: [2, 0, 0.19, 30],
  rubber: [0, 1, 0.08, 15],
  wood: [1, 1, 0.14, 28],
  ice: [2, 1, 0.45, 100],
  crystal: [2, 1, 0.46, 112],
  stone: [1, 1, 0.24, 36],
  basalt: [0, 1, 0.16, 25],
  sandstone: [1, 1, 0.24, 32],
  dust: [0, 1, 0.02, 10],
};

export function worldMaterial({ color = 0xffffff, surface = "stone", ...options }) {
  const [x, y, glaze, shine] = FINISHES[surface] ?? FINISHES.stone;
  const material = new MeshPhongMaterial({
    color,
    specular: surface === "metal" ? 0xa78f73 : 0x84807b,
    shininess: shine,
    ...options,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uArtMap = WORLD_SURFACES.finishMap;
    shader.uniforms.uArtReady = WORLD_SURFACES.finishReady;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGlazeP, vGlazeN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlazeP=position; vGlazeN=objectNormal;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vGlazeP, vGlazeN;
uniform sampler2D uArtMap;
uniform float uArtReady;
float kilnSample(vec2 uv) {
  vec2 tile=vec2(${x}.0,${y}.0);
  return texture2D(uArtMap,(tile+mix(vec2(.004),vec2(.996),fract(uv)))/vec2(3,2)).r;
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 kilnNormal=normalize(vGlazeN);
vec3 weight=pow(abs(kilnNormal),vec3(3.0));
weight/=max(dot(weight,vec3(1.0)),.001);
vec3 p=vGlazeP*${surface === "metal" ? "1.1" : ".72"};
float enamel=.45;
if(uArtReady>.5) {
  enamel=dot(weight, vec3(kilnSample(p.zy),kilnSample(p.xz),kilnSample(p.xy)));
}
float inlay=smoothstep(.74,.88,enamel);
diffuseColor.rgb*=.8+enamel*.5;
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.25,1.12,.9)+vec3(.05,.032,.01),inlay*.35);
${surface === "dust" ? "diffuseColor.a*=smoothstep(0.0,.3,vGlazeP.y)*(1.0-smoothstep(2.1,2.7,vGlazeP.y));" : ""}
`,
      )
      .replace(
        "#include <opaque_fragment>",
        `float kilnRim=pow(1.0-clamp(dot(normalize(normal),normalize(vViewPosition)),0.0,1.0),3.2);
outgoingLight+=kilnRim*${glaze.toFixed(2)}*(diffuseColor.rgb*.22+vec3(.14,.104,.076));
outgoingLight+=diffuseColor.rgb*max(kilnNormal.y,0.0)*.09;
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "glaze:" + surface;
  material.userData.paintedSurface = surface;
  return material;
}

export function enemySurface(type) {
  const surface = actorMaterial(type);
  return surface === "energy" ? "crystal" : surface;
}

export function setWorldShadows(root) {
  root.traverse((object) => {
    const mat = object.material;
    if (
      object.isMesh &&
      mat &&
      !mat.isMeshBasicMaterial &&
      !mat.isShaderMaterial &&
      (!mat.transparent || mat.opacity >= 0.5)
    )
      object.castShadow = object.receiveShadow = true;
  });
}
