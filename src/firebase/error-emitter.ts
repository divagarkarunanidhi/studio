
import { EventEmitter } from 'events';
import { FirestorePermissionError } from './errors';

type AppEvents = {
  'permission-error': (error: FirestorePermissionError) => void;
};

// We must declare the event emitter as a typed class to get type safety.
declare interface AppEventEmitter {
  on<U extends keyof AppEvents>(event: U, listener: AppEvents[U]): this;
  emit<U extends keyof AppEvents>(event: U, ...args: Parameters<AppEvents[U]>): boolean;
  off<U extends keyof AppEvents>(event: U, listener: AppEvents[U]): this;
}

class AppEventEmitter extends EventEmitter {}

export const errorEmitter = new AppEventEmitter();
