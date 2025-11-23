import * as YUKA from 'yuka';

/**
 * AIManager - Clean wrapper around Yuka AI library
 * Manages all AI entities and their steering behaviors
 */
export class AIManager {
  private entityManager: YUKA.EntityManager;
  private time: YUKA.Time;
  private initialized = false;

  constructor() {
    this.entityManager = new YUKA.EntityManager();
    this.time = new YUKA.Time();
  }

  /**
   * Initialize the AI system
   */
  init(): void {
    if (this.initialized) {
      console.warn('AIManager already initialized');
      return;
    }
    this.initialized = true;
    console.log('AIManager initialized');
  }

  /**
   * Update all AI entities
   * @param deltaTime - Time since last frame in seconds
   */
  update(deltaTime: number): void {
    if (!this.initialized) return;

    // Clamp delta time to prevent large jumps
    const clampedDt = Math.min(deltaTime, 0.1);

    // Update Yuka's time
    this.time.update();

    // Update all entities with their steering behaviors
    this.entityManager.update(clampedDt);
  }

  /**
   * Add an entity to the AI system
   */
  addEntity(entity: YUKA.GameEntity): void {
    this.entityManager.add(entity);
  }

  /**
   * Remove an entity from the AI system
   */
  removeEntity(entity: YUKA.GameEntity): void {
    this.entityManager.remove(entity);
  }

  /**
   * Get the entity manager for advanced usage
   */
  getEntityManager(): YUKA.EntityManager {
    return this.entityManager;
  }

  /**
   * Clear all entities
   */
  clear(): void {
    this.entityManager.clear();
  }

  /**
   * Get count of active entities
   */
  getEntityCount(): number {
    return this.entityManager.entities.length;
  }
}
