import { Level, SwitchPosition } from "./levels";
import { Point, bbcMicroColours, WORLD_SCALE_X, WORLD_SCALE_Y, WORLD_WIDTH, 
  RasterPolygon, RasterRow, GENERATOR_Y_OFFSET, FUEL_Y_OFFSET, POD_Y_OFFSET, TURRET_Y_OFFSET, SWITCH_Y_OFFSET} from "./rendering";
import { TurretSprites, SwitchSprites, LoadedSprite, RasterMask } from "./shipSprites";


export enum CollisionResult {
  None       = 0,
  Terrain    = 1,
  Fuel       = 2,
  Turret     = 3,
  PowerPlant = 4,
  Pod        = 5,
  Switch     = 6,
}


export function checkPolygonCollision(
  poly: RasterPolygon,
  pixelX: number, 
  pixelY: number,
  dx: number,
  dy: number,
): boolean {

  const x1 = pixelX;
  const x2 = pixelX + dx;

  const y1 = pixelY;
  const y2 = pixelY + dy;

  if (y2 < poly.topY || y1 > poly.bottomY) {
    return false;
  }
  if (x2 < poly.leftX || x1 > poly.rightX) {
    return false;
  }
  const startRow = Math.max(Math.floor(y1 - poly.topY), 0);
  const endRow = Math.min(Math.floor(y2 - poly.topY), poly.rows.length - 1);
  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
    const row = poly.rows[rowIndex];
    if (row.rightX < row.leftX) {
      continue;
    }
    if (x2 >= row.leftX && x1 <= row.rightX) {
      return true;
    }
  }

  return false;
}


export function checkRasterPolygonOverlap(
  poly1: RasterPolygon,
  poly2: RasterPolygon,
  dx: number, // relative displacement of poly2 from poly1 (in pixels; must be integer)
  dy: number, // relative displacement of poly2 from poly1 (in pixels; must be integer)
): boolean {
  if (!Number.isInteger(dx) || !Number.isInteger(dy) || !Number.isInteger(poly1.topY) || !Number.isInteger(poly1.bottomY) || !Number.isInteger(poly1.leftX) || !Number.isInteger(poly1.rightX) || !Number.isInteger(poly2.topY) || !Number.isInteger(poly2.bottomY) || !Number.isInteger(poly2.leftX) || !Number.isInteger(poly2.rightX)) throw new Error(`Non-integer raster polygon overlap argument dx=${dx} dy=${dy}`);
  if (!poly1.rows.every(r => Number.isInteger(r.leftX) && Number.isInteger(r.rightX))) throw new Error("Raster polygon 1 contains non-integer row coordinates");
  if (!poly2.rows.every(r => Number.isInteger(r.leftX) && Number.isInteger(r.rightX))) throw new Error("Raster polygon 2 contains non-integer row coordinates");
  for (const [name,value] of Object.entries({dx,dy})) {
    if (!Number.isInteger(value)) throw new Error(`${name}=${value} is not an integer`);
  }
  //if (poly1.rows.length !== poly1.bottomY - poly1.topY + 1) throw new Error("poly1 row count mismatch");
  //if (poly2.rows.length !== poly2.bottomY - poly2.topY + 1) throw new Error("poly2 row count mismatch");
  const poly2Left   = poly2.leftX   + dx; 
  const poly2Right  = poly2.rightX  + dx;
  const poly2Top    = poly2.topY    + dy;
  const poly2Bottom = poly2.bottomY + dy;
  // Bounding box reject
  if (poly2Bottom < poly1.topY - 1 || poly2Top > poly1.bottomY + 1) {
    return false;
  }
  if (poly2Right < poly1.leftX || poly2Left > poly1.rightX) {
    return false;
  }
  const startY = Math.max(poly1.topY, poly2Top);     // picks out lowest top Y
  const endY = Math.min(poly1.bottomY, poly2Bottom); // picks out highest bottom Y
  if (!Number.isInteger(startY) || !Number.isInteger(endY)) throw new Error(`Unexpected non-integer value.`);
  for (let y = startY; y <= endY; y++) {
    const row1Index = y - poly1.topY; 
    if (row1Index<0) throw new Error(`Unexpected negative row1 index.`);
    if (row1Index>=poly1.rows.length) throw new Error(`Unexpected oob row1 index.`);
    const row1 = poly1.rows[row1Index];
    const row2Index = y - dy; 
    if (!Number.isInteger(row2Index)) throw new Error(`Unexpected non-integer value.`);
    if (row2Index < 0 || row2Index >= poly2.rows.length) {
      continue;
    }
    const row2 = poly2.rows[row2Index];
    if (row1.rightX < row1.leftX || row2.rightX < row2.leftX) { // simply checks both sprites have some pixels on this row.
      continue;
    }
    const row2Left = row2.leftX + dx;
    const row2Right = row2.rightX + dx;
    if (row2Right >= row1.leftX && row2Left <= row1.rightX) {
      return true;
    }
  }
  return false;
}
export type LevelItemCollision =
  | { type: "generator"; x: number; y: number }
  | { type: "fuel"; index: number; x: number; y: number }
  | { type: "turret"; index: number; x: number; y: number }
  | { type: "switch"; index: number; x: number; y: number }
  | { type: "pod"; x: number; y: number }
  | null;
  

export function checkForBulletLevelItemCollision(
  level: Level,
  bulletPixelX: number,
  bulletPixelY: number,
  fuelSprite: LoadedSprite,
  turretSprites: TurretSprites,
  powerPlantSprite: LoadedSprite,
  podStandSprite: LoadedSprite,
  podSprite: LoadedSprite,
  switchSprites: SwitchSprites,
  destroyedTurrets?: Set<number>,
  destroyedFuel?: Set<number>,
  generatorDestroyed?: boolean,
  podDetachedFromStand?: boolean,
  podX?: number,
  podY?: number,
): LevelItemCollision {

  return checkForLevelItemCollision(level, BULLET_SPRITE, bulletPixelX, bulletPixelY, fuelSprite, turretSprites, powerPlantSprite,
    podStandSprite, podSprite, switchSprites, destroyedTurrets, destroyedFuel, generatorDestroyed, podDetachedFromStand, 
    podX, podY);
}

export function checkBulletHittingSprite(
  bulletPixelX: number,
  bulletPixelY: number,
  sprite: LoadedSprite,
  spritePixelX: number,
  spritePixelY: number,
): boolean {

  const bulletLeft = bulletPixelX;
  const bulletTop = bulletPixelY;

  const spriteLeft = spritePixelX;
  const spriteTop = spritePixelY;

  return checkRasterPolygonOverlap(
    BULLET_SPRITE.maskLeftRightPixelValues,
    sprite.maskLeftRightPixelValues,
    spriteLeft - bulletLeft,
    spriteTop - bulletTop,
  );
}

export function checkForLevelItemCollision(
  level: Level,
  movingSprite: LoadedSprite,
  spritePixelX: number,
  spritePixelY: number,
  fuelSprite: LoadedSprite,
  turretSprites: TurretSprites,
  powerPlantSprite: LoadedSprite,
  podStandSprite: LoadedSprite,
  podSprite: LoadedSprite,
  switchSprites: SwitchSprites,
  destroyedTurrets?: Set<number>,
  destroyedFuel?: Set<number>,
  generatorDestroyed?: boolean,
  podDetachedFromStand?: boolean,
  podX?: number,
  podY?: number,
): LevelItemCollision {

  const worldWidth = WORLD_WIDTH ;
  spritePixelX = ((spritePixelX % worldWidth) + worldWidth) % worldWidth;

  const masksOverlap = (
    ax: number,
    ay: number,
    a: LoadedSprite,
    bx: number,
    by: number,
    b: LoadedSprite,
  ): boolean => {

    const aLeft = Math.floor(ax);
    const aTop = Math.floor(ay);

    const bLeft = Math.floor(bx);
    const bTop = Math.floor(by);

    return checkRasterPolygonOverlap(
      a.maskLeftRightPixelValues,
      b.maskLeftRightPixelValues,
      bLeft - aLeft,
      bTop - aTop,
    );
  };

  if (!generatorDestroyed && masksOverlap(spritePixelX, spritePixelY, movingSprite, level.powerPlant.x*WORLD_SCALE_X, level.powerPlant.y*WORLD_SCALE_Y+GENERATOR_Y_OFFSET, powerPlantSprite)) {
    return {type: "generator", x: level.powerPlant.x, y: level.powerPlant.y};
  }

  if (!podDetachedFromStand) {
    if (masksOverlap(spritePixelX, spritePixelY, movingSprite, level.podPedestal.x*WORLD_SCALE_X, level.podPedestal.y*WORLD_SCALE_Y+POD_Y_OFFSET, podStandSprite)) {
      return {type: "pod", x: level.podPedestal.x, y: level.podPedestal.y};
    }
  } else if (podX !== undefined && podY !== undefined && movingSprite!==podSprite) {
    if (masksOverlap(spritePixelX, spritePixelY, movingSprite, podX*WORLD_SCALE_X-podSprite.centerX, podY*WORLD_SCALE_Y-podSprite.centerY, podSprite)) {
      return {type: "pod", x: podX, y: podY};
    }
  }

  for (let i = 0; i < level.fuel.length; i++) {
    if (destroyedFuel?.has(i)) continue;
    const f = level.fuel[i];
    if (masksOverlap(spritePixelX, spritePixelY, movingSprite, f.x*WORLD_SCALE_X, f.y*WORLD_SCALE_Y+FUEL_Y_OFFSET, fuelSprite)) {
      return {type: "fuel", index: i, x: f.x, y: f.y};
    }
  }

  for (let i = 0; i < level.turrets.length; i++) {
    if (destroyedTurrets?.has(i)) continue;
    const t = level.turrets[i];
    const turretSprite =
      t.direction === "up_left" ? turretSprites.upLeft :
      t.direction === "up_right" ? turretSprites.upRight :
      t.direction === "down_left" ? turretSprites.downLeft :
      turretSprites.downRight;
    if (masksOverlap(spritePixelX, spritePixelY, movingSprite, t.x*WORLD_SCALE_X, t.y*WORLD_SCALE_Y+TURRET_Y_OFFSET, turretSprite)) {
      return {type: "turret", index: i, x: t.x, y: t.y};
    }
  }

  for (let i = 0; i < level.switches.length; i++) {
    const sw = level.switches[i];
    const switchSprite = sw.direction === "right" ? switchSprites.right : switchSprites.left;
    if (masksOverlap(spritePixelX, spritePixelY, movingSprite, sw.x*WORLD_SCALE_X, sw.y*WORLD_SCALE_Y+SWITCH_Y_OFFSET, switchSprite)) {
      return {type: "switch", index: i, x: sw.x, y: sw.y};
    }
  }

  return null;
}


const BULLET_MASK: RasterMask = {
  topY: 0,
  bottomY: 1,
  leftX: 0,
  rightX: 1,
  rows: [
    { leftX: 0, rightX: 1 },
    { leftX: 0, rightX: 1 },
  ],
};

const BULLET_SPRITE: LoadedSprite = {
  bitmap: undefined as unknown as ImageBitmap, // replace if needed

  width: 2,
  height: 2,

  centerX: 1,
  centerY: 1,

  worldCenterX: 0.5,
  worldCenterY: 0.5,

  maskLeftRightPixelValues: BULLET_MASK
};

export function checkBulletWithTerrainCollision(
  level: Level, doorPolygon: RasterPolygon | null, bulletPixelX: number, bulletPixelY: number): boolean {
  return checkSpriteCollisionWithTerrain(level, doorPolygon, BULLET_SPRITE.maskLeftRightPixelValues, bulletPixelX, bulletPixelY);
}

export function checkSpriteCollisionWithTerrain(
  level: Level,
  doorPolygon: RasterPolygon | null,
  spritePolygon: RasterPolygon,
  spritePixelX: number, // top left not centre
  spritePixelY: number, // top left not centre
): boolean {
  const worldWidth = WORLD_WIDTH;
  const baseOffset = Math.round(spritePixelX / worldWidth) * worldWidth;
  if (!Number.isInteger(spritePixelX) || !Number.isInteger(spritePixelY)) throw new Error(`Non-integer sprite coords`);
  const xCandidates = [
    Math.floor(spritePixelX - baseOffset - worldWidth),
    Math.floor(spritePixelX - baseOffset),
    Math.floor(spritePixelX - baseOffset + worldWidth),
  ];
  for (const x of xCandidates) {
    if (checkRasterPolygonOverlap(level.landscapeLeftRasterisedPolygonPixels!,spritePolygon, x, spritePixelY)) {
      return true;
    }
    if (checkRasterPolygonOverlap(level.landscapeRightRasterisedPolygonPixels!,spritePolygon, x, spritePixelY)) {
      return true;
    }

    if (doorPolygon &&checkRasterPolygonOverlap(doorPolygon,spritePolygon, x, spritePixelY)) {
      return true;
    }
  }
  return false;
}



export function testCollision(
  level: Level,
  doorPolygon: RasterPolygon | null,
  sprite: LoadedSprite,
  shipWorldX: number,
  shipWorldY: number,
  fuelSprite: LoadedSprite,
  turretSprites: TurretSprites,
  powerPlantSprite: LoadedSprite,
  podStandSprite: LoadedSprite,
  podSprite: LoadedSprite,
  switchSprites: SwitchSprites,
  destroyedTurrets: Set<number>,
  destroyedFuel: Set<number>,
  generatorDestroyed: boolean,
  podDetachedFromStand: boolean,
  podX: number,
  podY: number,
): CollisionResult {

  if (checkSpriteCollisionWithTerrain(level,doorPolygon,sprite.maskLeftRightPixelValues, Math.floor(shipWorldX*WORLD_SCALE_X), Math.floor(shipWorldY*WORLD_SCALE_Y))) {
    return CollisionResult.Terrain;
  }

  const hit = checkForLevelItemCollision(
    level,
    sprite,
    Math.floor(shipWorldX*WORLD_SCALE_X),
    Math.floor(shipWorldY*WORLD_SCALE_Y),
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
  if (!hit) {
    return CollisionResult.None;
  }
  switch (hit.type) {
    case "turret":
      return CollisionResult.Turret;
    case "generator":
      return CollisionResult.PowerPlant;
    case "pod":
      return CollisionResult.Pod;
    case "fuel":
      return CollisionResult.Fuel;
    case "switch":
      return CollisionResult.Switch;
  }
  return CollisionResult.None;
}

