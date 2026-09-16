import * as THREE from "three";

// A spiral-bound sheet turning over its binding.
//
// The sheet is inextensible, so it cannot simply rotate: it bends. Every vertex walks the
// page from the binding to its own position, accumulating a bend angle as it goes, which
// keeps arc length constant and produces the lift-curl-flop silhouette of real paper.
// The walk runs in the vertex shader, so the mesh can be dense enough to stay smooth.

const BINDING_SWEEP = Math.PI * 1.04; // A shade past flat, so the sheet settles behind the block.
const WALK_STEPS = 40;

// Three darkening passes stand in for a penumbra: tight and dark, then wide and faint.
const SHADOW_TAPS = [
  { spread: 1, alpha: 0.16 },
  { spread: 2.6, alpha: 0.1 },
  { spread: 6, alpha: 0.06 },
];

export type TurnUniforms = {
  progress: number;
  /** How far the leading corner runs ahead of the bound edge, 0-0.5. */
  lead: number;
  /** Radians of extra bend the free end gains from its own weight. */
  droop: number;
  /** Radians of tight roll gathered in the last stretch before the free edge. */
  tipCurl: number;
  /** Transverse cupping across the width, as a fraction of page width. */
  cup: number;
  /** Damped wobble folded into the droop after the sheet lands. */
  flutter: number;
};

export const RESTING_TURN: TurnUniforms = {
  progress: 0,
  lead: 0.26,
  droop: 1.05,
  tipCurl: 0.62,
  cup: 0.05,
  flutter: 0,
};

// Shared by the sheet and its shadow so the two can never drift apart.
const BEND_WALK = /* glsl */ `
  #define PI 3.141592653589793

  uniform float uProgress;
  uniform float uLead;
  uniform float uDroop;
  uniform float uTipCurl;
  uniform float uCup;
  uniform float uFlutter;
  uniform vec2 uPage;

  // How far along its turn this column is. The leading edge starts first and the bound
  // corner trails, which is what bows the crease instead of ruling it straight.
  float columnPhase(float u) {
    return clamp((uProgress - uLead * (1.0 - u)) / max(1e-4, 1.0 - uLead), 0.0, 1.0);
  }

  // Cumulative bend at distance rho (0 at the binding, 1 at the free edge).
  float bendAngle(float rho, float phase) {
    float energy = sin(PI * phase);
    float root = BINDING_SWEEP * phase;
    float droop = uDroop * energy;
    float tip = uTipCurl * energy;
    // The whip of a dropping sheet outlives the sweep that threw it, so this term is
    // deliberately not tied to the turn's energy.
    float wobble = uFlutter * pow(rho, 2.2);
    return root + droop * pow(rho, 1.7) + tip * smoothstep(0.66, 1.0, rho) + wobble;
  }

  vec3 bendPoint(float x, float y) {
    float halfHeight = uPage.y * 0.5;
    float u = x / uPage.x + 0.5;
    float phase = columnPhase(u);
    float span = max(0.0, halfHeight - y);
    float stepLength = span / float(WALK_STEPS);

    float walkY = halfHeight;
    float walkZ = 0.0;
    for (int i = 0; i < WALK_STEPS; i++) {
      float along = (float(i) + 0.5) * stepLength;
      float angle = bendAngle(along / uPage.y, phase);
      walkY -= cos(angle) * stepLength;
      walkZ += sin(angle) * stepLength;
    }

    // Paper never stays flat across its width while it turns; it troughs slightly.
    float cup = uCup * sin(PI * phase) * (0.25 - (u - 0.5) * (u - 0.5)) * uPage.x;
    return vec3(x, walkY, walkZ + cup);
  }
`;

const SHEET_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vec3 bent = bendPoint(position.x, position.y);

    // Down-page tangent is the walk's own derivative, so it needs no second walk.
    float u = position.x / uPage.x + 0.5;
    float rho = max(0.0, uPage.y * 0.5 - position.y) / uPage.y;
    float angle = bendAngle(rho, columnPhase(u));
    vec3 downPage = vec3(0.0, -cos(angle), sin(angle));
    vec3 acrossPage = normalize(bendPoint(position.x + uPage.x * 0.01, position.y) - bent);

    vNormal = normalize(normalMatrix * normalize(cross(downPage, acrossPage)));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(bent, 1.0);
  }
`;

const SHEET_FRAGMENT = /* glsl */ `
  uniform sampler2D uPageMap;
  uniform vec3 uLightDir;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 normal = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
    vec3 printed = texture2D(uPageMap, vUv).rgb;
    // The reverse of a sheet is blank stock with a little of the print bleeding through.
    vec3 base = gl_FrontFacing ? printed : mix(vec3(0.949, 0.939, 0.909), printed, 0.09);

    vec3 light = normalize(uLightDir);
    float wrapped = max(dot(normal, light) * 0.5 + 0.5, 0.0);
    float direct = max(dot(normal, light), 0.0);
    float sheen = pow(max(dot(normal, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0), 18.0) * 0.1;
    // Paper is thin: lit from behind it glows rather than going black.
    float transmitted = pow(max(dot(-normal, light), 0.0), 2.0) * 0.16;
    // The inside of a curl sees less of the room than the face turned toward it.
    float cavity = mix(0.87, 1.0, smoothstep(0.0, 0.55, abs(normal.z)));

    // Paper in room light barely shades at all; most of what reaches it is bounce. Push
    // the directional terms any harder and the sheet turns into grey card.
    float shade = (0.74 + 0.22 * wrapped + 0.06 * direct) * cavity * 1.032;
    // What shading there is runs warm, the way light off paper does.
    vec3 tinted = mix(vec3(0.97, 0.955, 0.93), vec3(1.0), shade);
    gl_FragColor = vec4(base * shade * tinted + sheen + transmitted, 1.0);
  }
`;

// The sheet flattened down the light direction onto the block it is lifting away from.
const SHADOW_VERTEX = /* glsl */ `
  uniform vec3 uLightDir;
  uniform float uSpread;
  varying float vLift;
  varying float vDropY;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 bent = bendPoint(position.x, position.y);
    vec3 light = normalize(uLightDir);
    vLift = bent.z;
    // Not named "cast": that is a reserved word in GLSL.
    vec3 dropped = bent - light * (bent.z / max(0.25, light.z));
    // Widening the drop with each pass fakes the penumbra of a soft room light.
    dropped.xy += (dropped.xy - bent.xy) * (uSpread - 1.0) * 0.12;
    vDropY = dropped.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(dropped.x, dropped.y, 0.0, 1.0);
  }
`;

const SHADOW_FRAGMENT = /* glsl */ `
  uniform float uAlpha;
  uniform float uSpread;
  varying float vLift;
  varying float vDropY;
  varying vec2 vUv;

  void main() {
    // Contact shadow is crisp; the further the paper lifts, the more the edge dissolves.
    float contact = 1.0 / (1.0 + abs(vLift) * 0.012 * uSpread);
    float edge = smoothstep(0.0, 0.06 * uSpread, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    // Once the sheet is up and over the wire it has stopped shading the block it left,
    // and past the binding there is no longer any surface for a shadow to land on.
    float leaving = 1.0 - smoothstep(0.30, 0.74, uProgress);
    float onBlock = 1.0 - smoothstep(uPage.y * 0.36, uPage.y * 0.5, vDropY);
    gl_FragColor = vec4(0.09, 0.09, 0.11, uAlpha * contact * edge * leaving * onBlock);
  }
`;

function buildUniforms(page: THREE.Vector2, light: THREE.Vector3) {
  return {
    uProgress: { value: 0 },
    uLead: { value: RESTING_TURN.lead },
    uDroop: { value: RESTING_TURN.droop },
    uTipCurl: { value: RESTING_TURN.tipCurl },
    uCup: { value: RESTING_TURN.cup },
    uFlutter: { value: 0 },
    uPage: { value: page },
    uLightDir: { value: light },
  };
}

function prefix(source: string) {
  return `#define WALK_STEPS ${WALK_STEPS}\n#define BINDING_SWEEP ${BINDING_SWEEP.toFixed(6)}\n${BEND_WALK}\n${source}`;
}

export type PageTurn = {
  draw: (turn: TurnUniforms) => void;
  dispose: () => void;
};

/**
 * Mounts one turning sheet into `canvas`, textured with `texture` and sized to `page`
 * (both in CSS pixels, page measured relative to the canvas box).
 */
export function createPageTurn(
  renderer: THREE.WebGLRenderer,
  canvas: { width: number; height: number },
  page: { width: number; height: number; left: number; top: number },
  texture: THREE.Texture,
): PageTurn {
  const fov = 32;
  const camera = new THREE.PerspectiveCamera(fov, canvas.width / canvas.height, 1, canvas.height * 12);
  // Placing the camera this far back makes one world unit equal one CSS pixel at z = 0,
  // so the turning sheet lines up with the DOM page it replaces.
  camera.position.z = canvas.height / 2 / Math.tan((fov / 2) * (Math.PI / 180));

  const scene = new THREE.Scene();
  const pageSize = new THREE.Vector2(page.width, page.height);
  const lightDir = new THREE.Vector3(-0.42, 0.58, 0.70).normalize();
  const geometry = new THREE.PlaneGeometry(page.width, page.height, 56, 96);

  const offsetX = page.left + page.width / 2 - canvas.width / 2;
  const offsetY = canvas.height / 2 - page.top - page.height / 2;

  const materials: THREE.ShaderMaterial[] = [];
  const place = (mesh: THREE.Mesh, order: number) => {
    mesh.position.set(offsetX, offsetY, 0);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    scene.add(mesh);
  };

  SHADOW_TAPS.forEach((tap, index) => {
    const uniforms = buildUniforms(pageSize, lightDir);
    const material = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uAlpha: { value: tap.alpha }, uSpread: { value: tap.spread } },
      vertexShader: prefix(SHADOW_VERTEX),
      fragmentShader: prefix(SHADOW_FRAGMENT),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    materials.push(material);
    place(new THREE.Mesh(geometry, material), index);
  });

  const sheetMaterial = new THREE.ShaderMaterial({
    uniforms: { ...buildUniforms(pageSize, lightDir), uPageMap: { value: texture } },
    vertexShader: prefix(SHEET_VERTEX),
    fragmentShader: prefix(SHEET_FRAGMENT),
    side: THREE.DoubleSide,
  });
  materials.push(sheetMaterial);
  place(new THREE.Mesh(geometry, sheetMaterial), SHADOW_TAPS.length);

  function draw(turn: TurnUniforms) {
    for (const material of materials) {
      material.uniforms.uProgress.value = turn.progress;
      material.uniforms.uLead.value = turn.lead;
      material.uniforms.uDroop.value = turn.droop;
      material.uniforms.uTipCurl.value = turn.tipCurl;
      material.uniforms.uCup.value = turn.cup;
      material.uniforms.uFlutter.value = turn.flutter;
    }
    renderer.render(scene, camera);
  }

  draw(RESTING_TURN);

  return {
    draw,
    dispose: () => {
      for (const material of materials) material.dispose();
      geometry.dispose();
      scene.clear();
    },
  };
}

/** One renderer for the whole page: WebGL contexts are scarce, and turns are frequent. */
export function createTurnRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  // The page texture is already sRGB-encoded DOM output, and the shading is a gentle
  // shade over it. Keeping the whole path unconverted guarantees the turning sheet is
  // the exact colour of the flat page it replaces.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  return renderer;
}

export function createPageTexture(renderer: THREE.WebGLRenderer, source: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // Grazing angles through the curl are where unfiltered type falls apart.
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}
