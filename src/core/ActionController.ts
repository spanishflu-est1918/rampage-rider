import { InputState } from '../types';

/**
 * Possible actions from the universal action button (SPACE)
 */
export enum ActionType {
  NONE = 'NONE',
  ATTACK = 'ATTACK',
  ENTER_CAR = 'ENTER_CAR',
  SWITCH_VEHICLE = 'SWITCH_VEHICLE', // Switch from current vehicle to awaiting vehicle
  ESCAPE_TASER = 'ESCAPE_TASER',
  EXIT_STUCK_VEHICLE = 'EXIT_STUCK_VEHICLE', // Exit when vehicle is stuck
}

/**
 * Context needed to determine which action to perform
 */
export interface ActionContext {
  isTased: boolean;
  isNearCar: boolean;
  isNearAwaitingVehicle: boolean; // Near an upgrade vehicle while in current vehicle
  isInVehicle: boolean;
  isVehicleStuck: boolean; // Vehicle hasn't moved for a while
}

/**
 * ActionController - Resolves what action SPACE should perform based on context
 *
 * Priority order (highest first):
 * 1. Escape taser (when tased)
 * 2. Exit stuck vehicle (when in vehicle and stuck)
 * 3. Switch vehicle (when in vehicle and near awaiting upgrade)
 * 4. Enter car (when near car and not in vehicle)
 * 5. Attack (default)
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

    // Priority 2: Exit stuck vehicle (when in vehicle and stuck for a while)
    if (context.isInVehicle && context.isVehicleStuck) {
      return { action: ActionType.EXIT_STUCK_VEHICLE, isNewPress };
    }

    // Priority 3: Switch vehicle (when in vehicle and near awaiting upgrade)
    if (context.isInVehicle && context.isNearAwaitingVehicle) {
      return { action: ActionType.SWITCH_VEHICLE, isNewPress };
    }

    // Priority 4: Enter car (only on new press, when not in vehicle)
    if (context.isNearCar && !context.isInVehicle) {
      return { action: ActionType.ENTER_CAR, isNewPress };
    }

    // Priority 5: Attack (works on foot AND in vehicle - Engine handles vehicle attacks)
    return { action: ActionType.ATTACK, isNewPress };
  }

  /**
   * Reset state (call on game reset)
   */
  reset(): void {
    this.lastActionPressed = false;
  }
}
