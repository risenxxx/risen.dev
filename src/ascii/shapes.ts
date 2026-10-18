/*
  The solids the object can be, as signed distance functions.

  The GLSL is one string so every renderer compiles the same set, and the TS
  list beside it gives each shape its index, a label, how it should be
  turned — a mark meant to be seen face on sways, a solid turns right round
  — and `detail`, a factor on the glyph cell: 1 for a plain solid, less for
  a shape with thin parts or small features (a lattice's rods, a wrench's
  jaw) that a coarser grid would lose. `u_t` is the renderer's clock; the
  syncing tracks move on it.
*/
export const SHAPES = [
  { id: 'layers', label: 'Stack of layers', sway: false, tilt: 0.4, detail: 1 },
  { id: 'puzzle', label: 'Puzzle piece', sway: true, tilt: 0.25, detail: 0.9 },
  { id: 'lattice', label: 'Lattice', sway: false, tilt: 0.5, detail: 0.72 },
  { id: 'tunedlogo', label: 'Tuned mark', sway: true, tilt: 0.25, detail: 0.9 },
  { id: 'fplogo', label: 'Frame Player mark', sway: true, tilt: 0.2, detail: 0.85 },
  { id: 'dice', label: 'Die', sway: false, tilt: 0.55, detail: 0.82 },
  { id: 'sync', label: 'Two tracks syncing', sway: true, tilt: 0.45, detail: 0.8 },
  { id: 'stairs', label: 'Six steps', sway: false, tilt: 0.5, detail: 0.9 },
  { id: 'wrench', label: 'Wrench', sway: true, tilt: 0.25, detail: 0.72 },
  { id: 'star', label: 'Star', sway: true, tilt: 0.2, detail: 0.9 },
  { id: 'globe', label: 'Globe', sway: false, tilt: 0.45, detail: 0.78 },
] as const

export type ShapeId = (typeof SHAPES)[number]['id']

export const shapeIndex = (id: ShapeId): number => SHAPES.findIndex((s) => s.id === id)

/* Needs `uniform float u_t;` declared before it. */
export const SHAPES_GLSL = `
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdRR2(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sdTri2(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
               vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float extrude(vec3 p, float d2, float h) {
  vec2 w = vec2(d2, abs(p.z) - h);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

// five slabs, each a little smaller than the one under it
float shLayers(vec3 p) {
  float d = 1e9;
  for (int i = -2; i <= 2; i++) {
    vec3 q = p - vec3(0.0, float(i) * 0.42, 0.0);
    float s = 1.0 - 0.1 * float(i + 2);
    d = min(d, sdBox(q, vec3(0.95 * s, 0.04, 0.95 * s), 0.04));
  }
  return d;
}
// a jigsaw piece: two knobs, two sockets
float shPuzzle(vec3 p) {
  p /= 1.15;
  vec2 q = p.xy;
  float d2 = sdRR2(q, vec2(0.6), 0.08);
  d2 = min(d2, length(q - vec2(0.0, 0.76)) - 0.22);
  d2 = min(d2, length(q - vec2(0.76, 0.0)) - 0.22);
  d2 = max(d2, -(length(q - vec2(0.0, -0.6)) - 0.22));
  d2 = max(d2, -(length(q - vec2(-0.6, 0.0)) - 0.22));
  return extrude(p, d2, 0.12) * 1.15;
}
// twenty-seven nodes with the rods between them
float shLattice(vec3 p) {
  float k = 0.62;
  vec3 c = clamp(round(p / k), -1.0, 1.0) * k;
  float nodes = sdSphere(p - c, 0.11);
  vec3 a = abs(p);
  vec2 yz = p.yz - clamp(round(p.yz / k), -1.0, 1.0) * k;
  vec2 xz = p.xz - clamp(round(p.xz / k), -1.0, 1.0) * k;
  vec2 xy = p.xy - clamp(round(p.xy / k), -1.0, 1.0) * k;
  float rx = max(length(yz) - 0.03, a.x - k);
  float ry = max(length(xz) - 0.03, a.y - k);
  float rz = max(length(xy) - 0.03, a.z - k);
  return min(nodes, min(rx, min(ry, rz)));
}
// Tuned's mark, in the proportions of the SVG (units of 13): a 20-wide
// rounded frame with a 3-wide stroke, and a 12-wide rounded square over its
// lower-right corner, cut out of the frame with a 1.5 margin round it. Both
// are given real thickness, the square a little proud of the frame.
float shTunedLogo(vec3 p) {
  vec2 fc = vec2(-0.23, 0.23);
  vec2 pc = vec2(0.54, -0.54);
  float ring = abs(sdRR2(p.xy - fc, vec2(0.655), 0.385)) - 0.115;
  float frame = extrude(p, ring, 0.14);
  frame = max(frame, -sdBox(vec3(p.xy - pc, p.z), vec3(0.577, 0.577, 1.0), 0.42));
  float pad = sdBox(vec3(p.xy - pc, p.z - 0.1), vec3(0.46, 0.46, 0.14), 0.31);
  return min(frame, pad);
}
// Frame Player's mark: four corner brackets round a play triangle
float shFpLogo(vec3 p) {
  vec3 c = vec3(abs(p.xy), p.z);
  float d = sdCapsule(c, vec3(1.0, 1.0, 0.0), vec3(0.45, 1.0, 0.0), 0.11);
  d = min(d, sdCapsule(c, vec3(1.0, 1.0, 0.0), vec3(1.0, 0.45, 0.0), 0.11));
  float tri = sdTri2(p.xy, vec2(-0.3, 0.42), vec2(-0.3, -0.42), vec2(0.44, 0.0)) - 0.06;
  return min(d, extrude(p, tri, 0.1));
}
// a die with its pips cut in
float shDice(vec3 p) {
  float cube = sdBox(p, vec3(0.78), 0.16);
  float s = 0.78, o = 0.36, r = 0.13;
  float pip = sdSphere(p - vec3(0.0, 0.0, s), r);
  pip = min(pip, sdSphere(p - vec3(o, o, -s), r));
  pip = min(pip, sdSphere(p - vec3(-o, o, -s), r));
  pip = min(pip, sdSphere(p - vec3(o, 0.0, -s), r));
  pip = min(pip, sdSphere(p - vec3(-o, 0.0, -s), r));
  pip = min(pip, sdSphere(p - vec3(o, -o, -s), r));
  pip = min(pip, sdSphere(p - vec3(-o, -o, -s), r));
  pip = min(pip, sdSphere(p - vec3(s, o, o), r));
  pip = min(pip, sdSphere(p - vec3(s, -o, -o), r));
  pip = min(pip, sdSphere(p - vec3(-s, o, o), r));
  pip = min(pip, sdSphere(p - vec3(-s, -o, -o), r));
  pip = min(pip, sdSphere(p - vec3(-s, o, -o), r));
  pip = min(pip, sdSphere(p - vec3(-s, -o, o), r));
  pip = min(pip, sdSphere(p - vec3(-s, 0.0, 0.0), r));
  pip = min(pip, sdSphere(p - vec3(o, s, o), r));
  pip = min(pip, sdSphere(p - vec3(0.0, s, 0.0), r));
  pip = min(pip, sdSphere(p - vec3(-o, s, -o), r));
  pip = min(pip, sdSphere(p - vec3(o, -s, o), r));
  pip = min(pip, sdSphere(p - vec3(-o, -s, o), r));
  pip = min(pip, sdSphere(p - vec3(o, -s, -o), r));
  pip = min(pip, sdSphere(p - vec3(-o, -s, -o), r));
  return max(cube, -pip);
}
// two ribbons drifting in and out of phase, tall enough to fill the box
float shSync(vec3 p) {
  float ph = 1.4 * sin(u_t * 0.5);
  vec3 a = p - vec3(0.0, 0.46, 0.0);
  a.y -= 0.3 * sin(a.x * 2.6 + u_t * 1.2);
  vec3 b = p + vec3(0.0, 0.46, 0.0);
  b.y -= 0.3 * sin(b.x * 2.6 + u_t * 1.2 + ph);
  return min(sdBox(a, vec3(1.25, 0.06, 0.34), 0.03), sdBox(b, vec3(1.25, 0.06, 0.34), 0.03)) * 0.7;
}
// six steps up
float shStairs(vec3 p) {
  float d = 1e9;
  for (int i = 0; i < 6; i++) {
    float h = 0.3 * float(i + 1);
    d = min(d, sdBox(p - vec3(-0.9 + 0.36 * float(i), -0.95 + h * 0.5, 0.0), vec3(0.18, h * 0.5, 0.55), 0.02));
  }
  return d;
}
// a spanner, set diagonally: open jaw at one end, ring at the other
float shWrench(vec3 p) {
  p /= 1.22;
  p.xy *= rot(-0.6);
  float handle = sdBox(p, vec3(0.12, 0.62, 0.07), 0.05);
  vec2 h = p.xy - vec2(0.0, 0.72);
  float head2 = length(h) - 0.38;
  vec2 hs = h * rot(0.45);
  head2 = max(head2, -sdRR2(hs - vec2(0.0, 0.3), vec2(0.15, 0.4), 0.02));
  float head = extrude(vec3(h, p.z), head2, 0.1);
  vec2 b = p.xy - vec2(0.0, -0.72);
  float ring2 = max(length(b) - 0.32, -(length(b) - 0.15));
  float ring = extrude(vec3(b, p.z), ring2, 0.1);
  return min(handle, min(head, ring)) * 1.22;
}
// a star, for the repositories that collect them
float shStar(vec3 p) {
  return extrude(p, sdStar5(p.xy, 1.0, 0.45) - 0.05, 0.14);
}
// a shell cut into latitude rings and twelve meridians
float shGlobe(vec3 p) {
  float shell = max(sdSphere(p, 1.0), -sdSphere(p, 0.93));
  float lat = abs(mod(p.y + 0.2, 0.4) - 0.2) - 0.04;
  float ang = atan(p.z, p.x);
  float mer = abs(mod(ang + 0.2618, 0.5236) - 0.2618) * length(p.xz) - 0.03;
  return max(shell, min(lat, mer));
}

float shape(vec3 p, int s) {
  if (s == 0) return shLayers(p);
  if (s == 1) return shPuzzle(p);
  if (s == 2) return shLattice(p);
  if (s == 3) return shTunedLogo(p);
  if (s == 4) return shFpLogo(p);
  if (s == 5) return shDice(p);
  if (s == 6) return shSync(p);
  if (s == 7) return shStairs(p);
  if (s == 8) return shWrench(p);
  if (s == 9) return shStar(p);
  return shGlobe(p);
}
`
