import {
  DataTexture,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import type { BackdropPainter } from "@/lib/media/backdrop-painter";
import { STORY_HEIGHT, STORY_WIDTH } from "@/lib/media/composition";

// A periodic domain warp samples the actual photograph's soft color field.
// It invents no hues in From photo mode. The sharp foreground is never sampled
// or distorted here: Konva composites that separate layer above this canvas.
const fragmentShader = `
  uniform sampler2D photo;
  uniform float phase;
  uniform float amount;
  uniform float detail;
  uniform float seed;
  uniform float grain;
  uniform float dim;
  uniform float fromPhoto;
  uniform vec3 base;
  uniform vec3 color;
  uniform vec3 accent;
  varying vec2 vUv;
  vec2 mirror(vec2 uv) { return 1.0 - abs(mod(uv, 2.0) - 1.0); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233)) + seed) * 43758.5453); }
  void main() {
    vec2 p = vec2(vUv.x, 1.0-vUv.y);
    vec2 orbit = vec2(cos(phase), sin(phase));
    vec2 q = p * vec2(2.0, 3.4) + seed;
    float complexity = 1.0 + detail * 1.7;
    for (int i = 0; i < 4; i++) {
      float f = float(i) + 1.0;
      q += (0.22 + amount * 0.42) / f * vec2(
        sin(q.y * complexity + orbit.x * 1.3 + f),
        cos(q.x * complexity - orbit.y * 1.3 + f)
      );
    }
    vec2 uv = mirror(p + 0.27 * q + amount * 0.12 * orbit);
    // Several nearby samples soften the source without a recognisable duplicate.
    vec3 sampled = texture2D(photo, uv).rgb * 0.4;
    sampled += texture2D(photo, mirror(uv + vec2(0.025,0.0))).rgb * 0.15;
    sampled += texture2D(photo, mirror(uv - vec2(0.025,0.0))).rgb * 0.15;
    sampled += texture2D(photo, mirror(uv + vec2(0.0,0.025))).rgb * 0.15;
    sampled += texture2D(photo, mirror(uv - vec2(0.0,0.025))).rgb * 0.15;
    float t = 0.5 + 0.5 * sin(q.x + q.y);
    vec3 recolored = t < 0.5 ? mix(base, color, t*2.0) : mix(color, accent, t*2.0-1.0);
    vec3 result = mix(recolored, sampled, fromPhoto);
    result += (hash(floor(vUv * vec2(1080.0,1920.0)))-0.5) * grain * 0.14;
    gl_FragColor = vec4(clamp(result * (1.0-dim), 0.0, 1.0), 1.0);
  }
`;

function encodedColor(hex: string) {
  return new Vector3(
    ...([1, 3, 5].map(
      (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
    ) as [number, number, number]),
  );
}

export function createPhotoMelt(
  field: number[] | undefined,
  thumbnail = false,
): BackdropPainter {
  const renderer = new WebGLRenderer({
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(
    thumbnail ? 120 : STORY_WIDTH,
    thumbnail ? 214 : STORY_HEIGHT,
    false,
  );
  const data = new Uint8Array(field ?? new Array(32 * 32 * 4).fill(128));
  const texture = new DataTexture(data, 32, 32);
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  const uniforms = {
    photo: { value: texture },
    phase: { value: 0 },
    amount: { value: 0.65 },
    detail: { value: 0.45 },
    seed: { value: 0 },
    grain: { value: 0 },
    dim: { value: 0 },
    fromPhoto: { value: 1 },
    base: { value: new Vector3() },
    color: { value: new Vector3() },
    accent: { value: new Vector3() },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader:
      "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new PlaneGeometry(2, 2);
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let disposed = false;
  return {
    draw(context, settings, progress) {
      if (disposed) return;
      if (renderer.getContext().isContextLost())
        throw new Error(
          "The graphics context was lost. Reload the photo or choose another backdrop.",
        );
      uniforms.phase.value = settings.animated
        ? (((progress % 1) + 1) % 1) * Math.PI * 2
        : 0;
      uniforms.amount.value = settings.intensity / 100;
      uniforms.detail.value = settings.detail / 100;
      uniforms.seed.value = settings.seed * 0.618;
      uniforms.grain.value = settings.grain / 100;
      uniforms.dim.value = settings.dim / 100;
      uniforms.fromPhoto.value = settings.palette === "photo" && field ? 1 : 0;
      uniforms.base.value.copy(encodedColor(settings.colors[0]));
      uniforms.color.value.copy(encodedColor(settings.colors[1]));
      uniforms.accent.value.copy(encodedColor(settings.colors[2]));
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, 0, 0, STORY_WIDTH, STORY_HEIGHT);
    },
    dispose() {
      disposed = true;
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.width = renderer.domElement.height = 0;
    },
  };
}
