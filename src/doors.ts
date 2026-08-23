import { DoorConfig } from "./levels";
import { Point, rasteriseConvexPolygon, RasterPolygon } from "./rendering";

const DOOR_TIMER_INITIAL = 0xFF;

export interface DoorState {
    counterA: number;
    counterB: number;
}

export function createDoorState(): DoorState {
    return { counterA: 0, counterB: 0 };
}

export function triggerDoor(state: DoorState): void {
    state.counterA = DOOR_TIMER_INITIAL;
}

export function tickDoor(state: DoorState, config: DoorConfig | null): void {
    if (!config) return;
    if (state.counterA > 0) {
        state.counterA--;
    }
    if (state.counterA < config.threshold) {
        state.counterB = state.counterA;
    } else if (state.counterB < config.threshold) {
        state.counterB++;
    }
}

/*export function getDoorPolygon(state: DoorState,config: DoorConfig | null): RasterPolygon | null {
  if (!config) return null;
  let points: Point[] | null;
  switch (config.type) {
    case 'slide':
      points = getSlidePolygon(state.counterB, config);
      break;
    case 'step':
      points = getStepPolygon(state.counterB, config);
      break;
    case 'chevron':
      points = getChevronPolygon(state.counterB, config);
      break;
  }
  if (!points) {
    return null;
  }
  return rasteriseConvexPolygon(points);
}*/

let cachedDoorType: DoorConfig["type"] | null = null;
let cachedCounterB = 0;
let cachedPolygon: RasterPolygon | null = null;

export function getDoorPolygon(
  state: DoorState,
  config: DoorConfig | null,
): RasterPolygon | null {
  if (!config) {
    return null;
  }
  if (cachedPolygon && cachedDoorType === config.type && cachedCounterB === state.counterB) {
    return cachedPolygon;
  }
  let points: Point[] | null;
  switch (config.type) {
    case "slide":
      points = getSlidePolygon(state.counterB, config);
      break;
    case "step":
      points = getStepPolygon(state.counterB, config);
      break;
    case "chevron":
      points = getChevronPolygon(state.counterB, config);
      break;
  }
  if (!points) {
    return null;
  }
  cachedDoorType = config.type;
  cachedCounterB = state.counterB;
  cachedPolygon = rasteriseConvexPolygon(points);
  return cachedPolygon;
}

function getSlidePolygon(counterB: number, config: DoorConfig): Point[] | null {
    const doorX = config.closedX - counterB;
    if (doorX <= config.innerX) return null;

    const left = config.innerX;
    const right = doorX;
    const top = config.worldY;
    const bottom = (config.worldY + config.scanlines);

    return [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
    ];
}

function getStepPolygon(counterB: number, config: DoorConfig): Point[] | null {
    if (counterB >= config.threshold) return null;

    // Top counterB scanlines are open (at innerX), bottom (scanlines-counterB) are closed
    const closedStartY = config.worldY + counterB;
    const closedEndY = config.worldY + config.scanlines;

    const left = config.innerX;
    const right = config.closedX;
    const top = closedStartY;
    const bottom = closedEndY;

    return [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
    ];
}

function getChevronPolygon(counterB: number, config: DoorConfig): Point[] | null {
    const baseX = config.closedX - counterB;
    // If peak of chevron (baseX + 6) is at or behind inner wall, no visible door
    if (baseX + 6 <= config.innerX) return null;

    const innerSX = config.innerX;
    const points: Point[] = [];

    // Top-left corner
    points.push({ x: innerSX, y: config.worldY });

    // Right side: chevron outline from top to bottom
    // First 7 scanlines: X increments by 1 per row
    let x = baseX;
    for (let i = 0; i < 7; i++) {
        const effectiveX = Math.max(x, config.innerX);
        points.push({ x: effectiveX, y: (config.worldY + i)});
        x++;
    }
    // Next 8 scanlines: X decrements by 1 per row
    for (let i = 0; i < 8; i++) {
        const effectiveX = Math.max(x, config.innerX);
        points.push({ x: effectiveX, y: (config.worldY + 7 + i)});
        x--;
    }

    // Bottom-left corner
    points.push({ x: innerSX, y: (config.worldY + config.scanlines)});

    return points;
}
