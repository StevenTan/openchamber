type CursorPoint = { x: number; y: number };
type CursorBounds = { width: number; height: number };
type Segment = { control1: CursorPoint; control2: CursorPoint; end: CursorPoint };
type Path = { start: CursorPoint; end: CursorPoint; segments: Segment[] };

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const distance = (a: CursorPoint, b: CursorPoint): number => Math.hypot(b.x - a.x, b.y - a.y);
const clickTangent = { x: Math.sin(-44 * Math.PI / 180), y: -Math.cos(-44 * Math.PI / 180) };
const unit = (point: CursorPoint): CursorPoint => {
  const length = Math.hypot(point.x, point.y);
  return length < 0.001 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
};
const angleDelta = (from: number, to: number): number => ((to - from + 540) % 360 + 360) % 360 - 180;

const handle = (bounds: CursorBounds, point: CursorPoint, axis: CursorPoint, length: number): CursorPoint => {
  if (axis.x < 0) length = Math.min(length, -point.x / axis.x);
  if (axis.x > 0) length = Math.min(length, (bounds.width - point.x) / axis.x);
  if (axis.y < 0) length = Math.min(length, -point.y / axis.y);
  if (axis.y > 0) length = Math.min(length, (bounds.height - point.y) / axis.y);
  return { x: point.x + axis.x * Math.max(0, length), y: point.y + axis.y * Math.max(0, length) };
};

const sampleSegment = (start: CursorPoint, segment: Segment, progress: number): CursorPoint => {
  const rest = 1 - progress;
  const weights = [rest ** 3, 3 * rest ** 2 * progress, 3 * rest * progress ** 2, progress ** 3];
  const points = [start, segment.control1, segment.control2, segment.end];
  return points.reduce((sum, point, index) => ({ x: sum.x + point.x * weights[index], y: sum.y + point.y * weights[index] }), { x: 0, y: 0 });
};

const samplePath = (path: Path, progress: number) => {
  const position = clamp(progress, 0, 1) * path.segments.length;
  const index = Math.min(Math.floor(position), path.segments.length - 1);
  const t = position - index;
  const start = index === 0 ? path.start : path.segments[index - 1].end;
  const segment = path.segments[index];
  const tangent = {
    x: 3 * (1 - t) ** 2 * (segment.control1.x - start.x) + 6 * (1 - t) * t * (segment.control2.x - segment.control1.x) + 3 * t ** 2 * (segment.end.x - segment.control2.x),
    y: 3 * (1 - t) ** 2 * (segment.control1.y - start.y) + 6 * (1 - t) * t * (segment.control2.y - segment.control1.y) + 3 * t ** 2 * (segment.end.y - segment.control2.y),
  };
  return { point: sampleSegment(start, segment, t), rotation: Math.atan2(tangent.y, tangent.x) * 180 / Math.PI + 90 };
};

const pathMetrics = (path: Path, bounds?: CursorBounds) => {
  let previous = path.start;
  let previousAngle: number | undefined;
  let length = 0;
  let angleEnergy = 0;
  let maxTurn = 0;
  let totalTurn = 0;
  const inBounds = (point: CursorPoint) => !bounds || (point.x >= 20 && point.x <= bounds.width - 20 && point.y >= 20 && point.y <= bounds.height - 20);
  let staysInBounds = inBounds(previous);
  for (let index = 1; index <= path.segments.length * 24; index += 1) {
    const point = samplePath(path, index / (path.segments.length * 24)).point;
    const step = distance(previous, point);
    length += step;
    staysInBounds &&= inBounds(point);
    if (step > 0.01) {
      const angle = Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI;
      if (previousAngle !== undefined) {
        const turn = angleDelta(previousAngle, angle) * Math.PI / 180;
        angleEnergy += turn ** 2;
        maxTurn = Math.max(maxTurn, Math.abs(turn));
        totalTurn += Math.abs(turn);
      }
      previousAngle = angle;
    }
    previous = point;
  }
  return { length, angleEnergy, maxTurn, totalTurn, staysInBounds };
};

const backwardness = (path: Path): number => {
  const direction = unit({ x: path.end.x - path.start.x, y: path.end.y - path.start.y });
  return clamp((-(direction.x * clickTangent.x + direction.y * clickTangent.y) - 0.08) / 0.92, 0, 1);
};

const buildPath = (start: CursorPoint, end: CursorPoint, bounds: CursorBounds): Path => {
  const length = distance(start, end);
  const direction = unit({ x: end.x - start.x, y: end.y - start.y });
  const startDistance = Math.max(48, Math.min(640, length * 0.41960295031576633, length * 0.9));
  const endDistance = Math.max(48, Math.min(640, length * 0.15, length * 0.9));
  const reverse = { x: -clickTangent.x, y: -clickTangent.y };
  const startControl = handle(bounds, start, clickTangent, startDistance);
  const endControl = handle(bounds, end, reverse, endDistance);
  const candidates: Path[] = [
    { start, end, segments: [{ control1: startControl, control2: endControl, end }] },
    { start, end, segments: [{ control1: handle(bounds, start, clickTangent, startDistance * 0.65), control2: handle(bounds, end, reverse, endDistance * 0.65), end }] },
  ];
  const normal = { x: -direction.y, y: direction.x };
  const sign = normal.x * clickTangent.x + normal.y * clickTangent.y >= 0 ? 1 : -1;
  for (const arcScale of [0.55, 0.8, 1.05]) {
    for (const handleScale of [0.65, 1, 1.35]) {
      for (const side of [sign, -sign]) {
        const arcDistance = clamp(length * 0.2765523188064277, 50, 520) * arcScale;
        const handleDistance = clamp(length * 0.5783555327868779, 38, 440) * handleScale;
        const arc = { x: (start.x + end.x) / 2 + normal.x * side * arcDistance + clickTangent.x * startDistance * 0.16, y: (start.y + end.y) / 2 + normal.y * side * arcDistance + clickTangent.y * startDistance * 0.16 };
        candidates.push({ start, end, segments: [
          { control1: startControl, control2: { x: arc.x - direction.x * handleDistance, y: arc.y - direction.y * handleDistance }, end: arc },
          { control1: { x: arc.x + direction.x * handleDistance, y: arc.y + direction.y * handleDistance }, control2: endControl, end },
        ] });
      }
    }
  }
  const scored = candidates.map(path => {
    const metrics = pathMetrics(path, bounds);
    const excess = Math.max(0, metrics.length / Math.max(1, length) - 1);
    return { path, inBounds: metrics.staysInBounds, score: metrics.length + 320 * excess + 140 * metrics.angleEnergy + 180 * metrics.maxTurn + 18 * metrics.totalTurn + 90 * backwardness(path) + (path.segments.length > 1 ? 45 : 0) };
  });
  scored.sort((a, b) => Number(b.inBounds) - Number(a.inBounds) || a.score - b.score);
  return scored[0].path;
};

type Spring = { value: number; velocity: number; target: number; response: number; damping: number };
const spring = (value: number, response: number, damping: number): Spring => ({ value, target: value, velocity: 0, response, damping });
const settle = (state: Spring, value: number): void => { state.value = value; state.target = value; state.velocity = 0; };
const step = (state: Spring, seconds: number): void => {
  const stiffness = (2 * Math.PI / state.response) ** 2;
  const damping = 2 * Math.sqrt(stiffness) * state.damping;
  const count = Math.ceil(seconds * 240);
  const dt = seconds / count;
  for (let index = 0; index < count; index += 1) {
    const acceleration = (state.target - state.value) * stiffness - state.velocity * damping;
    state.velocity += acceleration * dt;
    state.value += state.velocity * dt;
  }
};

/** Retargetable page-coordinate motion; callers project the result into the panel. */
export class AgentCursorMotion {
  point: CursorPoint;
  rotation = -44;
  stretch = 1;
  scootRotation = 0;
  scootStretch = 1;
  axisRotation = 0;
  private readonly x: Spring;
  private readonly y: Spring;
  private readonly heading = spring(-44, 0.12, 0.9);
  private readonly progress = spring(0, 0.19, 0.94);
  private readonly width = spring(1, 0.2, 0.85);
  private path: Path | null = null;
  private origin: CursorPoint;
  private target: CursorPoint;
  private moving = false;

  constructor(point: CursorPoint) {
    this.point = point;
    this.origin = point;
    this.target = point;
    this.x = spring(point.x, 0.19, 0.9);
    this.y = spring(point.y, 0.19, 0.9);
  }

  move(to: CursorPoint, bounds: CursorBounds): void {
    this.origin = { ...this.point };
    this.target = to;
    this.path = distance(this.point, to) > 196 ? buildPath(this.point, to, bounds) : null;
    let response = 0.19;
    if (this.path) {
      const metrics = pathMetrics(this.path);
      const excess = Math.max(0, metrics.length / Math.max(1, distance(this.path.start, to)) - 1);
      const complexity = clamp(0.42 * clamp(excess / 0.55, 0, 1) + 0.38 * clamp(metrics.totalTurn / (1.4 * Math.PI), 0, 1) + 0.2 * clamp(metrics.angleEnergy / 1.25, 0, 1), 0, 1);
      response = clamp((0.42 + 0.22 * clamp((metrics.length - 180) / 760, 0, 1) + 0.12 * complexity + 0.28 * backwardness(this.path) + (this.path.segments.length > 1 ? 0.04 : 0)) * 0.7 * (this.path.segments.length > 1 ? 0.9 : 1), 0.12, 2.2);
    }
    settle(this.progress, 0);
    this.progress.target = 1;
    this.progress.response = response;
    this.progress.damping = this.path ? 0.9 : 0.94;
    this.x.response = this.y.response = this.path ? clamp(response * 0.18, 0.035, 0.12) : 0.19;
    this.x.damping = this.y.damping = 0.9;
    this.moving = true;
  }

  advance(seconds: number): boolean {
    if (!this.moving) return true;
    step(this.progress, seconds);
    const progress = clamp(this.progress.value, 0, 1);
    const sample = this.path ? samplePath(this.path, progress) : { point: this.target, rotation: -44 };
    this.x.target = sample.point.x;
    this.y.target = sample.point.y;
    this.heading.target = this.heading.value + angleDelta(this.heading.value, sample.rotation);
    step(this.x, seconds); step(this.y, seconds); step(this.heading, seconds);
    const next = { x: this.x.value, y: this.y.value };
    const speed = distance(this.point, next) / seconds;
    this.point = next;
    this.rotation = this.heading.value;
    this.width.target = this.path ? clamp(1 - speed / 5500, 0.65, 1) : 1;
    step(this.width, seconds);
    this.stretch = this.width.value;
    const delta = { x: this.target.x - this.origin.x, y: this.target.y - this.origin.y };
    const axis = unit(delta);
    const traveled = clamp(((next.x - this.origin.x) * delta.x + (next.y - this.origin.y) * delta.y) / Math.max(0.001, delta.x ** 2 + delta.y ** 2), 0, 1);
    const pulse = this.path ? 0 : Math.sin(traveled * Math.PI);
    this.axisRotation = Math.atan2(axis.y, axis.x) * 180 / Math.PI;
    this.scootRotation = 70 * clamp(0.75 * axis.x - 0.62 * axis.y, -1, 1) * pulse;
    this.scootStretch = 1 - 0.15 * pulse;
    if (progress >= 0.999 && Math.abs(this.progress.velocity) < 0.01 && distance(next, this.target) <= 0.85 && Math.abs(this.x.velocity) <= 12 && Math.abs(this.y.velocity) <= 12) {
      this.point = this.target;
      this.rotation = sample.rotation;
      this.stretch = this.scootStretch = 1;
      this.scootRotation = 0;
      settle(this.x, this.target.x); settle(this.y, this.target.y);
      this.moving = false;
    }
    return !this.moving;
  }
}
