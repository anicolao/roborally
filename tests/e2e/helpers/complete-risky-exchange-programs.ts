export type CompleteRaceProgram = readonly string[];

/** Hand-constrained programs that complete the deterministic OPTION-11 race. */
export const COMPLETE_RISKY_EXCHANGE_TURNS: readonly {
  host: CompleteRaceProgram;
  guest: CompleteRaceProgram;
}[] = [
  {
    host: ['move-1 priority 500', 'rotate-right priority 110', 'move-1 priority 490', 'rotate-left priority 200', 'move-2 priority 740'],
    guest: ['back-up priority 480', 'move-1 priority 550', 'move-2 priority 750', 'rotate-right priority 90', 'move-1 priority 560']
  },
  {
    host: ['rotate-left priority 340', 'back-up priority 450', 'rotate-right priority 210', 'move-2 priority 740', 'move-3 priority 810'],
    guest: ['move-1 priority 540', 'move-1 priority 490', 'move-1 priority 610', 'rotate-right priority 350', 'u-turn priority 60']
  },
  {
    host: ['move-1 priority 520', 'rotate-right priority 410', 'move-1 priority 600', 'move-1 priority 510', 'rotate-left priority 300'],
    guest: ['move-1 priority 610', 'rotate-right priority 290', 'move-2 priority 700', 'back-up priority 460', 'back-up priority 430']
  },
  {
    host: ['move-2 priority 750', 'move-1 priority 660', 'rotate-right priority 350', 'move-2 priority 760', 'rotate-right priority 250'],
    guest: ['rotate-right priority 410', 'back-up priority 460', 'rotate-right priority 230', 'rotate-left priority 300', 'move-2 priority 730']
  },
  {
    host: ['rotate-right priority 350', 'rotate-right priority 70', 'move-2 priority 780', 'move-1 priority 630', 'back-up priority 430'],
    guest: ['move-3 priority 820', 'u-turn priority 60', 'move-2 priority 770', 'rotate-left priority 320', 'rotate-left priority 140']
  },
  {
    host: ['u-turn priority 60', 'move-2 priority 780', 'rotate-left priority 120', 'move-1 priority 550', 'move-2 priority 760'],
    guest: ['move-2 priority 750', 'move-1 priority 590', 'rotate-right priority 310', 'rotate-right priority 270', 'u-turn priority 50']
  },
  {
    host: ['move-1 priority 660', 'rotate-left priority 200', 'move-3 priority 830', 'rotate-left priority 80', 'back-up priority 450'],
    guest: ['rotate-left priority 220', 'rotate-right priority 230', 'move-2 priority 700', 'move-1 priority 570', 'move-1 priority 530']
  },
  {
    host: ['rotate-right priority 150', 'rotate-right priority 270', 'move-1 priority 550', 'move-1 priority 530', 'move-1 priority 640'],
    guest: ['rotate-right priority 230', 'move-2 priority 690', 'rotate-left priority 340', 'move-2 priority 700', 'move-1 priority 660']
  },
  {
    host: ['move-1 priority 560', 'move-3 priority 810', 'rotate-left priority 240', 'move-3 priority 820', 'u-turn priority 10'],
    guest: ['move-1 priority 520', 'rotate-left priority 180', 'move-2 priority 750', 'back-up priority 430', 'rotate-left priority 400']
  },
  {
    host: [],
    guest: ['u-turn priority 20', 'move-1 priority 530', 'move-2 priority 770', 'u-turn priority 50', 'move-3 priority 800']
  },
  {
    host: ['move-2 priority 750', 'rotate-right priority 150', 'rotate-right priority 70', 'rotate-left priority 100', 'back-up priority 450'],
    guest: ['move-1 priority 630', 'rotate-left priority 160', 'rotate-left priority 300', 'rotate-left priority 120', 'u-turn priority 50']
  },
  {
    host: ['move-1 priority 500', 'u-turn priority 50', 'move-3 priority 840', 'rotate-right priority 210', 'move-1 priority 560'],
    guest: ['move-1 priority 530', 'rotate-right priority 270', 'rotate-left priority 200', 'move-1 priority 540', 'move-3 priority 790']
  }
];
