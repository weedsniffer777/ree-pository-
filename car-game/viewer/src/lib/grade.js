// Shared colour grade: saturation, contrast, cool-shadow/warm-highlight split tone, vignette,
// plus an optional radial speed blur.
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1.24 }, contrast: { value: 1.08 }, vignette: { value: 0.28 }, lift: { value: 0 }, toon: { value: 0 }, blur: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float saturation, contrast, vignette, lift, toon, blur; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (blur > 0.0) { // radial speed blur toward the centre, edges only
        vec2 dir = (vUv - vec2(0.5, 0.48)) * blur * smoothstep(0.12, 0.55, distance(vUv, vec2(0.5, 0.48)));
        vec4 acc = c;
        for (int k = 1; k < 7; k++) acc += texture2D(tDiffuse, vUv - dir * float(k) / 6.0);
        c = acc / 7.0;
      }
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      // soft cel banding: pull luminance toward 4 smooth steps, keep hue
      float steps = 4.0;
      float q = (floor(l * steps) + smoothstep(0.35, 0.65, fract(l * steps))) / steps;
      vec3 base = c.rgb * mix(1.0, q / max(l, 1e-3), toon);
      float lb = dot(base, vec3(0.299, 0.587, 0.114));
      vec3 col = mix(vec3(lb), base, saturation);
      col = lift + col * (1.0 - lift); // raise the blacks
      col = (col - 0.5) * contrast + 0.5;
      col *= mix(vec3(0.92, 0.95, 1.04), vec3(1.07, 1.0, 0.88), smoothstep(0.15, 0.7, l)); // cool shadows, warm highlights
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};
