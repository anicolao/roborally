import { describe, expect, it } from 'vitest';
import { PROGRAM_CARDS } from './program-manifest';
import {
  PROGRAMMING_DURATION_MS,
  createProgrammingState,
  handSizeForDamage,
  previewProgram,
  programCardZones,
  submitProgram,
  timeOutProgram
} from './programming';
import { deriveRaceSetup, riskyExchangeConfig } from './setup';

const config = riskyExchangeConfig('DEAL-GOLDEN');
const setup = deriveRaceSetup(
  [
    { uid: 'host', name: 'Ada', robotId: 'axle' },
    { uid: 'guest', name: 'Grace', robotId: 'bit' }
  ],
  config
);

describe('shared Program deck', () => {
  it('deals round-robin in original Dock order with a stable golden', () => {
    const state = createProgrammingState(setup, config);
    expect(state.players.map(({ uid, hand }) => ({ uid, hand }))).toEqual([
      {
        uid: setup.players[0].uid,
        hand: [
          'program-520',
          'program-590',
          'program-780',
          'program-610',
          'program-460',
          'program-660',
          'program-130',
          'program-690',
          'program-650'
        ]
      },
      {
        uid: setup.players[1].uid,
        hand: [
          'program-310',
          'program-410',
          'program-430',
          'program-620',
          'program-630',
          'program-010',
          'program-820',
          'program-810',
          'program-440'
        ]
      }
    ]);
    expect(state.drawPile).toHaveLength(66);
    expect(programCardZones(state)).toHaveLength(84);
  });

  it('provides the complete damage-dependent hand-size foundation', () => {
    expect(Array.from({ length: 10 }, (_, damage) => handSizeForDamage(damage))).toEqual([
      9, 8, 7, 6, 5, 4, 3, 2, 1, 0
    ]);
    expect(() => handSizeForDamage(10)).toThrow();
  });

  it('keeps locked-register cards out of the shuffle and in one conserved zone', () => {
    const damagedUid = setup.players[1].uid;
    const state = createProgrammingState(
      setup,
      config,
      { [damagedUid]: 5 },
      { [damagedUid]: { 5: 'program-840' } }
    );
    const damaged = state.players.find(({ uid }) => uid === damagedUid)!;

    expect(damaged.hand).toHaveLength(4);
    expect(damaged.registers[4]).toEqual({ cardId: 'program-840', locked: true });
    expect(state.drawPile).not.toContain('program-840');
    expect(programCardZones(state).get('program-840')).toBe(`register:${damagedUid}:5`);
    expect(programCardZones(state)).toHaveLength(84);
  });

  it('submits an immutable five-card program and conserves every card', () => {
    const initial = createProgrammingState(setup, config);
    const host = initial.players[0];
    const submitted = submitProgram(initial, host.uid, host.hand.slice(0, 5), 1_000);

    expect(initial.players[0].submitted).toBe(false);
    expect(submitted.players[0].registers.map(({ cardId }) => cardId)).toEqual(
      host.hand.slice(0, 5)
    );
    expect(submitted.currentTurnDiscard).toEqual(host.hand.slice(5));
    expect(submitted.deadline).toBe(1_000 + PROGRAMMING_DURATION_MS);
    expect(submitted.deadlinePlayerUid).toBe(initial.players[1].uid);
    expect(programCardZones(submitted)).toHaveLength(PROGRAM_CARDS.length);

    const repeated = submitProgram(submitted, host.uid, host.hand.slice(0, 5), 2_000);
    expect(repeated.players[0].registers).toEqual(submitted.players[0].registers);
    expect(repeated.diagnostics).toContain(`invalid-submission:${host.uid}`);
  });

  it('rejects early timeout claims and deterministically fills after the deadline', () => {
    const initial = createProgrammingState(setup, config);
    const first = initial.players[0];
    const submitted = submitProgram(initial, first.uid, first.hand.slice(0, 5), 5_000);
    const targetUid = submitted.deadlinePlayerUid!;

    const early = timeOutProgram(
      submitted,
      targetUid,
      submitted.deadline! - 1,
      config.seed
    );
    expect(early.players.find(({ uid }) => uid === targetUid)?.submitted).toBe(false);

    const timedOut = timeOutProgram(
      submitted,
      targetUid,
      submitted.deadline!,
      config.seed
    );
    expect(timedOut.phase).toBe('programmed');
    expect(timedOut.players.find(({ uid }) => uid === targetUid)?.timedOut).toBe(true);
    expect(
      timedOut.players.find(({ uid }) => uid === targetUid)?.registers.map(({ cardId }) => cardId)
    ).toEqual([
      'program-430',
      'program-010',
      'program-810',
      'program-820',
      'program-310'
    ]);
    expect(programCardZones(timedOut)).toHaveLength(84);
  });

  it('randomizes timeout fills by stable Dock order rather than ephemeral UIDs', () => {
    const replacementSetup = {
      ...setup,
      players: setup.players.map((player, index) => ({
        ...player,
        uid: `replacement-${index + 1}`
      }))
    };
    const original = createProgrammingState(setup, config);
    const replacement = createProgrammingState(replacementSetup, config);
    const originalSubmitted = submitProgram(
      original,
      original.players[0].uid,
      original.players[0].hand.slice(0, 5),
      1_000
    );
    const replacementSubmitted = submitProgram(
      replacement,
      replacement.players[0].uid,
      replacement.players[0].hand.slice(0, 5),
      1_000
    );

    const originalTimedOut = timeOutProgram(
      originalSubmitted,
      originalSubmitted.deadlinePlayerUid!,
      originalSubmitted.deadline!,
      config.seed
    );
    const replacementTimedOut = timeOutProgram(
      replacementSubmitted,
      replacementSubmitted.deadlinePlayerUid!,
      replacementSubmitted.deadline!,
      config.seed
    );

    expect(
      replacementTimedOut.players[1].registers.map(({ cardId }) => cardId)
    ).toEqual(originalTimedOut.players[1].registers.map(({ cardId }) => cardId));
  });

  it('labels previews as non-authoritative and excludes interference', () => {
    const state = createProgrammingState(setup, config);
    const player = state.players[0];
    expect(previewProgram(player, player.hand.slice(0, 2))).toEqual([
      'move-1 (520); board elements and robots excluded',
      'move-1 (590); board elements and robots excluded'
    ]);
  });
});
