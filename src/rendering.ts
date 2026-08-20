export const bbcMicroColours = {
  black:   "#000000",
  red:     "#ff0000",
  green:   "#00ff00",
  yellow:  "#ffff00",
  blue:    "#0000ff",
  magenta: "#ff00ff",
  cyan:    "#00ffff",
  white:   "#ffffff",
} as const;

export interface Point {
  x: number;
  y: number;
}

import { Level, TurretDirection, SwitchDirection } from "./levels";
import { fontData, charIndex, CHAR_W, CHAR_H } from "./font";
import { TurretSprites, LoadedSprite, SwitchSprites } from "./shipSprites";

export type RasterRow = {
    leftX: number;
    rightX: number;
};

export type RasterPolygon = {
    topY: number;
    bottomY: number;
    leftX: number;
    rightX: number;
    rows: RasterRow[];
};

export function rasteriseConvexPolygon(
    points: Point[],
): RasterPolygon {

  if (points.length < 3) {
    return {topY: 0, bottomY: -1, leftX: 0, rightX: -1, rows: []};
  }

  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;

  for (const p of points) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
  }
  const topY = Math.ceil(minY);
  const bottomY = Math.floor(maxY);
  const rows: RasterRow[] = [];
  for (let y = topY; y <= bottomY; y += 1) {
      const intersections: number[] = [];
      for (let i = 0; i < points.length; i++) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
              const t = (y - a.y) / (b.y - a.y);
              intersections.push(a.x + t * (b.x - a.x));
          }
      }
      intersections.sort((a, b) => a - b);
      if (intersections.length >= 2) {
          rows.push({leftX: Math.ceil(intersections[0]),
              rightX: Math.floor(intersections[intersections.length - 1])});
      } else {
          rows.push({leftX: 0, rightX: -1});
      }
  }
  return {topY,bottomY,leftX: Math.floor(minX),rightX: Math.ceil(maxX),rows};
}

export function fillRasteredPolygon(
  ctx: CanvasRenderingContext2D,
  poly: RasterPolygon,
  color: string,
  camX: number,
  camY: number,
  borderX: number = 0,
  borderY: number = 0,
) {
  ctx.fillStyle = color;
  // Whole-polygon screen-space bounding box reject
  const screenTop = Math.round(poly.topY * WORLD_SCALE_Y - camY + borderY);
  const screenBottom = Math.round(poly.bottomY * WORLD_SCALE_Y - camY + borderY);
  if (screenBottom < 0 || screenTop >= ctx.canvas.height) {
    return;
  }
  const screenLeft = Math.round(poly.leftX * WORLD_SCALE_X - camX + borderX);
  const screenRight = Math.round(poly.rightX * WORLD_SCALE_X - camX + borderX);
  if (screenRight < 0 || screenLeft >= ctx.canvas.width) {
    return;
  }
  for (let i = 0; i < poly.rows.length; i++) {
    const worldY = poly.topY + i;
    const screenY = Math.round(worldY * WORLD_SCALE_Y - camY + borderY);
    if (screenY < 0) {
      continue;
    }
    if (screenY >= ctx.canvas.height) {
      break;
    }
    const row = poly.rows[i];
    const leftX = Math.round(row.leftX * WORLD_SCALE_X - camX + borderX);
    const rightX = Math.round(row.rightX * WORLD_SCALE_X - camX + borderX);
    if (rightX >= leftX) {
      ctx.fillRect(leftX, screenY, rightX - leftX + 1, 1);
    }
  }
}

export function fillRasteredPolygonPixelCoords(
  ctx: CanvasRenderingContext2D,
  poly: RasterPolygon,
  color: string,
  camX: number,
  camY: number,
  borderX: number = 0,
  borderY: number = 0,
) {
  ctx.fillStyle = color;
  // Whole-polygon screen-space bounding box reject
  const screenTop = Math.round(poly.topY- camY + borderY);
  const screenBottom = Math.round(poly.bottomY - camY + borderY);
  if (screenBottom < 0 || screenTop >= ctx.canvas.height) {
    return;
  }
  const screenLeft = Math.round(poly.leftX - camX + borderX);
  const screenRight = Math.round(poly.rightX - camX + borderX);
  if (screenRight < 0 || screenLeft >= ctx.canvas.width) {
    return;
  }
  for (let i = 0; i < poly.rows.length; i++) {
    const worldY = poly.topY + i;
    const screenY = Math.round(worldY - camY + borderY);
    if (screenY < 0) {
      continue;
    }
    if (screenY >= ctx.canvas.height) {
      break;
    }
    const row = poly.rows[i];
    const leftX = Math.round(row.leftX - camX + borderX);
    const rightX = Math.round(row.rightX - camX + borderX);
    if (rightX >= leftX) {
      ctx.fillRect(leftX, screenY, rightX - leftX + 1, 1);
    }
  }
}


// Terrain X values are byte-column indices from the BBC Micro (1 unit = 2 MODE 2 pixels).
// Our 320px canvas is 2x MODE 2 resolution, so each terrain unit = 4 canvas pixels.
export const WORLD_SCALE_X = 4;
export const WORLD_SCALE_Y = 2;
export const WORLD_WIDTH = 256 * WORLD_SCALE_X;

export function computeCamera(
  playerX: number,
  playerY: number,
  screenW: number,
  screenH: number
): { camX: number; camY: number } {
  return {
    camX: Math.round(playerX * WORLD_SCALE_X - screenW / 2),
    camY: Math.round(playerY * WORLD_SCALE_Y - screenH / 2),
  };
}

export function rotationToSpriteIndex(radians: number): number {
  const twoPi = Math.PI * 2;
  const normalized = ((radians % twoPi) + twoPi) % twoPi;
  return Math.round(normalized / (twoPi / 32)) % 32;
}

const tintCanvas = document.createElement('canvas');
const tintCtx = tintCanvas.getContext('2d', { willReadFrequently: true })!;

function parseHexColor(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function drawWhiteReplacedSprite(
  ctx: CanvasRenderingContext2D,
  sprite: LoadedSprite,
  x: number,
  y: number,
  color: string,
) {
  tintCanvas.width = sprite.width;
  tintCanvas.height = sprite.height;
  tintCtx.clearRect(0, 0, sprite.width, sprite.height);
  tintCtx.drawImage(sprite.bitmap, 0, 0);
  const imageData = tintCtx.getImageData(0, 0, sprite.width, sprite.height);
  const data = imageData.data;
  const [cr, cg, cb] = parseHexColor(color);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255 && data[i + 3] > 0) {
      data[i] = cr;
      data[i + 1] = cg;
      data[i + 2] = cb;
    }
  }
  tintCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(tintCanvas, x, y);
}

/**
 * Remap source sprite placeholder colours to the level palette:
 *   White (255,255,255) → colour3 (object colour, per level)
 *   Red   (255,0,0)     → colour1 (always yellow)
 *   Other non-black      → colour2 (landscape colour, per level)
 */
export function drawRemappedSprite(
  ctx: CanvasRenderingContext2D,
  sprite: LoadedSprite,
  x: number,
  y: number,
  colour3: string,
  colour2: string,
) {
  tintCanvas.width = sprite.width;
  tintCanvas.height = sprite.height;
  tintCtx.clearRect(0, 0, sprite.width, sprite.height);
  tintCtx.drawImage(sprite.bitmap, 0, 0);
  const imageData = tintCtx.getImageData(0, 0, sprite.width, sprite.height);
  const data = imageData.data;
  const [c3r, c3g, c3b] = parseHexColor(colour3);
  const [c2r, c2g, c2b] = parseHexColor(colour2);
  // Colour 1 is always yellow
  const c1r = 255, c1g = 255, c1b = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r === 255 && g === 255 && b === 255) {
      // White → colour 3 (object colour)
      data[i] = c3r; data[i + 1] = c3g; data[i + 2] = c3b;
    } else if (r === 255 && g === 0 && b === 0) {
      // Red → colour 1 (yellow)
      data[i] = c1r; data[i + 1] = c1g; data[i + 2] = c1b;
    } else if (r > 0 || g > 0 || b > 0) {
      // Other non-black → colour 2 (landscape colour)
      data[i] = c2r; data[i + 1] = c2g; data[i + 2] = c2b;
    }
  }
  tintCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(tintCanvas, x, y);
}

function getTurretSprite(
  direction: TurretDirection,
  sprites: TurretSprites,
): LoadedSprite {
  switch (direction) {
    case 'up_left': return sprites.upLeft;
    case 'up_right': return sprites.upRight;
    case 'down_left': return sprites.downLeft;
    case 'down_right': return sprites.downRight;
  }
}

export function toScreenX(worldX: number, camX: number): number {
    let sx = worldX * WORLD_SCALE_X - camX;
    while (sx < -WORLD_WIDTH / 2) sx += WORLD_WIDTH;
    while (sx >  WORLD_WIDTH / 2) sx -= WORLD_WIDTH;
    return sx;
}

export const GENERATOR_Y_OFFSET = -2;
export const FUEL_Y_OFFSET = -2;
export const POD_Y_OFFSET = -1;
export const TURRET_Y_OFFSET = -1;
export const SWITCH_Y_OFFSET = -1;

export function renderLevel(
  ctx: CanvasRenderingContext2D,
  level: Level,
  playerX: number,
  playerY: number,
  playerRotation: number,
  shipSprites: LoadedSprite[],
  camX: number,
  camY: number,
  fuelSprite?: LoadedSprite,
  turretSprites?: TurretSprites,
  powerPlantSprite?: LoadedSprite,
  podStandSprite?: LoadedSprite,
  shieldSprite?: LoadedSprite,
  destroyedTurrets?: Set<number>,
  destroyedFuel?: Set<number>,
  generatorDestroyed?: boolean,
  generatorVisible?: boolean,
  podDetached?: boolean,
  hideShip?: boolean,
  doorPolygon?: RasterPolygon | null,
  switchSprites?: SwitchSprites,
) {
  camY=Math.round(camY/2)*2;// try to reduce shimmering when camera scrolls vertically. (Dont want alternate raster lines for landscape to flicker)

  // Scale world coordinates to screen space
  const wx = (x: number) => x * WORLD_SCALE_X;
  const wy = (y: number) => y * WORLD_SCALE_Y;

  // Draw terrain polygons at three offsets to handle wrapping.
  // Offsets are computed dynamically so terrain stays visible even when the
  // camera has travelled more than one world-width from the origin.
  const baseOffset = Math.round(camX / WORLD_WIDTH) * WORLD_WIDTH;
  const offsets = [baseOffset - WORLD_WIDTH, baseOffset, baseOffset + WORLD_WIDTH];
  for (const offset of offsets) {
    //fillRasteredPolygon(ctx,level.landscapeLeftRasterisedPolygon,level.terrainColor,camX - offset,camY);
    //fillRasteredPolygon(ctx,level.landscapeRightRasterisedPolygon,level.terrainColor,camX - offset,camY);
    fillRasteredPolygonPixelCoords(ctx,level.landscapeLeftRasterisedPolygonPixels,level.terrainColor,camX - offset,camY);
    fillRasteredPolygonPixelCoords(ctx,level.landscapeRightRasterisedPolygonPixels,level.terrainColor,camX - offset,camY);
  }
  
  // Draw door polygon (terrain-colored overlay) at wrapping offsets
  if (doorPolygon) {
    for (const offset of offsets) {
      fillRasteredPolygon(ctx, doorPolygon, level.terrainColor,camX - offset,camY);
    }
  }

  // Draw objects (with wrapping)
  const drawMarker = (ox: number, oy: number, colour: string) => {
    const sx = Math.round(toScreenX(ox,camX));
    const sy = Math.round(wy(oy) - camY);
    ctx.fillStyle = colour;
    ctx.fillRect(sx - 3, sy - 3, 7, 7);
  };

  if (!generatorDestroyed && (generatorVisible ?? true)) {
    if (powerPlantSprite) {
      const sx = Math.round(toScreenX(level.powerPlant.x,camX));
      const sy = Math.round(wy(level.powerPlant.y) - camY);
      drawRemappedSprite(ctx, powerPlantSprite, sx, sy + GENERATOR_Y_OFFSET, level.objectColor, level.terrainColor);
    } else {
      drawMarker(level.powerPlant.x, level.powerPlant.y, bbcMicroColours.cyan);
    }
  }
  if (!podDetached) {
    if (podStandSprite) {
      const sx = Math.round(toScreenX(level.podPedestal.x,camX));
      const sy = Math.round(wy(level.podPedestal.y) - camY);
      drawRemappedSprite(ctx, podStandSprite, sx, sy + POD_Y_OFFSET, level.objectColor, level.terrainColor);
    } else {
      drawMarker(level.podPedestal.x, level.podPedestal.y, bbcMicroColours.white);
    }
  }
  for (let i = 0; i < level.fuel.length; i++) {
    if (destroyedFuel?.has(i)) continue;
    const f = level.fuel[i];
    if (fuelSprite) {
      const sx = Math.round(toScreenX(f.x,camX));
      const sy = Math.round(wy(f.y) - camY);
      drawRemappedSprite(ctx, fuelSprite, sx, sy + FUEL_Y_OFFSET, level.objectColor, level.terrainColor);
    } else {
      drawMarker(f.x, f.y, bbcMicroColours.magenta);
    }
  }
  for (let i = 0; i < level.turrets.length; i++) {
    if (destroyedTurrets?.has(i)) continue;
    const t = level.turrets[i];
    if (turretSprites) {
      const sprite = getTurretSprite(t.direction, turretSprites);
      const sx = Math.round(toScreenX(t.x,camX));
      const sy = Math.round(wy(t.y) - camY);
      drawRemappedSprite(ctx, sprite, sx, sy + TURRET_Y_OFFSET, level.objectColor, level.terrainColor);
    } else {
      drawMarker(t.x, t.y, bbcMicroColours.red);
    }
  }
  // Draw switches
  if (switchSprites) {
    for (const sw of level.switches) {
      const sprite = sw.direction === 'left' ? switchSprites.left : switchSprites.right;
      const sx = Math.round(toScreenX(sw.x,camX));
      const sy = Math.round(wy(sw.y) - camY);
      drawRemappedSprite(ctx, sprite, sx, sy + SWITCH_Y_OFFSET, level.objectColor, level.terrainColor);
    }
  }

  // Draw player ship — anchor on per-sprite center of mass to eliminate rotation jiggle
  const spriteIdx = rotationToSpriteIndex(playerRotation);
  const sprite = shipSprites[spriteIdx];
  //const center = shipCenters[spriteIdx];
  const screenX = Math.round(wx(playerX) - camX);
  const screenY = Math.round(wy(playerY) - camY);
  const shipDrawX = Math.round(screenX - sprite.centerX);
  const shipDrawY = Math.round(screenY - sprite.centerY);

  if (!hideShip) {
    ctx.drawImage(sprite.bitmap, shipDrawX, shipDrawY);

    if (shieldSprite) {
      // Shield is centered on the canvas (same size as ship sprites)
      const shieldDrawX = Math.round(screenX - shieldSprite.width / 2);
      const shieldDrawY = Math.round(screenY - shieldSprite.height / 2);
      drawWhiteReplacedSprite(ctx, shieldSprite, shieldDrawX, shieldDrawY, bbcMicroColours.green);
    }
  }
}

export function drawStatusBar(
  ctx: CanvasRenderingContext2D,
  screenW: number,
  fuel: number,
  lives: number,
  score: number
) {
  const scale = 1;
  const charW = CHAR_W * scale;
  const charH = CHAR_H * scale;
  const barHeight = 15;

  // Clear status bar area to black so level content doesn't show through
  ctx.fillStyle = bbcMicroColours.black;
  ctx.fillRect(0, 0, screenW, barHeight + 1);

  // --- Yellow border with chamfered bottom corners ---
  const bL = 2;
  const bR = screenW - 3;
  const bT = 0;
  const bB = barHeight;
  const corner = 5;

  ctx.fillStyle = bbcMicroColours.yellow;
  // Top edge
  ctx.fillRect(bL, bT, bR - bL + 1, 1);
  // Left edge
  ctx.fillRect(bL, bT, 1, bB - bT - corner);
  // Right edge
  ctx.fillRect(bR, bT, 1, bB - bT - corner);
  // Bottom edge
  ctx.fillRect(bL + corner, bB, bR - bL - corner * 2 + 1, 1);
  // Bottom-left diagonal
  for (let i = 0; i <= corner; i++) {
    ctx.fillRect(bL + i, bB - corner + i, 1, 1);
  }
  // Bottom-right diagonal
  for (let i = 0; i <= corner; i++) {
    ctx.fillRect(bR - i, bB - corner + i, 1, 1);
  }

  // --- Label positions ---
  const labelY = 2;
  const fuelX = 9 + 2 * charW;
  const livesX = Math.floor((screenW - 5 * charW) / 2);
  const scoreX = screenW - 9 - 5 * charW - 2 * charW;

  // --- Red decorative double-lines (with gaps for labels) ---
  const rl1 = labelY + 1;
  const rl2 = labelY + 3;
  const gap = 1;

  ctx.fillStyle = bbcMicroColours.red;
  const segments: [number, number][] = [
    [bL + 2, fuelX - gap - 1],
    [fuelX + 4 * charW + gap + 1, livesX - gap - 1],
    [livesX + 5 * charW + gap + 1, scoreX - gap - 1],
    [scoreX + 5 * charW + gap + 1, bR - 1],
  ];
  for (const [x1, x2] of segments) {
    if (x2 > x1) {
      ctx.fillRect(x1, rl1, x2 - x1, 1);
      ctx.fillRect(x1, rl2, x2 - x1, 1);
    }
  }

  // --- Green labels ---
  drawText(ctx, "FUEL", fuelX, labelY, bbcMicroColours.green, scale);
  drawText(ctx, "LIVES", livesX, labelY, bbcMicroColours.green, scale);
  drawText(ctx, "SCORE", scoreX, labelY, bbcMicroColours.green, scale);

  // --- Yellow values ---
  const valueY = labelY + charH + 2;

  const fuelStr = String(fuel);
  const fuelValX = fuelX + 4 * charW - fuelStr.length * charW;
  drawText(ctx, fuelStr, fuelValX, valueY, bbcMicroColours.yellow, scale);

  const livesStr = String(Math.max(0,lives-1));
  const livesValX = livesX + Math.floor((5 * charW - livesStr.length * charW) / 2);
  drawText(ctx, livesStr, livesValX, valueY, bbcMicroColours.yellow, scale);

  const scoreStr = String(score);
  const scoreValX = scoreX + 5 * charW - scoreStr.length * charW;
  drawText(ctx, scoreStr, scoreValX, valueY, bbcMicroColours.yellow, scale);
}

const FONT_MSB = 0x80;

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colour: string,
  scale: number = 1
) {
  ctx.fillStyle = colour;
  let cursorX = x;

  for (const ch of text) {
    if (ch === " ") {
      cursorX += CHAR_W * scale;
      continue;
    }

    const idx = charIndex(ch);
    const rows = fontData[idx];

    for (let row = 0; row < CHAR_H; row++) {
      const byte = rows[row];
      for (let col = 0; col < CHAR_W; col++) {
        if (byte & (FONT_MSB >> col)) {
          ctx.fillRect(
            cursorX + col * scale,
            y + row * scale,
            scale,
            scale
          );
        }
      }
    }

    cursorX += CHAR_W * scale;
  }
}
