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
    yScrollUpTrigger:   Math.round(viewportHeight * 0.33),
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
  forceVector: { x: number; y: number },
  state: ScrollState,
  config: ScrollConfig,
): void {
  // --- Y axis (proportional to overshoot, same approach as X) ---
  const midpointViewY = midpointWorld.y - state.windowPos.y - config.statusBarOffset;

  if (midpointViewY < config.yScrollUpTrigger) {
    // Outside dead zone above — scroll speed proportional to overshoot
    state.scrollSpeed.y = midpointViewY - config.yScrollUpTrigger;
  } else if (midpointViewY > config.yScrollDownTrigger) {
    // Outside dead zone below
    state.scrollSpeed.y = midpointViewY - config.yScrollDownTrigger;
  } else {
    // Inside dead zone — decelerate toward zero
    if (state.scrollSpeed.y > 0) {
      state.scrollSpeed.y = Math.max(0, state.scrollSpeed.y - 1);
    } else if (state.scrollSpeed.y < 0) {
      state.scrollSpeed.y = Math.min(0, state.scrollSpeed.y + 1);
    }
  }

  // --- X axis ---
  const midpointViewX = midpointWorld.x - state.windowPos.x;

  if (midpointViewX < config.xScrollLeftTrigger) {
    // Outside dead zone left — scroll speed proportional to overshoot
    state.scrollSpeed.x = midpointViewX - config.xScrollLeftTrigger;
  } else if (midpointViewX > config.xScrollRightTrigger) {
    // Outside dead zone right
    state.scrollSpeed.x = midpointViewX - config.xScrollRightTrigger;
  } else {
    // Inside dead zone — decelerate toward zero (float-safe, no sign-flip)
    if (state.scrollSpeed.x > 0) {
      state.scrollSpeed.x = Math.max(0, state.scrollSpeed.x - 1);
    } else if (state.scrollSpeed.x < 0) {
      state.scrollSpeed.x = Math.min(0, state.scrollSpeed.x + 1);
    }
  }

  // Apply scroll to window position
  state.windowPos.x += state.scrollSpeed.x;
  state.windowPos.y += state.scrollSpeed.y;
}

/*export function updateScrollNew(
  midpointWorld: { x: number; y: number },
  forceVector: { x: number; y: number },
  state: ScrollState,
  config: ScrollConfig,
): void {

  //
  // Apply previous frame's scroll first
  //
  state.windowPos.x += state.scrollSpeed.x;
  state.windowPos.y += state.scrollSpeed.y;

  //
  // Midpoint relative to window
  //
  const midpointViewY =
    midpointWorld.y -
    state.windowPos.y -
    config.statusBarOffset;

  const midpointViewX =
    midpointWorld.x -
    state.windowPos.x;

  //
  // Integer velocity like BBC
  //
  const vy = Math.round(forceVector.y);

  //
  // ----- Vertical -----
  //
  if (vy >= 0) {

    if (midpointViewY >= config.yScrollDownTrigger) {

      state.scrollSpeed.y = vy + 1;

    } else {

      if (state.scrollSpeed.y > 0) {

        if (vy + 1 < state.scrollSpeed.y) {
          state.scrollSpeed.y--;
          if (state.scrollSpeed.y === 0) {
            state.scrollSpeed.y = 1;
          }
        }
      }
    }

  } else {

    if (midpointViewY <= config.yScrollUpTrigger) {

      state.scrollSpeed.y = vy - 1;

    } else {

      if (state.scrollSpeed.y < 0) {

        if (state.scrollSpeed.y < vy) {
          state.scrollSpeed.y++;
          if (state.scrollSpeed.y === 0) {
            state.scrollSpeed.y = -1;
          }
        }
      }
    }
  }

  //
  // BBC hard-brake zone
  //
  if (state.scrollSpeed.y > 0) {

    if (midpointViewY < config.yBrakeUpStop) {
      state.scrollSpeed.y = 0;
    }

  } else if (state.scrollSpeed.y < 0) {

    if (midpointViewY > config.yBrakeDownStop) {
      state.scrollSpeed.y = 0;
    }
  }

  //
  // ----- Horizontal -----
  //
  if (midpointViewX < config.xScrollLeftTrigger) {

    state.scrollSpeed.x =
      Math.round(
        midpointViewX -
        config.xScrollLeftTrigger
      );

  } else if (midpointViewX > config.xScrollRightTrigger) {

    state.scrollSpeed.x =
      Math.round(
        midpointViewX -
        config.xScrollRightTrigger
      );

  }

  if (state.scrollSpeed.x > 0) {

    if (midpointViewX < config.xBrakeRightStop) {

      state.scrollSpeed.x = 0;

    } else if (
      midpointViewX <
      config.xScrollRightTrigger
    ) {

      state.scrollSpeed.x--;

      if (state.scrollSpeed.x === 0) {
        state.scrollSpeed.x = 1;
      }
    }

  } else if (state.scrollSpeed.x < 0) {

    if (midpointViewX > config.xBrakeLeftStop) {

      state.scrollSpeed.x = 0;

    } else if (
      midpointViewX >
      config.xScrollLeftTrigger
    ) {

      state.scrollSpeed.x++;

      if (state.scrollSpeed.x === 0) {
        state.scrollSpeed.x = -1;
      }
    }
  }

  //
  // BBC uses integer scroll values
  //
  state.scrollSpeed.x = Math.round(state.scrollSpeed.x);
  state.scrollSpeed.y = Math.round(state.scrollSpeed.y);
}*/
