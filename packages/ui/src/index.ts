// packages/ui/src/index.ts
//
// Public surface of @xpntl/ui.

export * from './primitives';
export { avatarColorFor, avatarInitials, hashName } from './utils/avatar';

// Consumers should also import the token CSS once at app entry:
//   import '@xpntl/ui/tokens';
