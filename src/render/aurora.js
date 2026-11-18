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
 float x=vUv.x;
 float ribbon=vUv.y;
 float crease=sin(x*9.5+vLayer*.85+uTime*.065)*.11;
 float band=exp(-pow((ribbon-.51-crease)*4.2,2.0));
 float threads=.60+.40*cos(ribbon*118.0+sin(x*24.0+vLayer)*3.2);
 float margin=smoothstep(0.,.18,x)*smoothstep(0.,.18,1.-x);
 vec3 col=mix(vec3(.23,.63,.65),vec3(.74,.42,.67),smoothstep(.23,.78,ribbon));
 gl_FragColor=vec4(col,band*threads*margin*.25/(1.+vLayer*.55));
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
