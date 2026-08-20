import { Level, SwitchPosition } from "./levels";
import { fillRasteredPolygon, Point, bbcMicroColours, WORLD_SCALE_X, WORLD_SCALE_Y, WORLD_WIDTH, RasterPolygon, RasterRow, GENERATOR_Y_OFFSET, FUEL_Y_OFFSET, POD_Y_OFFSET, TURRET_Y_OFFSET, SWITCH_Y_OFFSET} from "./rendering";
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
  dx: number,
  dy: number,
): boolean {
  if (!Number.isInteger(dx) || !Number.isInteger(dy) || !Number.isInteger(poly1.topY) || !Number.isInteger(poly1.bottomY) || !Number.isInteger(poly1.leftX) || !Number.isInteger(poly1.rightX) || !Number.isInteger(poly2.topY) || !Number.isInteger(poly2.bottomY) || !Number.isInteger(poly2.leftX) || !Number.isInteger(poly2.rightX)) throw new Error(`Non-integer raster polygon overlap argument dx=${dx} dy=${dy}`);
  if (!poly1.rows.every(r => Number.isInteger(r.leftX) && Number.isInteger(r.rightX))) throw new Error("Raster polygon 1 contains non-integer row coordinates");
  if (!poly2.rows.every(r => Number.isInteger(r.leftX) && Number.isInteger(r.rightX))) throw new Error("Raster polygon 2 contains non-integer row coordinates");
  for (const [name,value] of Object.entries({dx,dy})) {
    if (!Number.isInteger(value)) throw new Error(`${name}=${value} is not an integer`);
  }
  //if (poly1.rows.length !== poly1.bottomY - poly1.topY + 1) throw new Error("poly1 row count mismatch");
  //if (poly2.rows.length !== poly2.bottomY - poly2.topY + 1) throw new Error("poly2 row count mismatch");
  const poly2Left   = poly2.leftX   + dx; //Uncaught TypeError: can't access property "leftX", poly2 is undefined
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
  const startY = Math.max(poly1.topY,Math.floor(poly2Top));
  const endY = Math.min(poly1.bottomY,Math.floor(poly2Bottom));
  for (let y = startY; y <= endY; y++) {
    const row1 = poly1.rows[y - poly1.topY];
    const row2Index = Math.floor(y - poly2Top + poly2.topY);
    if (row2Index < 0 || row2Index >= poly2.rows.length) {
      continue;
    }
    const row2 = poly2.rows[row2Index];
    if (row1.rightX < row1.leftX || row2.rightX < row2.leftX) {
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
  worldX: number,
  worldY: number,
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

  return checkForLevelItemCollision(level, BULLET_SPRITE, worldX, worldY, fuelSprite, turretSprites, powerPlantSprite,
    podStandSprite, podSprite, switchSprites, destroyedTurrets, destroyedFuel, generatorDestroyed, podDetachedFromStand, 
    podX, podY);
}

export function checkBulletHittingSprite(
  bulletWorldX: number,
  bulletWorldY: number,
  sprite: LoadedSprite,
  spriteWorldX: number,
  spriteWorldY: number,
): boolean {

  const bulletLeft = Math.floor(bulletWorldX * WORLD_SCALE_X);
  const bulletTop = Math.floor(bulletWorldY * WORLD_SCALE_Y);

  const spriteLeft = Math.floor(spriteWorldX * WORLD_SCALE_X);
  const spriteTop = Math.floor(spriteWorldY * WORLD_SCALE_Y);

  return checkRasterPolygonOverlap(
    BULLET_SPRITE.maskLeftRightPixelValues,
    sprite.maskLeftRightPixelValues,
    spriteLeft - bulletLeft,
    spriteTop - bulletTop,
  );
}

export function checkForBulletLevelItemCollisionOLD( // newer version.  Items are "sprites" now.  E.g. fuel has rounded edges.
  level: Level,
  worldX: number,
  worldY: number,
  dx: number,
  dy: number,
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

  const worldWidth = WORLD_WIDTH / WORLD_SCALE_X;
  worldX = ((worldX % worldWidth) + worldWidth) % worldWidth;

  const spriteHit = (
    sprite: LoadedSprite,
    spriteX: number,
    spriteY: number,
  ): boolean => {

    const result= checkPolygonCollision(
      sprite.maskLeftRightPixelValues,
      Math.round((worldX-spriteX)*WORLD_SCALE_X),
      Math.round((worldY - spriteY)*WORLD_SCALE_Y),
      Math.round(dx*WORLD_SCALE_X),
      Math.round(dy*WORLD_SCALE_Y),
    );
    return result;
  };

  // Generator
  if (!generatorDestroyed) {
    if (
      spriteHit(
        powerPlantSprite,
        level.powerPlant.x,
        level.powerPlant.y,
      )
    ) {
      return {
        type: "generator",
        x: level.powerPlant.x,
        y: level.powerPlant.y,
      };
    }
  }

  // Pod stand / pod
  if (!podDetachedFromStand) {

    if (
      spriteHit(
        podStandSprite,
        level.podPedestal.x,
        level.podPedestal.y,
      )
    ) {
      return {
        type: "pod",
        x: level.podPedestal.x,
        y: level.podPedestal.y,
      };
    }

  } else if (podX !== undefined && podY !== undefined) {

    if (
      spriteHit(
        podSprite,
        podX,
        podY,
      )
    ) {
      return {
        type: "pod",
        x: podX,
        y: podY,
      };
    }
  }

  // Fuel
  for (let i = 0; i < level.fuel.length; i++) {

    if (destroyedFuel?.has(i)) {
      continue;
    }

    const f = level.fuel[i];

    if (
      spriteHit(
        fuelSprite,
        f.x,
        f.y,
      )
    ) {
      return {
        type: "fuel",
        index: i,
        x: f.x,
        y: f.y
      };
    }
  }

  // Turrets
  for (let i = 0; i < level.turrets.length; i++) {

    if (destroyedTurrets?.has(i)) {
      continue;
    }

    const t = level.turrets[i];

    const turretSprite =
      t.direction === "up_left" ? turretSprites.upLeft :
      t.direction === "up_right" ? turretSprites.upRight :
      t.direction === "down_left" ? turretSprites.downLeft :
      turretSprites.downRight;

    if (
      spriteHit(
        turretSprite,
        t.x,
        t.y,
      )
    ) {
      return {
        type: "turret",
        index: i,
        x: t.x,
        y: t.y,
      };
    }
  }

  // Switches
  for (let i = 0; i < level.switches.length; i++) {

    const sw = level.switches[i];

    const switchSprite =
      sw.direction === "right"
        ? switchSprites.right
        : switchSprites.left;

    if (
      spriteHit(
        switchSprite,
        sw.x,
        sw.y,
      )
    ) {
      return {
        type: "switch",
        index: i,
        x: sw.x,
        y: sw.y,
      };
    }
  }

  return null;
}



export function checkForLevelItemCollision(
  level: Level,
  movingSprite: LoadedSprite,
  worldX: number,
  worldY: number,
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

  const worldWidth = WORLD_WIDTH / WORLD_SCALE_X;
  worldX = ((worldX % worldWidth) + worldWidth) % worldWidth;

  const masksOverlap = (
    ax: number,
    ay: number,
    a: LoadedSprite,
    bx: number,
    by: number,
    b: LoadedSprite,
  ): boolean => {

    const aLeft = Math.floor(ax * WORLD_SCALE_X);
    const aTop = Math.floor(ay * WORLD_SCALE_Y);

    const bLeft = Math.floor(bx * WORLD_SCALE_X);
    const bTop = Math.floor(by * WORLD_SCALE_Y);

    return checkRasterPolygonOverlap(
      a.maskLeftRightPixelValues,
      b.maskLeftRightPixelValues,
      bLeft - aLeft,
      bTop - aTop,
    );
  };

  if (!generatorDestroyed && masksOverlap(worldX, worldY, movingSprite, level.powerPlant.x, level.powerPlant.y+GENERATOR_Y_OFFSET/WORLD_SCALE_Y, powerPlantSprite)) {
    return {type: "generator", x: level.powerPlant.x, y: level.powerPlant.y};
  }

  if (!podDetachedFromStand) {
    if (masksOverlap(worldX, worldY, movingSprite, level.podPedestal.x, level.podPedestal.y+POD_Y_OFFSET/WORLD_SCALE_Y, podStandSprite)) {
      return {type: "pod", x: level.podPedestal.x, y: level.podPedestal.y};
    }
  } else if (podX !== undefined && podY !== undefined) {
    if (masksOverlap(worldX, worldY, movingSprite, podX, podY, podSprite)) {
      return {type: "pod", x: podX, y: podY};
    }
  }

  for (let i = 0; i < level.fuel.length; i++) {
    if (destroyedFuel?.has(i)) continue;
    const f = level.fuel[i];
    if (masksOverlap(worldX, worldY, movingSprite, f.x, f.y+FUEL_Y_OFFSET/WORLD_SCALE_Y, fuelSprite)) {
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
    if (masksOverlap(worldX, worldY, movingSprite, t.x, t.y+TURRET_Y_OFFSET/WORLD_SCALE_Y, turretSprite)) {
      return {type: "turret", index: i, x: t.x, y: t.y};
    }
  }

  for (let i = 0; i < level.switches.length; i++) {
    const sw = level.switches[i];
    const switchSprite = sw.direction === "right" ? switchSprites.right : switchSprites.left;
    if (masksOverlap(worldX, worldY, movingSprite, sw.x, sw.y+SWITCH_Y_OFFSET/WORLD_SCALE_Y, switchSprite)) {
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

  worldCenterX: 1 / WORLD_SCALE_X,
  worldCenterY: 1 / WORLD_SCALE_Y,

  maskLeftRightPixelValues: BULLET_MASK
};

export function checkBulletWithTerrainCollision(
  level: Level, doorPolygon: RasterPolygon | null, worldX: number, worldY: number): boolean {
  return checkSpriteCollisionWithTerrain(level, doorPolygon, BULLET_SPRITE.maskLeftRightPixelValues, worldX, worldY);
}

export function checkSpriteCollisionWithTerrain(
  level: Level,
  doorPolygon: RasterPolygon | null,
  spritePolygon: RasterPolygon,
  spriteWorldX: number, // top left not centre
  spriteWorldY: number, // top left not centre
): boolean {
  const worldWidth = WORLD_WIDTH / WORLD_SCALE_X;
  const baseOffset = Math.round(spriteWorldX / worldWidth) * worldWidth;
  const xCandidates = [
    spriteWorldX - baseOffset - worldWidth,
    spriteWorldX - baseOffset,
    spriteWorldX - baseOffset + worldWidth,
  ];
  for (const x of xCandidates) {
    if (checkRasterPolygonOverlap(level.landscapeLeftRasterisedPolygonPixels!,spritePolygon,Math.floor(x*WORLD_SCALE_X),Math.floor(spriteWorldY*WORLD_SCALE_Y))) {
      return true;
    }
    if (checkRasterPolygonOverlap(level.landscapeRightRasterisedPolygonPixels!,spritePolygon,Math.floor(x*WORLD_SCALE_X),Math.floor(spriteWorldY*WORLD_SCALE_Y))) {
      return true;
    }

    if (doorPolygon &&checkRasterPolygonOverlap(rasterPolygonWorldToPixels(doorPolygon),spritePolygon,Math.floor(x*WORLD_SCALE_X),Math.floor(spriteWorldY*WORLD_SCALE_Y))) {
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

  if (checkSpriteCollisionWithTerrain(level,doorPolygon,sprite.maskLeftRightPixelValues, shipWorldX, shipWorldY)) {
    return CollisionResult.Terrain;
  }

  const hit = checkForLevelItemCollision(
    level,
    sprite,
    shipWorldX,
    shipWorldY,
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

export function rasterPolygonWorldToPixels(
  poly: RasterPolygon,
): RasterPolygon {

  const rows: RasterRow[] = [];

  for (let i = 0; i < poly.rows.length; i++) {

    const row = poly.rows[i];

    rows.push({
      leftX: Math.round(row.leftX * WORLD_SCALE_X),
      rightX: Math.round(row.rightX * WORLD_SCALE_X),
    });

    rows.push({
      leftX: 1,
      rightX: -1,
    });
  }

  return {
    topY: Math.round(poly.topY * WORLD_SCALE_Y),
    bottomY: Math.round(poly.bottomY * WORLD_SCALE_Y + (WORLD_SCALE_Y - 1)),
    leftX: Math.round(poly.leftX * WORLD_SCALE_X),
    rightX: Math.round(poly.rightX * WORLD_SCALE_X),
    rows,
  };
}
