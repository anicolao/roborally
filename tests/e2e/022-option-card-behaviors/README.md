# Brakes execution decision

A robot that owns Brakes reaches its actual Move 1 timing window before choosing whether to move zero spaces. The immutable choice is replayed for both clients.

## Brakes pauses the printed Move 1 at its execution priority

![Brakes pauses the printed Move 1 at its execution priority](./screenshots/000-brakes-runtime-choice-desktop.png)

**Verifications:**

- [x] The owning player can use Brakes or execute Move 1 normally
- [x] The observer sees the Dock-ordered responder

## The persisted activation resolves as Move 0 without consuming Brakes

![The persisted activation resolves as Move 0 without consuming Brakes](./screenshots/001-brakes-zero-movement-desktop.png)

**Verifications:**

- [x] Both clients replay the zero-space movement
- [x] Brakes remains owned after use
