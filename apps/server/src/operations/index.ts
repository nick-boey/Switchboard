/**
 * The operation ledger + lock subsystem (design Decision 3) — a minimal named server subsystem,
 * not a `utils` bucket. The clone is its first consumer; later changes reuse it.
 */
export { createOperationLedger } from './ledger.js';
export type {
  OperationLedger,
  OperationLedgerConfig,
  OperationRecord,
  OperationState,
  OperationType,
  OperationError,
  OperationHandler,
  OperationWorkerContext,
  StartOptions,
} from './ledger.js';
export { createKeyedLock } from './lock.js';
export type { KeyedLock } from './lock.js';
export { systemClock, systemProcessProbe } from './seams.js';
export type { Clock, ProcessProbe } from './seams.js';
