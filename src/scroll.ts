export interface ScrollState {
  windowPos: { x: number; y: number };
  scrollSpeed: { x: number; y: number };
}

export interface ScrollConfig {
  statusBarOffset: number;

  // Y thresholds (in viewport-local world coordinates)
  yScrollUpTrigger: number;
  yBrakeUpStop: number;
  yBrakeDownStop: number;
  yScrollDownTrigger: number;

  // X thresholds
  xScrollLeftTrigger: number;
  xBrakeLeftStop: number;
  xBrakeRightStop: number;
  xScrollRightTrigger: number;
}

export function createScrollConfig(
  viewportWidth: number,
  viewportHeight: number,
  statusBarHeight: number = 0,
): ScrollConfig {
  return {
    statusBarOffset: statusBarHeight,

    // Y: dead zone is ~33% of height, centred
    yScrollUpTrigger:   Math.round(viewportHeight * 0.25),
    yBrakeUpStop:       Math.round(viewportHeight * 0.42),
    yBrakeDownStop:     Math.round(viewportHeight * 0.56),
    yScrollDownTrigger: Math.round(viewportHeight * 0.65),

    // X: dead zone is ~50% of width, centred
    xScrollLeftTrigger:  Math.round(viewportWidth * 0.25),
    xBrakeLeftStop:      Math.round(viewportWidth * 0.45),
    xBrakeRightStop:     Math.round(viewportWidth * 0.55),
    xScrollRightTrigger: Math.round(viewportWidth * 0.75),
  };
}

export function createScrollState(
  midpointX: number,
  midpointY: number,
  viewportWidth: number,
  viewportHeight: number,
  statusBarOffset: number,
): ScrollState {
  return {
    windowPos: {
      x: midpointX - viewportWidth / 2,
      y: midpointY - (viewportHeight + statusBarOffset) / 2,
    },
    scrollSpeed: { x: 0, y: 0 },
  };
}

export function updateScroll(
  midpointWorld: { x: number; y: number },
  velocityVector: { x: number; y: number },
  state: ScrollState,
  config: ScrollConfig,
): void {

  // -----------------------------
  // Y AXIS
  // -----------------------------

  const midpointViewY =
    midpointWorld.y -
    state.windowPos.y -
    config.statusBarOffset;

  const vy = Math.round(velocityVector.y);

  if (vy >= 0) {

    // Beyond lower trigger
    if (midpointViewY >= config.yScrollDownTrigger) {
      state.scrollSpeed.y = vy + 1;
    } else {

      // Don't fight upward scrolling
      if (state.scrollSpeed.y > 0) {
        const target = vy + 1;

        if (state.scrollSpeed.y > target) {
          state.scrollSpeed.y -= 1;

          // BBC stabilisation at ±1
          if (state.scrollSpeed.y === 0) {
            state.scrollSpeed.y = 1;
          }
        }
      }
    }

    // Hard brake zone
    if (
      state.scrollSpeed.y > 0 &&
      midpointViewY < config.yBrakeUpStop
    ) {
      state.scrollSpeed.y = 0;
    }

  } else {

    // Beyond upper trigger
    if (midpointViewY <= config.yScrollUpTrigger) {
      state.scrollSpeed.y = vy - 1;
    } else {

      // Don't fight downward scrolling
      if (state.scrollSpeed.y < 0) {
        const target = vy - 1;

        if (state.scrollSpeed.y < target) {
          state.scrollSpeed.y += 1;

          // BBC stabilisation at ±1
          if (state.scrollSpeed.y === 0) {
            state.scrollSpeed.y = -1;
          }
        }
      }
    }

    // Hard brake zone
    if (
      state.scrollSpeed.y < 0 &&
      midpointViewY > config.yBrakeDownStop
    ) {
      state.scrollSpeed.y = 0;
    }
  }

  // -----------------------------
  // X AXIS
  // -----------------------------

  const midpointViewX =
    midpointWorld.x -
    state.windowPos.x;

  // Trigger scrolling

  if (midpointViewX < config.xScrollLeftTrigger) {

    // Need to scroll left
    state.scrollSpeed.x = Math.min(
      state.scrollSpeed.x,
      midpointViewX - config.xScrollLeftTrigger
    );

  } else if (midpointViewX > config.xScrollRightTrigger) {

    // Need to scroll right
    state.scrollSpeed.x = Math.max(
      state.scrollSpeed.x,
      midpointViewX - config.xScrollRightTrigger
    );
  }

  // Braking / hysteresis

  if (state.scrollSpeed.x > 0) {

    // Camera scrolling right

    if (midpointViewX < config.xBrakeLeftStop) {
      state.scrollSpeed.x = 0;
    }
    else if (midpointViewX < config.xScrollRightTrigger) {
      state.scrollSpeed.x -= 1;

      if (state.scrollSpeed.x <= 0) {
        state.scrollSpeed.x = 1;
      }
    }

  } else if (state.scrollSpeed.x < 0) {

    // Camera scrolling left

    if (midpointViewX > config.xBrakeRightStop) {
      state.scrollSpeed.x = 0;
    }
    else if (midpointViewX > config.xScrollLeftTrigger) {
      state.scrollSpeed.x += 1;

      if (state.scrollSpeed.x >= 0) {
        state.scrollSpeed.x = -1;
      }
    }
  }

  // Apply scroll

  state.windowPos.x += state.scrollSpeed.x;
  state.windowPos.y += state.scrollSpeed.y;
}
