import { InputState } from '../types';

/**
 * Possible actions from the universal action button (SPACE)
 */
export enum ActionType {
  NONE = 'NONE',
  ATTACK = 'ATTACK',
  ENTER_CAR = 'ENTER_CAR',
  ESCAPE_TASER = 'ESCAPE_TASER',
}

/**
 * Context needed to determine which action to perform
 */
export interface ActionContext {
  isTased: boolean;
  isNearCar: boolean;
  isInVehicle: boolean;
}

/**
 * ActionController - Resolves what action SPACE should perform based on context
 *
 * Priority order (highest first):
 * 1. Escape taser (when tased)
 * 2. Enter car (when near car and not in vehicle)
 * 3. Attack (default when on foot)
 */
export class ActionController {
  private lastActionPressed: boolean = false;

  /**
   * Resolve what action the player should perform
   * Returns the action type and whether it's a new press (edge-triggered)
   */
  resolve(input: InputState, context: ActionContext): { action: ActionType; isNewPress: boolean } {
    const isPressed = input.action;
    const isNewPress = isPressed && !this.lastActionPressed;
    this.lastActionPressed = isPressed;

    if (!isPressed) {
      return { action: ActionType.NONE, isNewPress: false };
    }

    // Priority 1: Escape taser (only on new press for mashing)
    if (context.isTased) {
      return { action: ActionType.ESCAPE_TASER, isNewPress };
    }

    // Priority 2: Enter car (only on new press)
    if (context.isNearCar && !context.isInVehicle) {
      return { action: ActionType.ENTER_CAR, isNewPress };
    }

    // Priority 3: Attack (default)
    if (!context.isInVehicle) {
      return { action: ActionType.ATTACK, isNewPress };
    }

    return { action: ActionType.NONE, isNewPress: false };
  }

  /**
   * Reset state (call on game reset)
   */
  reset(): void {
    this.lastActionPressed = false;
  }
}
