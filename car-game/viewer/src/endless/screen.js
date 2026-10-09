import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Everything after the 3D render in ONE full-screen pass (it used to be up to three):
// tone mapping and sRGB output, the shattered-windscreen distortion when there are
// cracks, the radial speed blur, then the colour grade (saturation, cel banding, lift, contrast, split tone,
// vignette). Glass writes its maps into tDisp / tLines and switches `glass` on.

const Shader = {
  uniforms: {
    tDiffuse: { value: null }, toneMappingExposure: { value: 1 },
    tDisp: { value: null }, tLines: { value: null }, glass: { value: 0 }, px: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    saturation: { value: 1.24 }, contrast: { value: 1.08 }, vignette: { value: 0.28 }, lift: { value: 0 }, toon: { value: 0 }, blur: { value: 0 },
  },
  defines: { ACES_FILMIC_TONE_MAPPING: '', SRGB_TRANSFER: '' },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    #include <tonemapping_pars_fragment>
    uniform sampler2D tDiffuse, tDisp, tLines; uniform vec2 px; uniform float glass;
    uniform float saturation, contrast, vignette, lift, toon, blur; varying vec2 vUv;
    // the rendered scene at uv, as it would come out of the output pass
    vec3 scene(vec2 uv) {
      vec3 c = texture2D(tDiffuse, uv).rgb;
      c = ACESFilmicToneMapping(c);
      return sRGBTransferOETF(vec4(c, 1.0)).rgb;
    }
    void main() {
      vec2 off = vec2(0.0); float frost = 0.0;
      if (glass > 0.5) { vec4 d = texture2D(tDisp, vUv); off = (d.rg - 0.5) * 0.09; frost = d.b; }
      vec3 c = scene(vUv + off);
      if (glass > 0.5) {
        // crushed glass: scatter the view and wash it towards white
        if (frost > 0.01) {
          vec2 r = px * (2.0 + frost * 9.0);
          vec3 b = scene(vUv + off + r) + scene(vUv + off - r) + scene(vUv + off + vec2(-r.x, r.y)) + scene(vUv + off + vec2(r.x, -r.y));
          c = mix(c, b * 0.25, min(1.0, frost * 1.4));
          c = mix(c, vec3(0.86, 0.9, 0.93), frost * 0.55);
        }
        vec4 l = texture2D(tLines, vUv);
        float fr = texture2D(tLines, vUv + vec2(px.x * 2.0, 0.0)).a - l.a; // colour fringe along the cracks
        c.r += fr * 0.12; c.b -= fr * 0.12;
        c = mix(c, l.rgb, l.a);
      }
      if (blur > 0.0) { // radial speed blur toward the centre, edges only
        vec2 dir = (vUv - vec2(0.5, 0.48)) * blur * smoothstep(0.12, 0.55, distance(vUv, vec2(0.5, 0.48)));
        vec3 acc = c;
        for (int k = 1; k < 7; k++) acc += scene(vUv + off - dir * float(k) / 6.0);
        c = acc / 7.0;
      }
      // grade
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      float q = (floor(l * 4.0) + smoothstep(0.35, 0.65, fract(l * 4.0))) / 4.0; // soft cel banding
      vec3 base = c * mix(1.0, q / max(l, 1e-3), toon);
      float lb = dot(base, vec3(0.299, 0.587, 0.114));
      vec3 col = mix(vec3(lb), base, saturation);
      col = lift + col * (1.0 - lift);
      col = (col - 0.5) * contrast + 0.5;
      col *= mix(vec3(0.92, 0.95, 1.04), vec3(1.07, 1.0, 0.88), smoothstep(0.15, 0.7, l)); // cool shadows, warm highlights
      col *= 1.0 - vignette * smoothstep(0.35, 0.85, distance(vUv, vec2(0.5)));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export function screenPass(renderer) {
  const pass = new ShaderPass(Shader);
  pass.material.toneMapped = false; // the shader tone-maps itself (three would add its own copy)
  const render = pass.render.bind(pass);
  pass.render = (r, ...rest) => { pass.uniforms.toneMappingExposure.value = renderer.toneMappingExposure; render(r, ...rest); };
  return pass;
}
