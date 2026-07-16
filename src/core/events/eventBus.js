/**
 * Internal Event Bus
 *
 * Singleton EventEmitter wrapper used for in-process, best-effort
 * event communication between modules. Keeps modules decoupled —
 * no direct cross-service imports for side effects.
 *
 * Usage:
 *   import eventBus from './eventBus.js';
 *   import { Events } from './eventNames.js';
 *
 *   // Emit:
 *   eventBus.emit(Events.LECTURE_COMPLETED, { userId, courseId, lectureId });
 *
 *   // Listen:
 *   eventBus.on(Events.LECTURE_COMPLETED, (payload) => { ... });
 *
 * IMPORTANT: This bus is in-process and in-memory. Events are NOT
 * durable — if the process crashes mid-emission, the event is lost.
 * Best-effort is acceptable for notification side-effects (analytics,
 * badges, toasts). For revenue-critical paths (payment → enrollment),
 * use the BullMQ queue instead (see core/queue/).
 */
import { EventEmitter } from 'events';
import logger from '../logger/logger.js';

class EventBus extends EventEmitter {
  /**
   * Emit a named event with a payload.
   * Automatically logs every emission at debug level for traceability.
   *
   * @param {string} eventName
   * @param {*} payload
   */
  emit(eventName, payload) {
    logger.debug(`[EventBus] emit: ${eventName}`, { payload });
    return super.emit(eventName, payload);
  }

  /**
   * Register a listener. Wraps the handler in try/catch so a
   * failing listener never crashes the emitter or other listeners.
   *
   * @param {string} eventName
   * @param {Function} listener
   */
  on(eventName, listener) {
    const safeListener = async (payload) => {
      try {
        await listener(payload);
      } catch (err) {
        logger.error(`[EventBus] listener error on ${eventName}`, { error: err.message, stack: err.stack });
      }
    };
    return super.on(eventName, safeListener);
  }
}

// Increase max listeners to accommodate all module registrations
const eventBus = new EventBus();
eventBus.setMaxListeners(30);

export default eventBus;
