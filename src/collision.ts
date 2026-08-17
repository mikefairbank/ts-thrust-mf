import { Level, SwitchPosition } from "./levels";
import { fillRasteredPolygon, Point, bbcMicroColours, WORLD_SCALE_X, WORLD_SCALE_Y, WORLD_WIDTH, RasterPolygon} from "./rendering";
import { SpriteMask, TurretSprites, SwitchSprites, LoadedSprite } from "./shipSprites";

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
  worldX: number,
  worldY: number,
  dx: number,
  dy: number,
): boolean {
  const x1 = worldX;
  const x2 = worldX + dx - 1;
  const y1 = Math.floor(worldY);
  const y2 = Math.floor(worldY + dy - 1);
  // Bounding-box reject
  if (y2 < poly.topY || y1 > poly.bottomY) {
    return false;
  }
  if (x2 < poly.leftX || x1 > poly.rightX) {
    return false;
  }
  const startRow = Math.max(y1, poly.topY);
  const endRow = Math.min(y2, poly.bottomY);
  for (let y = startRow; y <= endRow; y++) {
    const row = poly.rows[y - poly.topY];
    if (x2 >= row.leftX && x1 <= row.rightX) {
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
  
export function checkForLevelItemCollision(
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

  const rectsOverlap = (
    ax: number, ay: number, aw: number, ah: number,
    bx: number, by: number, bw: number, bh: number,
  ) => {
    return (
      ax < bx + bw &&
      ax + aw > bx &&
      ay < by + bh &&
      ay + ah > by
    );
  };

  // Generator
  if (!generatorDestroyed) {
    if (rectsOverlap(
      worldX, worldY, dx, dy,
      level.powerPlant.x, level.powerPlant.y,
      powerPlantSprite.worldWidth,
      powerPlantSprite.worldHeight
    )) {
      return {
        type: "generator",
        x: level.powerPlant.x,
        y: level.powerPlant.y,
      };
    }
  }

  // Pod stand / pod
  if (!podDetachedFromStand) {
    if (rectsOverlap(
      worldX, worldY, dx, dy,
      level.podPedestal.x,
      level.podPedestal.y,
      podStandSprite.worldWidth,
      podStandSprite.worldHeight
    )) {
      return {
        type: "pod",
        x: level.podPedestal.x,
        y: level.podPedestal.y,
      };
    }
  } else if (podX !== undefined && podY !== undefined) {
    if (rectsOverlap(
      worldX, worldY, dx, dy,
      podX,
      podY,
      podSprite.worldWidth,
      podSprite.worldHeight
    )) {
      return {
        type: "pod",
        x: podX,
        y: podY,
      };
    }
  }

  // Fuel
  for (let i = 0; i < level.fuel.length; i++) {
    if (destroyedFuel?.has(i)) continue;

    const f = level.fuel[i];

    if (rectsOverlap(
      worldX, worldY, dx, dy,
      f.x,
      f.y,
      fuelSprite.worldWidth,
      fuelSprite.worldHeight
    )) {
      return {
        type: "fuel",
        index: i,
        x: f.x,
        y: f.y,
      };
    }
  }

  // Turrets
  const turretW = turretSprites.upRight.worldWidth;
  const turretH = turretSprites.upRight.worldHeight;

  for (let i = 0; i < level.turrets.length; i++) {
    if (destroyedTurrets?.has(i)) continue;

    const t = level.turrets[i];

    if (rectsOverlap(
      worldX, worldY, dx, dy,
      t.x,
      t.y,
      turretW,
      turretH
    )) {
      return {
        type: "turret",
        index: i,
        x: t.x,
        y: t.y,
      };
    }
  }

  // Switches
  const switchW = switchSprites.left.worldWidth;
  const switchH = switchSprites.left.worldHeight;

  for (let i = 0; i < level.switches.length; i++) {
    const sw = level.switches[i];

    if (rectsOverlap(
      worldX, worldY, dx, dy,
      sw.x,
      sw.y,
      switchW,
      switchH
    )) {
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

export function checkTerrainCollision(
  level: Level,
  doorPolygon: RasterPolygon | null,
  worldX: number,
  worldY: number,
  dx: number,
  dy: number,
): boolean {

  const worldWidth = WORLD_WIDTH / WORLD_SCALE_X;
  const baseOffset = Math.round(worldX / worldWidth) * worldWidth;
  const xCandidates = [worldX-baseOffset-worldWidth, worldX-baseOffset, worldX-baseOffset + worldWidth];
  for (const x of xCandidates) {
    if (checkPolygonCollision(level.landscapeLeftRasterisedPolygon!, x, worldY, dx, dy)) {
      return true;
    }
    if (checkPolygonCollision(level.landscapeRightRasterisedPolygon!, x, worldY, dx, dy)) {
      return true;
    }
    if (doorPolygon &&checkPolygonCollision(doorPolygon,x,worldY,dx,dy)) {
      return true;
    }
  }
  return false;
}

export function testCollision(
  level: Level,
  doorPolygon: RasterPolygon | null,
  mask: SpriteMask,
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

  let result = CollisionResult.None;

  for (const { dx, dy } of mask) {

    const worldX = shipWorldX + dx;
    const worldY = shipWorldY + dy;

    //
    // Terrain is highest priority
    //
    if (checkTerrainCollision(level, doorPolygon, worldX, worldY, 1, 1)) {
       return CollisionResult.Terrain;
    }

    //
    // Objects
    //
    const hit = checkForLevelItemCollision(level, worldX, worldY, 1, 1,
      fuelSprite, turretSprites, powerPlantSprite, podStandSprite,
      podSprite, switchSprites,
      destroyedTurrets,  destroyedFuel, generatorDestroyed, podDetachedFromStand, 
      podX, podY);

    if (!hit) {
      continue;
    }

    switch (hit.type) {

      case "turret":
        return CollisionResult.Turret;

      case "generator":
        if (result === CollisionResult.None) {
          result = CollisionResult.PowerPlant;
        }
        break;

      case "pod":
        if (result === CollisionResult.None) {
          result = CollisionResult.Pod;
        }
        break;

      case "fuel":
        if (result === CollisionResult.None) {
          result = CollisionResult.Fuel;
        }
        break;

      case "switch":
        if (result === CollisionResult.None) {
          result = CollisionResult.Switch;
        }
        break;
    }
  }
  return result;
}
