import { Filter, GlProgram } from 'pixi.js';

/** Pixi v8's standard filter vertex shader (screen-aligned quad over the filter area). */
const VERTEX = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) { gl_Position = filterVertexPosition(); vTextureCoord = filterTextureCoord(); }`;

// ------------------------------------------------------------------------ lensing

const LENS_FRAGMENT = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform vec4 uLens0;
uniform vec4 uLens1;
uniform vec4 uLens2;
uniform vec4 uLens3;

// Thin point-mass lens. Light we see at angle theta from the lens came from beta = theta - thetaE^2 / theta,
// so each pixel samples the scene from slightly nearer (or, inside the Einstein radius, the far side of)
// the black hole. That bends the background into arcs and the Einstein ring.
// L.xy = centre (px), L.z = Einstein radius (px), L.w = shadow radius (px, drawn black).
vec2 bend(vec2 px, vec4 L, inout float shadow, inout float ring) {
  if (L.z <= 0.0) return vec2(0.0);
  vec2 d = px - L.xy;
  float r = max(length(d), 1.0);
  if (r < L.w) shadow = 1.0;
  ring += exp(-pow((r - L.z) / (L.z * 0.08), 2.0));
  float fade = smoothstep(L.z * 5.0, L.z * 2.0, r); // effect dies away so the screen edges stay put
  return -d / r * (L.z * L.z / r) * fade;
}

void main() {
  vec2 px = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  float shadow = 0.0, ring = 0.0;
  vec2 off = bend(px, uLens0, shadow, ring) + bend(px, uLens1, shadow, ring)
           + bend(px, uLens2, shadow, ring) + bend(px, uLens3, shadow, ring);
  vec2 coord = clamp((px + off - uOutputFrame.xy) * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
  vec4 c = texture(uTexture, coord);
  c.rgb += vec3(1.0, 0.85, 0.6) * min(ring, 1.0) * 0.25; // the photon ring catches the light
  finalColor = mix(c, vec4(0.0, 0.0, 0.0, c.a), shadow);
}`;

export interface Lens { x: number; y: number; einstein: number; shadow: number }

/**
 * Gravitational lensing for black holes (Black Hole Edge, Hawking's singularities): up to four
 * point-mass lenses in screen pixels, recomputed every frame.
 */
export class LensingFilter extends Filter {
  private readonly u: Record<string, Float32Array>;

  constructor() {
    const lens = () => ({ value: new Float32Array(4), type: 'vec4<f32>' as const });
    super({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: LENS_FRAGMENT, name: 'nb-lensing' }),
      resources: { lensUniforms: { uLens0: lens(), uLens1: lens(), uLens2: lens(), uLens3: lens() } },
    });
    this.u = this.resources.lensUniforms.uniforms as Record<string, Float32Array>;
  }

  set lenses(list: Lens[]) {
    for (let i = 0; i < 4; i++) {
      const v = this.u[`uLens${i}`], l = list[i];
      v[0] = l?.x ?? 0; v[1] = l?.y ?? 0; v[2] = l?.einstein ?? 0; v[3] = l?.shadow ?? 0;
    }
  }
}

// ------------------------------------------------------------------- chalk grade

const GRADE_FRAGMENT = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform vec4 uGrade; // x = time, y = grain, z = vignette, w = fringe

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 px = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 uv = vTextureCoord / uInputClamp.zw;        // 0..1 across the filtered area (the screen)
  vec2 c = uv - 0.5;
  // chromatic fringing grows toward the screen edges, like an old lens (up to ~4 px at the corners)
  vec2 shift = c * length(c) * uGrade.w * 16.0 * uInputSize.zw;
  float r = texture(uTexture, clamp(vTextureCoord + shift, uInputClamp.xy, uInputClamp.zw)).r;
  vec4 col = texture(uTexture, vTextureCoord);
  float b = texture(uTexture, clamp(vTextureCoord - shift, uInputClamp.xy, uInputClamp.zw)).b;
  col.r = r; col.b = b;
  // chalk dust: soft, slowly drifting blotches, plus fine animated grain
  float dust = noise(px * 0.012 + vec2(uGrade.x * 0.02, 0.0)) * noise(px * 0.05);
  float grain = hash(px + fract(uGrade.x) * 100.0) - 0.5;
  col.rgb += (grain * uGrade.y) + dust * uGrade.y * 0.6;
  // vignette
  float v = smoothstep(0.85, 0.25, length(c * vec2(1.0, 0.8)));
  col.rgb *= mix(1.0 - uGrade.z, 1.0, v);
  finalColor = col;
}`;

/**
 * The "Neon Chalkboard" grade over the whole fight: fine animated grain and chalk-dust blotches,
 * a vignette and a little chromatic fringing at the edges.
 */
export class ChalkGradeFilter extends Filter {
  private readonly g: Float32Array;

  constructor() {
    super({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: GRADE_FRAGMENT, name: 'nb-chalk-grade' }),
      resources: { gradeUniforms: { uGrade: { value: new Float32Array([0, 0.035, 0.38, 0.6]), type: 'vec4<f32>' } } },
    });
    this.g = (this.resources.gradeUniforms.uniforms as { uGrade: Float32Array }).uGrade;
  }

  set time(t: number) { this.g[0] = t; }
  /** Extra fringing (e.g. during an ULTIMATE). */
  set fringe(v: number) { this.g[3] = v; }
}
