/**
 * Authentic assistant-ui WebGL Orb Shader & Configuration
 * Sourced directly from phosai-mobile (https://www.assistant-ui.com/elements/orb)
 * Rock-solid GLSL with NaN-protection and cross-platform WebKit / WebGL2 compatibility.
 */

export const ORB_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const ORB_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform float u_speed;
uniform float u_amplitude;
uniform float u_glow;
uniform float u_brightness;
uniform float u_pulse;
uniform float u_saturation;
uniform vec3 u_color0;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform float u_dpr;

// Simplex-like noise (3D)
vec3 mod289(vec3 x) { return x - floor(x / 289.0) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x / 289.0) * 289.0; }
vec4 permute(vec4 x) { return mod289((x * 34.0 + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  vec3 i = floor(v + dot(v, vec3(C.y)));
  vec3 x0 = v - i + dot(i, vec3(C.x));
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g, l.zxy);
  vec3 i2 = max(g, l.zxy);
  vec3 x1 = x0 - i1 + C.x;
  vec3 x2 = x0 - i2 + C.y;
  vec3 x3 = x0 - 0.5;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec4 j = p - 49.0 * floor(p / 49.0);
  vec4 x_ = floor(j / 7.0);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = (x_ * 2.0 + 0.5) / 7.0 - 1.0;
  vec4 y = (y_ * 2.0 + 0.5) / 7.0 - 1.0;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 g0 = vec3(a0.xy, h.x);
  vec3 g1 = vec3(a0.zw, h.y);
  vec3 g2 = vec3(a1.xy, h.z);
  vec3 g3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g0,g0), dot(g1,g1), dot(g2,g2), dot(g3,g3)));
  g0 *= norm.x; g1 *= norm.y; g2 *= norm.z; g3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(g0,x0), dot(g1,x1), dot(g2,x2), dot(g3,x3)));
}

void main() {
  vec2 uv = v_uv * 2.0 - 1.0;
  float dist = length(uv);
  float t = u_time * u_speed;

  // Perfect circle — hard boundary, soft anti-aliased edge
  float radius = 0.44;
  float circle = 1.0 - smoothstep(radius - 0.008, radius + 0.008, dist);

  if (circle < 0.001) {
    // Outer glow only
    float glowDist = max(0.0, dist - radius);
    float glow = exp(-clamp(glowDist * 12.0, 0.0, 20.0)) * u_glow * 0.4;
    vec3 glowColor = mix(u_color0, u_color1, 0.5);
    fragColor = vec4(glowColor * glow, glow);
    return;
  }

  float n1 = clamp(snoise(vec3(uv * 2.0, t * 0.6)) * 0.5 + 0.5, 0.0, 1.0);
  float n2 = clamp(snoise(vec3(uv * 3.5 + 7.0, t * 0.9)) * 0.5 + 0.5, 0.0, 1.0);
  float n3 = clamp(snoise(vec3(uv * 1.5 - 3.0, t * 0.4 + 10.0)) * 0.5 + 0.5, 0.0, 1.0);

  vec2 distort = vec2(
    snoise(vec3(uv * 2.0 + 5.0, t * 0.7)),
    snoise(vec3(uv * 2.0 + 15.0, t * 0.7))
  ) * u_amplitude * 2.0;
  float n4 = clamp(snoise(vec3((uv + distort) * 3.0, t * 0.5)) * 0.5 + 0.5, 0.0, 1.0);

  vec3 col = mix(u_color0, u_color1, n1);
  col = mix(col, u_color2, n2 * 0.5);
  col = mix(col, u_color1 * 1.3, n4 * 0.4);

  // NaN protection: clamp n3 before pow
  float vein = pow(clamp(n3, 0.0, 1.0), 3.0) * u_amplitude * 6.0;
  col += vein * mix(u_color1, vec3(1.0), 0.3);

  float centerDist = clamp(dist / radius, 0.0, 1.0);
  float depthShade = 1.0 - centerDist * centerDist * 0.4;
  col *= depthShade;

  float rim = pow(centerDist, 4.0) * 0.6;
  col += rim * mix(u_color0, vec3(1.0), 0.5);

  vec2 lightPos = vec2(-0.15, -0.18);
  float specDist = length(uv - lightPos);
  float spec = exp(-clamp(specDist * specDist * 30.0, 0.0, 30.0)) * 0.7;
  col += spec * vec3(1.0);

  vec2 lightPos2 = vec2(0.2, 0.25);
  float spec2 = exp(-clamp(length(uv - lightPos2) * 8.0, 0.0, 30.0)) * 0.15;
  col += spec2 * u_color1;

  float pulseFactor = 1.0 + u_pulse * sin(u_time * 3.5) * 0.35;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, clamp(u_saturation, 0.0, 2.0));

  col *= max(0.0, u_brightness * pulseFactor);

  fragColor = vec4(clamp(col, 0.0, 1.0), circle);
}
`;

export type OrbVariant = "blue" | "violet" | "emerald" | "default" | "amber";

export const ORB_PALETTES: Record<string, [number[], number[], number[]]> = {
  blue: [
    [0.15, 0.55, 1.0], // Electric deep blue
    [0.35, 0.75, 1.0], // Glowing cyan
    [0.1, 0.35, 0.85], // Vibrant royal blue
  ],
  violet: [
    [0.6, 0.3, 1.0],
    [0.8, 0.5, 1.0],
    [0.4, 0.15, 0.8],
  ],
  emerald: [
    [0.15, 0.75, 0.55],
    [0.3, 0.9, 0.7],
    [0.1, 0.55, 0.4],
  ],
  amber: [
    [0.95, 0.6, 0.1],
    [1.0, 0.8, 0.25],
    [0.85, 0.4, 0.05],
  ],
  default: [
    [0.15, 0.55, 1.0],
    [0.35, 0.75, 1.0],
    [0.1, 0.35, 0.85],
  ],
};

// Specialized palette overrides for distinct voice states
export const STATE_PALETTES: Record<string, [number[], number[], number[]]> = {
  idle: [
    [0.15, 0.55, 1.0],
    [0.35, 0.75, 1.0],
    [0.1, 0.35, 0.85],
  ],
  connecting: [
    [0.2, 0.6, 1.0],
    [0.4, 0.8, 1.0],
    [0.1, 0.4, 0.9],
  ],
  listening: [
    [0.1, 0.45, 0.95],
    [0.25, 0.7, 1.0],
    [0.08, 0.3, 0.8],
  ],
  speaking: [
    [0.15, 0.65, 1.0],
    [0.45, 0.92, 1.0],
    [0.2, 0.42, 0.95],
  ],
  thinking: [
    [0.45, 0.25, 0.95],
    [0.7, 0.45, 1.0],
    [0.3, 0.15, 0.75],
  ],
  processing: [
    [0.45, 0.25, 0.95],
    [0.7, 0.45, 1.0],
    [0.3, 0.15, 0.75],
  ],
  toolcalling: [
    [0.9, 0.45, 0.1],
    [1.0, 0.7, 0.2],
    [0.8, 0.3, 0.05],
  ],
  muted: [
    [0.35, 0.38, 0.42],
    [0.48, 0.5, 0.54],
    [0.25, 0.26, 0.3],
  ],
  error: [
    [0.85, 0.25, 0.25],
    [0.95, 0.45, 0.45],
    [0.6, 0.15, 0.15],
  ],
};

export interface OrbStateConfig {
  speed: number;
  amplitude: number;
  glow: number;
  brightness: number;
  pulse: number;
  saturation: number;
}

export const ORB_STATE_CONFIGS: Record<string, OrbStateConfig> = {
  idle: {
    speed: 0.12,
    amplitude: 0.03,
    glow: 0.18,
    brightness: 0.65,
    pulse: 0,
    saturation: 0.65,
  },
  connecting: {
    speed: 0.28,
    amplitude: 0.07,
    glow: 0.45,
    brightness: 0.8,
    pulse: 0.9,
    saturation: 0.85,
  },
  listening: {
    speed: 0.22,
    amplitude: 0.07,
    glow: 0.45,
    brightness: 0.82,
    pulse: 0,
    saturation: 0.9,
  },
  speaking: {
    speed: 0.68,
    amplitude: 0.32,
    glow: 0.95,
    brightness: 1.15,
    pulse: 0,
    saturation: 1.0,
  },
  thinking: {
    speed: 0.42,
    amplitude: 0.16,
    glow: 0.65,
    brightness: 0.85,
    pulse: 0.6,
    saturation: 0.95,
  },
  processing: {
    speed: 0.42,
    amplitude: 0.16,
    glow: 0.65,
    brightness: 0.85,
    pulse: 0.6,
    saturation: 0.95,
  },
  toolcalling: {
    speed: 0.55,
    amplitude: 0.24,
    glow: 0.8,
    brightness: 1.0,
    pulse: 0.5,
    saturation: 1.0,
  },
  muted: {
    speed: 0.05,
    amplitude: 0.015,
    glow: 0.06,
    brightness: 0.32,
    pulse: 0,
    saturation: 0.15,
  },
  error: {
    speed: 0.05,
    amplitude: 0.015,
    glow: 0.06,
    brightness: 0.32,
    pulse: 0,
    saturation: 0.15,
  },
};
