// One distant, curved, world-anchored curtain mesh. No camera-facing cards enter the arena.
import { BufferGeometry, Float32BufferAttribute, Mesh, ShaderMaterial, DoubleSide } from "three";

function auroraGeometry(W, H) {
  const positions = [],
    uv = [],
    layers = [],
    indices = [],
    segments = 72,
    rows = 4;
  for (let layer = 0; layer < 3; layer++) {
    const base = positions.length / 3;
    for (let y = 0; y <= rows; y++)
      for (let i = 0; i <= segments; i++) {
        const u = i / segments,
          angle = (u - 0.5) * Math.PI;
        positions.push(
          (u - 0.5) * W * 4.6,
          0.6 + layer * 1.3 + Math.sin(u * 7 + layer) * 0.7 + (y / rows) * (6 + layer * 2),
          -H - 6 - layer * 5 - (1 - Math.cos(angle)) * 8,
        );
        uv.push(u, y / rows);
        layers.push(layer);
      }
    for (let y = 0; y < rows; y++)
      for (let i = 0; i < segments; i++) {
        const a = base + y * (segments + 1) + i;
        indices.push(a, a + 1, a + segments + 1, a + 1, a + segments + 2, a + segments + 1);
      }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("aLayer", new Float32BufferAttribute(layers, 1));
  g.setIndex(indices);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  // Include the maximum vertex-shader sway in CPU frustum bounds.
  g.boundingBox.expandByScalar(0.85);
  g.boundingSphere.radius += 0.85;
  return g;
}
export function createAurora(W, H) {
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
 uniform float uTime;attribute float aLayer;varying vec2 vUv;varying float vLayer;
 void main(){vUv=uv;vLayer=aLayer;vec3 p=position;
 p.z+=sin(uv.x*15.0+uTime*.06+aLayer)*.7;
 p.y+=sin(uv.x*9.0-uTime*.045+aLayer)*.45;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
 }`,
    fragmentShader: `
 uniform float uTime;varying vec2 vUv;varying float vLayer;
 void main(){
 float x=vUv.x*8.0+vLayer*1.7;
 float wave=sin(x*1.8+uTime*.045)*.045+sin(x*4.1-uTime*.03)*.022;
 float foot=.18+wave;
 float lower=smoothstep(foot-.025,foot+.018,vUv.y);
 float fall=exp(-max(0.0,vUv.y-foot)*3.2);
 float rays=pow(.5+.5*sin(x*26.0+sin(x*7.0)*2.0-uTime*.13),1.5);
 float edge=exp(-pow((vUv.y-foot)*36.0,2.0));
 float ends=smoothstep(0.0,.12,vUv.x)*(1.0-smoothstep(.88,1.0,vUv.x));
 float alpha=(rays*.3*fall*lower+edge*.17)*ends/(1.0+vLayer*.65);
 vec3 col=mix(vec3(.12,.72,.38),vec3(.32,.17,.52),smoothstep(.08,.62,vUv.y-foot));
 gl_FragColor=vec4(col,alpha);
 #include <colorspace_fragment>
 }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  const mesh = new Mesh(auroraGeometry(W, H), material);
  mesh.name = "distant-aurora";
  mesh.userData.scenery = "aurora";
  return mesh;
}
