import { describe, expect, it } from 'vitest';
import { createRoomCode, roomEventId } from './room-service';

describe('room event identifiers', () => {
  it('derives stable collision-resistant display codes from injected bytes', () => {
    expect(createRoomCode(new Uint8Array([0, 1, 2, 3, 4, 5]))).toBe('234567');
    expect(createRoomCode(new Uint8Array([32, 33, 34, 35, 36, 37]))).toBe('234567');
  });

  it('uses an actor-scoped padded sequence for idempotent event retries', () => {
    expect(roomEventId('anonymous-user', 1)).toBe('anonymous-user-000001');
    expect(roomEventId('anonymous-user', 42)).toBe('anonymous-user-000042');
  });
});
