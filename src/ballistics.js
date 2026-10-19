// Arrow guidance helpers. Plain math so they can be unit-tested without Phaser.

// Homing step for a guaranteed hit: turns velocity toward the target by at most maxTurn rad/s.
export function steer(vx, vy, fromX, fromY, toX, toY, speed, maxTurn, dt) {
  const desired = Math.atan2(toY - fromY, toX - fromX);
  if (vx === 0 && vy === 0) return { vx: Math.cos(desired) * speed, vy: Math.sin(desired) * speed };
  const heading = Math.atan2(vy, vx);
  // Wrap the difference into (-PI, PI] so we always turn the short way round.
  let diff = desired - heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const limit = Math.max(0, maxTurn * dt);
  const angle = heading + Math.max(-limit, Math.min(limit, diff));
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

// Point for a deliberate miss: target offset perpendicular to the line of fire by `offset` px.
export function missPoint(fromX, fromY, toX, toY, offset) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: toX + offset, y: toY };
  return { x: toX - (dy / len) * offset, y: toY + (dx / len) * offset };
}
