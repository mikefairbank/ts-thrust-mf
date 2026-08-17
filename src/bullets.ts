import { ANGLE_X, ANGLE_Y } from "./physics";
import { Level } from "./levels";
import { WORLD_SCALE_X, WORLD_SCALE_Y, toScreenX, RasterPolygon } from "./rendering";
import { SpriteMask, LoadedSprite, TurretSprites, SwitchSprites } from "./shipSprites";
import { checkTerrainCollision, checkForLevelItemCollision } from "./collision";

export interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface TurretFiringState {
  bullets: Bullet[];
  shootProbability: number;
  tickCounter: number;
  turretsFiredThisTick: boolean;
}

const MAX_BULLETS = 31;
const ANGLE_MASK = 0x1F;
const BYTE_MASK = 0xFF;
const GUN_SPREAD_INDEX_MASK = 0x03;
const GUN_BASE_ANGLE_MASK = 0x1C;
const GUN_JITTER_MASK = 0x03;
const BULLET_LIFETIME = 40;
const BULLET_INDEX_MASK = 0x03;
const BULLET_INITIAL_ADVANCE = 2;

const SPREAD_TABLE = [0x01, 0x03, 0x07, 0x0F] as const;

// Bullet spawn offsets per turret type (in world coordinates)
const BULLET_OFFSETS: Record<string, { x: number; y: number }> = {
  up_right:   { x: 4, y: 0 },
  down_right: { x: 4, y: 8 },
  up_left:    { x: 1, y: 0 },
  down_left:  { x: 1, y: 8 },
};

function randomByte(): number {
  return Math.floor(Math.random() * 256);
}

export function createTurretFiringState(): TurretFiringState {
  return {
    bullets: [],
    shootProbability: 1,
    tickCounter: 0,
    turretsFiredThisTick: false,
  };
}

export function getHostileGunShootProbability(
  missionNumber: number,
  planetDestroyedPenalty: number,
): number {
  // BBC Thrust turret aggressiveness.
  //
  // Missions 1-2: probability 1.
  // Missions 3+: increases by 1 every mission.
  // Capped at 35.
  //
  // A failed planet destruction attempt (planet destroyed but pod not
  // evacuated) incurs a one-level penalty of +8.
  const base = Math.min(35, Math.max(1, missionNumber - 1));
  return base + planetDestroyedPenalty;
}

export function tickTurrets(
  state: TurretFiringState,
  level: Level,
  playerX: number,
  playerY: number,
  camX: number,
  camY: number,
  viewportW: number,
  viewportH: number,
  destroyedTurrets?: Set<number>,
  gunsSuppressed?: boolean,
): void {
  state.turretsFiredThisTick = false;
  // Process each turret
  for (let i = 0; i < level.turrets.length; i++) {
    if (destroyedTurrets?.has(i)) continue;
    const turret = level.turrets[i];
    // Gate: generator ceasefire
    if (gunsSuppressed) continue;

    // Gate: visibility — convert turret world pos to screen
    const screenX = turret.x * WORLD_SCALE_X - camX;
    const screenY = turret.y * WORLD_SCALE_Y - camY;
    if (screenX < 0 || screenX >= viewportW || screenY < 0 || screenY >= viewportH) continue;

    // Gate: probability
    if (randomByte() >= state.shootProbability) continue;

    // Max bullets check
    if (state.bullets.length >= MAX_BULLETS) continue;

    // Decode gun param and calculate firing angle
    const param = turret.gunParam;
    const spreadIndex = param & GUN_SPREAD_INDEX_MASK;
    const baseAngleOffset = param & GUN_BASE_ANGLE_MASK;
    const spreadMask = SPREAD_TABLE[spreadIndex];

    const rndA = randomByte();
    const rndB = randomByte();
    const jitter = rndA & GUN_JITTER_MASK;
    const spread = rndB & spreadMask;
    const angle = (spread + baseAngleOffset + jitter) & ANGLE_MASK;

    // Get bullet velocity from angle tables
    const dx = ANGLE_X[angle];
    const dy = ANGLE_Y[angle];

    // Get spawn offset
    const offset = BULLET_OFFSETS[turret.direction];

    // Spawn bullet in world coordinates
    state.bullets.push({
      x: turret.x + offset.x,
      y: turret.y + offset.y,
      dx,
      dy,
    });
    state.turretsFiredThisTick = true;
  }

  // Update all bullets: move, remove when off-screen
  state.bullets = state.bullets.filter(bullet => {
    bullet.x += bullet.dx;
    bullet.y += bullet.dy;
    const sx = bullet.x * WORLD_SCALE_X - camX;
    const sy = bullet.y * WORLD_SCALE_Y - camY;
    return sx > -2 && sx < viewportW && sy > -2 && sy < viewportH;
  });

  state.tickCounter = (state.tickCounter + 1) & BYTE_MASK;
}

export function renderBullets(
  ctx: CanvasRenderingContext2D,
  bullets: Bullet[],
  camX: number,
  camY: number,
  colour: string,
): void {
  ctx.fillStyle = colour;
  for (const bullet of bullets) {
    const sx = Math.round(bullet.x * WORLD_SCALE_X - camX);
    const sy = Math.round(bullet.y * WORLD_SCALE_Y - camY);
    ctx.fillRect(sx, sy, 2, 2);
  }
}

export function removeCollidingBullets(
  state: TurretFiringState,
  level: Level,
  doorPolygon: RasterPolygon | null,
): void {
    state.bullets = state.bullets.filter(bullet => {
      return !checkTerrainCollision(level, doorPolygon, bullet.x, bullet.y, 2, 2);
    });
}

// ---------------------------------------------------------------------------
// Player shooting
// ---------------------------------------------------------------------------

export interface PlayerBullet {
  x: number; y: number;
  dx: number; dy: number;
  active: boolean;
  lifetime: number;
}

export interface PlayerShootingState {
  bullets: PlayerBullet[];   // exactly 4 slots (round-robin)
  bulletIndex: number;       // 0-3, advances after each shot
  pressedFire: boolean;      // single-shot latch
  firedThisTick: boolean;
}

export function createPlayerShootingState(): PlayerShootingState {
  return {
    bullets: [
      { x: 0, y: 0, dx: 0, dy: 0, active: false, lifetime: 0 },
      { x: 0, y: 0, dx: 0, dy: 0, active: false, lifetime: 0 },
      { x: 0, y: 0, dx: 0, dy: 0, active: false, lifetime: 0 },
      { x: 0, y: 0, dx: 0, dy: 0, active: false, lifetime: 0 },
    ],
    bulletIndex: 0,
    pressedFire: false,
    firedThisTick: false,
  };
}

export function tickPlayerShooting(
  state: PlayerShootingState,
  fireKeyDown: boolean,
  shieldActive: boolean,
  shipAngle: number,
  shipX: number,
  shipY: number,
  shipVX: number,
  shipVY: number,
): void {
  // Gate 1: pod destroying player — skip for now (not implemented)

  state.firedThisTick = false;

  // Gate 2: shield/fire mutual exclusion
  if (shieldActive) {
    state.pressedFire = true;
    return;
  }

  // Gate 3: single-shot latch
  if (!fireKeyDown) {
    state.pressedFire = false;
    return;
  }
  if (state.pressedFire) return;

  // Slot availability check
  const slot = state.bullets[state.bulletIndex];
  if (slot.active) return; // slot occupied — cannot fire

  // Create bullet
  state.pressedFire = true;

  // Spawn at ship centre (world position is already centre of mass)
  slot.x = shipX;
  slot.y = shipY;

  // Velocity from ship angle
  const angleIdx = Math.round(shipAngle) & ANGLE_MASK;
  slot.dx = ANGLE_X[angleIdx];
  slot.dy = ANGLE_Y[angleIdx];

  // Inherit ship velocity
  slot.dx += shipVX;
  slot.dy += shipVY;

  // Advance 2 steps to clear ship sprite (after full velocity is set)
  slot.x += slot.dx * BULLET_INITIAL_ADVANCE;
  slot.y += slot.dy * BULLET_INITIAL_ADVANCE;

  slot.active = true;
  slot.lifetime = BULLET_LIFETIME;
  state.firedThisTick = true;

  // Advance round-robin index
  state.bulletIndex = (state.bulletIndex + 1) & BULLET_INDEX_MASK;
}

export function tickPlayerBullets(
  state: PlayerShootingState,
): void {
  for (const bullet of state.bullets) {
    if (!bullet.active) continue;
    bullet.x += bullet.dx;
    bullet.y += bullet.dy;
    bullet.lifetime--;
    if (bullet.lifetime <= 0) {
      bullet.active = false;
    }
  }
}

export function renderPlayerBullets(
  ctx: CanvasRenderingContext2D,
  state: PlayerShootingState,
  camX: number,
  camY: number,
  colour: string,
): void {
  ctx.fillStyle = colour;
  for (const bullet of state.bullets) {
    if (!bullet.active) continue;
    const sx = Math.round(bullet.x * WORLD_SCALE_X - camX);
    const sy = Math.round(bullet.y * WORLD_SCALE_Y - camY);
    ctx.fillRect(sx, sy, 2, 2);
  }
}

// ---------------------------------------------------------------------------
// Player bullet collision via collision buffer (pixel-accurate)
// ---------------------------------------------------------------------------

export interface BulletHitResult {
  hitTurrets: number[];
  hitFuel: number[];
  hitGenerator: boolean;
  hitPod: boolean;
  generatorHitX: number;
  generatorHitY: number;
  hitSwitch: boolean;
  switchHitX: number;
  switchHitY: number;
}

export function processPlayerBulletCollisions(
  state: PlayerShootingState,
  level: Level,
  doorPolygon: RasterPolygon | null,
  destroyedTurrets: Set<number>,
  destroyedFuel: Set<number>,
  generatorDestroyed: boolean,
  podDetachedFromStand: boolean,
  podX: number,
  podY: number,
  fuelSprite: LoadedSprite,
  turretSprites: TurretSprites,
  powerPlantSprite: LoadedSprite,
  podStandSprite: LoadedSprite,
  podSprite: LoadedSprite,
  switchSprites: SwitchSprites,
): BulletHitResult {

  const result: BulletHitResult = {
    hitTurrets: [],
    hitFuel: [],
    hitGenerator: false,
    generatorHitX: 0,
    generatorHitY: 0,
    hitSwitch: false,
    switchHitX: 0,
    switchHitY: 0,
    hitPod: false,
  };

  for (const bullet of state.bullets) {

    if (!bullet.active) continue;

    //
    // Terrain first
    //
    let hitTerrain = checkTerrainCollision(level, doorPolygon, bullet.x, bullet.y, 2,2);

    if (hitTerrain) {
      bullet.active = false;
      continue;
    }

    //
    // Objects
    //
    const hit = checkForLevelItemCollision(
      level,
      bullet.x,
      bullet.y,
      2,      // bullet width
      2,      // bullet height
      fuelSprite,
      turretSprites,
      powerPlantSprite,
      podStandSprite,
      podSprite,
      switchSprites,
      destroyedTurrets,
      destroyedFuel,
      generatorDestroyed,
      podDetachedFromStand,
      podX,
      podY,
    );

    if (!hit) continue;

    bullet.active = false;

    switch (hit.type) {

      case "turret":
        result.hitTurrets.push(hit.index);
        break;

      case "fuel":
        result.hitFuel.push(hit.index);
        break;

      case "generator":
        result.hitGenerator = true;
        result.generatorHitX = bullet.x;
        result.generatorHitY = bullet.y;
        break;

      case "switch":
        result.hitSwitch = true;
        result.switchHitX = bullet.x;
        result.switchHitY = bullet.y;
        break;

      case "pod":
        result.hitPod = true;
        break;
    }
  }

  return result;
}


export function removeBulletsHittingShip(
  bullets: Bullet[],
  shipMask: SpriteMask,
  shipWorldX: number,
  shipWorldY: number,
): boolean {

  let hit = false;

  for (let i = bullets.length - 1; i >= 0; i--) {

    const bullet = bullets[i];
    let collided = false;

    const bulletLeft = bullet.x;
    const bulletRight = bullet.x + 1;
    const bulletTop = bullet.y;
    const bulletBottom = bullet.y + 1;

    for (const pixel of shipMask) {

      const pixelX = shipWorldX + pixel.dx;
      const pixelY = shipWorldY + pixel.dy;

      if (
        pixelX >= bulletLeft &&
        pixelX <= bulletRight &&
        pixelY >= bulletTop &&
        pixelY <= bulletBottom
      ) {
        collided = true;
        break;
      }
    }

    if (collided) {
      bullets.splice(i, 1);
      hit = true;
    }
  }

  return hit;
}
