export const COMPLETE_COURSE_MANIFEST_VERSION = 'courses-avalon-hill-2005-complete-v1';

export type CourseCategory = 'beginner' | 'expert' | 'team';
export type CourseLength = 'short' | 'medium' | 'long';
export type CourseRotation = 0 | 1 | 2 | 3;

export interface PublishedBoardPlacement {
  instanceId: string;
  boardId: string;
  origin: readonly [number, number];
  rotation: CourseRotation;
}

export interface PublishedFlag {
  number: number;
  x: number;
  y: number;
}

export type CourseSpecialRule =
  | { kind: 'starting-option-draft'; dealt: 3; keep: 1 }
  | { kind: 'moving-flags' }
  | { kind: 'robot-laser-multiplier'; multiplier: 2 }
  | { kind: 'starting-damage'; amount: 2 }
  | { kind: 'power-down-disabled' }
  | { kind: 'repair-sites-draw-options'; single: 1; crossed: 2 }
  | { kind: 'programming-limit'; seconds: 30 | 60 }
  | { kind: 'starting-options'; count: 1 }
  | { kind: 'superbot' }
  | { kind: 'two-controlled-robots' }
  | { kind: 'rotate-board-on-flag'; probability: 'coin-heads' }
  | { kind: 'team-shared-flag-progress' }
  | { kind: 'team-individual-racer' }
  | { kind: 'capture-the-flag' }
  | { kind: 'toggle-flag-control' }
  | { kind: 'team-elimination' };

export interface PublishedCourseManifest {
  id: string;
  name: string;
  category: CourseCategory;
  manualPage: number;
  sourceEdition: 'avalon-hill-2005';
  manifestVersion: typeof COMPLETE_COURSE_MANIFEST_VERSION;
  reviewStatus: 'reviewed-two-pass';
  players: readonly number[];
  length: CourseLength;
  difficulty: 'easy' | 'mid' | 'hard' | 'expert' | 'team';
  description: string;
  boardPlacements: readonly PublishedBoardPlacement[];
  flags: readonly PublishedFlag[];
  specialRules: readonly CourseSpecialRule[];
  provenance: readonly string[];
}

const allPlayers = (minimum: number, maximum: number) =>
  Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
const evenTeams = [4, 6, 8] as const;

function singleBoard(boardId: string, dockingBay: 'a' | 'b' = 'a'): PublishedBoardPlacement[] {
  return [
    { instanceId: `${boardId}-1`, boardId, origin: [1, 1], rotation: 0 },
    {
      instanceId: `docking-bay-${dockingBay}-1`,
      boardId: `docking-bay-${dockingBay}`,
      origin: [1, 13],
      rotation: 0
    }
  ];
}

function horizontalBoards(
  boardIds: readonly string[],
  dockingBay: 'a' | 'b' = 'a'
): PublishedBoardPlacement[] {
  return [
    ...boardIds.map((boardId, index) => ({
      instanceId: `${boardId}-${index + 1}`,
      boardId,
      origin: [index * 12 + 1, 1] as const,
      rotation: 0 as const
    })),
    {
      instanceId: `docking-bay-${dockingBay}-1`,
      boardId: `docking-bay-${dockingBay}`,
      origin: [boardIds.length * 12 + 1, 1] as const,
      rotation: 1 as const
    }
  ];
}

function verticalBoards(
  boardIds: readonly string[],
  dockingBay: 'a' | 'b' = 'a'
): PublishedBoardPlacement[] {
  return [
    ...boardIds.map((boardId, index) => ({
      instanceId: `${boardId}-${index + 1}`,
      boardId,
      origin: [1, index * 12 + 1] as const,
      rotation: 0 as const
    })),
    {
      instanceId: `docking-bay-${dockingBay}-1`,
      boardId: `docking-bay-${dockingBay}`,
      origin: [1, boardIds.length * 12 + 1] as const,
      rotation: 0 as const
    }
  ];
}

function placed(
  instanceId: string,
  boardId: string,
  x: number,
  y: number,
  rotation: CourseRotation = 0
): PublishedBoardPlacement {
  return { instanceId, boardId, origin: [x, y], rotation };
}

interface CourseInput
  extends Omit<
    PublishedCourseManifest,
    | 'sourceEdition'
    | 'manifestVersion'
    | 'reviewStatus'
    | 'provenance'
    | 'boardPlacements'
    | 'flags'
  > {
  boardIds: readonly string[];
  dockingBay?: 'a' | 'b';
  boardPlacements?: readonly PublishedBoardPlacement[];
  flags: readonly PublishedFlag[];
}

function course(input: CourseInput): PublishedCourseManifest {
  const placements =
    input.boardPlacements ??
    (input.boardIds.length === 1
      ? singleBoard(input.boardIds[0], input.dockingBay)
      : horizontalBoards(input.boardIds, input.dockingBay));
  return Object.freeze({
    id: input.id,
    name: input.name,
    category: input.category,
    manualPage: input.manualPage,
    sourceEdition: 'avalon-hill-2005',
    manifestVersion: COMPLETE_COURSE_MANIFEST_VERSION,
    reviewStatus: 'reviewed-two-pass',
    players: input.players,
    length: input.length,
    difficulty: input.difficulty,
    description: input.description,
    boardPlacements: placements,
    flags: input.flags,
    specialRules: input.specialRules,
    provenance: [
      `Robo Rally 2005 Course Manual, page ${input.manualPage}`,
      'Independent diagram pass against board-face orientation, Docking Bay face, and flag order'
    ]
  });
}

export const BEGINNER_COURSES = Object.freeze([
  course({
    id: 'risky-exchange',
    name: 'Risky Exchange',
    category: 'beginner',
    manualPage: 13,
    players: allPlayers(2, 8),
    length: 'medium',
    difficulty: 'easy',
    description: 'An easy course to start on, but do not fall off the edge.',
    boardIds: ['exchange'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 8, y: 2 },
      { number: 2, x: 10, y: 8 },
      { number: 3, x: 2, y: 5 }
    ],
    specialRules: []
  }),
  course({
    id: 'checkmate',
    name: 'Checkmate',
    category: 'beginner',
    manualPage: 13,
    players: allPlayers(5, 8),
    length: 'short',
    difficulty: 'easy',
    description: 'Push the other robots into pits. Checkmate.',
    boardIds: ['chess'],
    flags: [
      { number: 1, x: 8, y: 3 },
      { number: 2, x: 4, y: 9 }
    ],
    specialRules: []
  }),
  course({
    id: 'dizzy-dash',
    name: 'Dizzy Dash',
    category: 'beginner',
    manualPage: 14,
    players: allPlayers(2, 8),
    length: 'short',
    difficulty: 'easy',
    description: 'The flags are scattered around the Spin Zone.',
    boardIds: ['spin-zone'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 6, y: 5 },
      { number: 2, x: 11, y: 12 },
      { number: 3, x: 2, y: 7 }
    ],
    specialRules: []
  }),
  course({
    id: 'island-hop',
    name: 'Island Hop',
    category: 'beginner',
    manualPage: 14,
    players: allPlayers(2, 8),
    length: 'medium',
    difficulty: 'mid',
    description: 'Choose whether to cross the Island or go around it.',
    boardIds: ['island'],
    flags: [
      { number: 1, x: 7, y: 2 },
      { number: 2, x: 2, y: 7 },
      { number: 3, x: 12, y: 5 }
    ],
    specialRules: []
  }),
  course({
    id: 'chop-shop-challenge',
    name: 'Chop Shop Challenge',
    category: 'beginner',
    manualPage: 15,
    players: allPlayers(2, 4),
    length: 'medium',
    difficulty: 'mid',
    description: 'Great risk, great reward.',
    boardIds: ['chop-shop'],
    flags: [
      { number: 1, x: 5, y: 10 },
      { number: 2, x: 10, y: 12 },
      { number: 3, x: 2, y: 11 },
      { number: 4, x: 12, y: 8 }
    ],
    specialRules: []
  }),
  course({
    id: 'twister',
    name: 'Twister',
    category: 'beginner',
    manualPage: 15,
    players: allPlayers(5, 8),
    length: 'medium',
    difficulty: 'mid',
    description: 'Take a spin through the Spin Zone.',
    boardIds: ['spin-zone'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 3, y: 10 },
      { number: 2, x: 4, y: 3 },
      { number: 3, x: 10, y: 3 },
      { number: 4, x: 9, y: 10 }
    ],
    specialRules: []
  }),
  course({
    id: 'bloodbath-chess',
    name: 'Bloodbath Chess',
    category: 'beginner',
    manualPage: 16,
    players: allPlayers(2, 4),
    length: 'medium',
    difficulty: 'mid',
    description: 'Take no prisoners.',
    boardIds: ['chess'],
    flags: [
      { number: 1, x: 7, y: 6 },
      { number: 2, x: 3, y: 10 },
      { number: 3, x: 9, y: 8 },
      { number: 4, x: 4, y: 5 }
    ],
    specialRules: []
  }),
  course({
    id: 'around-the-world',
    name: 'Around the World',
    category: 'beginner',
    manualPage: 16,
    players: allPlayers(5, 8),
    length: 'long',
    difficulty: 'hard',
    description: 'A long two-board journey around Island and Spin Zone.',
    boardIds: ['island', 'spin-zone'],
    flags: [
      { number: 1, x: 13, y: 3 },
      { number: 2, x: 2, y: 5 },
      { number: 3, x: 23, y: 6 }
    ],
    specialRules: []
  }),
  course({
    id: 'death-trap',
    name: 'Death Trap',
    category: 'beginner',
    manualPage: 17,
    players: allPlayers(2, 4),
    length: 'short',
    difficulty: 'hard',
    description: 'Where you need to be is not necessarily where you want to be.',
    boardIds: ['island'],
    flags: [
      { number: 1, x: 8, y: 8 },
      { number: 2, x: 1, y: 5 },
      { number: 3, x: 7, y: 6 }
    ],
    specialRules: []
  }),
  course({
    id: 'pilgrimage',
    name: 'Pilgrimage',
    category: 'beginner',
    manualPage: 17,
    players: allPlayers(2, 8),
    length: 'long',
    difficulty: 'hard',
    description: 'A rough-and-tumble journey across Cross and Exchange.',
    boardIds: ['cross', 'exchange'],
    flags: [
      { number: 1, x: 9, y: 8 },
      { number: 2, x: 20, y: 3 },
      { number: 3, x: 15, y: 10 }
    ],
    specialRules: []
  })
]);

export const EXPERT_COURSES = Object.freeze([
  course({
    id: 'vault-assault',
    name: 'Vault Assault',
    category: 'expert',
    manualPage: 18,
    players: allPlayers(2, 4),
    length: 'short',
    difficulty: 'expert',
    description: 'In and out of the guarded Vault.',
    boardIds: ['vault'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 7, y: 4 },
      { number: 2, x: 5, y: 12 },
      { number: 3, x: 9, y: 6 }
    ],
    specialRules: []
  }),
  course({
    id: 'whirlwind-tour',
    name: 'Whirlwind Tour',
    category: 'expert',
    manualPage: 18,
    players: allPlayers(5, 8),
    length: 'medium',
    difficulty: 'expert',
    description: 'A tour through Maelstrom.',
    boardIds: ['maelstrom'],
    flags: [
      { number: 1, x: 9, y: 1 },
      { number: 2, x: 4, y: 12 },
      { number: 3, x: 12, y: 7 }
    ],
    specialRules: []
  }),
  course({
    id: 'lost-bearings',
    name: 'Lost Bearings',
    category: 'expert',
    manualPage: 19,
    players: allPlayers(2, 4),
    length: 'medium',
    difficulty: 'expert',
    description: 'Keep your bearings on Cross.',
    boardIds: ['cross'],
    flags: [
      { number: 1, x: 2, y: 3 },
      { number: 2, x: 11, y: 10 },
      { number: 3, x: 3, y: 9 }
    ],
    specialRules: []
  }),
  course({
    id: 'robot-stew',
    name: 'Robot Stew',
    category: 'expert',
    manualPage: 19,
    players: allPlayers(2, 4),
    length: 'medium',
    difficulty: 'expert',
    description: 'Avoid becoming the main course at the Chop Shop.',
    boardIds: ['chop-shop'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 1, y: 5 },
      { number: 2, x: 10, y: 8 },
      { number: 3, x: 3, y: 11 }
    ],
    specialRules: []
  }),
  course({
    id: 'oddest-sea',
    name: 'Oddest Sea',
    category: 'expert',
    manualPage: 20,
    players: allPlayers(5, 8),
    length: 'long',
    difficulty: 'expert',
    description: 'Battle through Maelstrom and Vault.',
    boardIds: ['vault', 'maelstrom'],
    boardPlacements: verticalBoards(['vault', 'maelstrom']),
    flags: [
      { number: 1, x: 9, y: 7 },
      { number: 2, x: 2, y: 5 },
      { number: 3, x: 6, y: 9 },
      { number: 4, x: 10, y: 3 }
    ],
    specialRules: []
  }),
  course({
    id: 'against-the-grain',
    name: 'Against the Grain',
    category: 'expert',
    manualPage: 20,
    players: allPlayers(2, 4),
    length: 'medium',
    difficulty: 'expert',
    description: 'Race with or against the conveyors.',
    boardIds: ['chop-shop', 'chess'],
    boardPlacements: verticalBoards(['chop-shop', 'chess']),
    flags: [
      { number: 1, x: 11, y: 10 },
      { number: 2, x: 4, y: 4 },
      { number: 3, x: 6, y: 18 }
    ],
    specialRules: []
  }),
  course({
    id: 'island-king',
    name: 'Island King',
    category: 'expert',
    manualPage: 21,
    players: allPlayers(5, 8),
    length: 'short',
    difficulty: 'expert',
    description: 'Become King of the Island.',
    boardIds: ['island'],
    flags: [
      { number: 1, x: 6, y: 5 },
      { number: 2, x: 8, y: 8 },
      { number: 3, x: 6, y: 7 }
    ],
    specialRules: []
  }),
  course({
    id: 'tricksy',
    name: 'Tricksy',
    category: 'expert',
    manualPage: 21,
    players: allPlayers(2, 4),
    length: 'long',
    difficulty: 'expert',
    description: 'Draft one of three face-down Options before racing.',
    boardIds: ['cross'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 10, y: 2 },
      { number: 2, x: 1, y: 2 },
      { number: 3, x: 9, y: 12 },
      { number: 4, x: 4, y: 8 }
    ],
    specialRules: [{ kind: 'starting-option-draft', dealt: 3, keep: 1 }]
  }),
  course({
    id: 'moving-targets',
    name: 'Moving Targets',
    category: 'expert',
    manualPage: 22,
    players: allPlayers(2, 8),
    length: 'medium',
    difficulty: 'expert',
    description: 'Flags ride conveyors and reset after falling into pits.',
    boardIds: ['maelstrom'],
    flags: [
      { number: 1, x: 2, y: 1 },
      { number: 2, x: 11, y: 12 },
      { number: 3, x: 12, y: 6 },
      { number: 4, x: 1, y: 7 }
    ],
    specialRules: [{ kind: 'moving-flags' }]
  }),
  course({
    id: 'set-to-kill',
    name: 'Set to Kill',
    category: 'expert',
    manualPage: 22,
    players: allPlayers(5, 8),
    length: 'medium',
    difficulty: 'expert',
    description: 'All damaging robot lasers fire twice.',
    boardIds: ['exchange'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 6, y: 1 },
      { number: 2, x: 3, y: 12 },
      { number: 3, x: 11, y: 10 },
      { number: 4, x: 3, y: 5 }
    ],
    specialRules: [{ kind: 'robot-laser-multiplier', multiplier: 2 }]
  }),
  course({
    id: 'factory-rejects',
    name: 'Factory Rejects',
    category: 'expert',
    manualPage: 23,
    players: allPlayers(5, 8),
    length: 'short',
    difficulty: 'expert',
    description: 'Begin damaged and without power down.',
    boardIds: ['chop-shop'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 8, y: 2 },
      { number: 2, x: 5, y: 12 },
      { number: 3, x: 3, y: 5 }
    ],
    specialRules: [{ kind: 'starting-damage', amount: 2 }, { kind: 'power-down-disabled' }]
  }),
  course({
    id: 'option-world',
    name: 'Option World',
    category: 'expert',
    manualPage: 23,
    players: allPlayers(2, 8),
    length: 'medium',
    difficulty: 'expert',
    description: 'Repair sites and flags award Options instead of repairs.',
    boardIds: ['vault'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 4, y: 6 },
      { number: 2, x: 10, y: 2 },
      { number: 3, x: 6, y: 9 },
      { number: 4, x: 3, y: 1 }
    ],
    specialRules: [{ kind: 'repair-sites-draw-options', single: 1, crossed: 2 }]
  }),
  course({
    id: 'ball-lightning',
    name: 'Ball Lightning',
    category: 'expert',
    manualPage: 24,
    players: allPlayers(2, 8),
    length: 'short',
    difficulty: 'expert',
    description: 'Every player has thirty seconds to program.',
    boardIds: ['spin-zone'],
    flags: [
      { number: 1, x: 8, y: 6 },
      { number: 2, x: 3, y: 3 },
      { number: 3, x: 6, y: 10 },
      { number: 4, x: 11, y: 1 }
    ],
    specialRules: [{ kind: 'programming-limit', seconds: 30 }]
  }),
  course({
    id: 'tight-collar',
    name: 'Tight Collar',
    category: 'expert',
    manualPage: 24,
    players: allPlayers(2, 8),
    length: 'medium',
    difficulty: 'expert',
    description: 'Every player has one minute to program.',
    boardIds: ['chop-shop', 'cross'],
    boardPlacements: [
      placed('docking-bay-a-1', 'docking-bay-a', 1, 1, 3),
      placed('chop-shop-1', 'chop-shop', 5, 1),
      placed('cross-1', 'cross', 17, 1)
    ],
    flags: [
      { number: 1, x: 26, y: 5 },
      { number: 2, x: 9, y: 10 }
    ],
    specialRules: [{ kind: 'programming-limit', seconds: 60 }]
  }),
  course({
    id: 'day-of-the-superbot',
    name: 'Day of the SuperBot',
    category: 'expert',
    manualPage: 25,
    players: allPlayers(5, 8),
    length: 'medium',
    difficulty: 'expert',
    description: 'Destroy the self-repairing SuperBot and steal its powers.',
    boardIds: ['maelstrom'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 9, y: 1 },
      { number: 2, x: 1, y: 6 }
    ],
    specialRules: [{ kind: 'superbot' }]
  }),
  course({
    id: 'interference',
    name: 'Interference',
    category: 'expert',
    manualPage: 26,
    players: allPlayers(2, 4),
    length: 'medium',
    difficulty: 'expert',
    description: 'Each player programs a racer and a separate blocker.',
    boardIds: ['chess'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 6, y: 3 },
      { number: 2, x: 8, y: 9 },
      { number: 3, x: 1, y: 1 }
    ],
    specialRules: [{ kind: 'two-controlled-robots' }]
  }),
  course({
    id: 'flag-fry',
    name: 'Flag Fry',
    category: 'expert',
    manualPage: 26,
    players: allPlayers(2, 8),
    length: 'short',
    difficulty: 'expert',
    description: 'Flags sit in laser fire and every player begins with an Option.',
    boardIds: ['cross'],
    dockingBay: 'b',
    flags: [
      { number: 1, x: 4, y: 4 },
      { number: 2, x: 10, y: 4 },
      { number: 3, x: 4, y: 11 }
    ],
    specialRules: [{ kind: 'starting-options', count: 1 }]
  }),
  course({
    id: 'frenetic-factory',
    name: 'Frenetic Factory',
    category: 'expert',
    manualPage: 27,
    players: allPlayers(5, 8),
    length: 'long',
    difficulty: 'expert',
    description: 'A coin flip can rotate the touched board after a flag.',
    boardIds: ['chess', 'chop-shop', 'cross', 'island'],
    boardPlacements: [
      placed('chess-1', 'chess', 1, 1),
      placed('chop-shop-1', 'chop-shop', 13, 1),
      placed('island-1', 'island', 1, 13),
      placed('cross-1', 'cross', 13, 13),
      placed('docking-bay-a-1', 'docking-bay-a', 13, 25)
    ],
    flags: [
      { number: 1, x: 5, y: 7 },
      { number: 2, x: 17, y: 11 },
      { number: 3, x: 11, y: 20 },
      { number: 4, x: 22, y: 2 }
    ],
    specialRules: [{ kind: 'rotate-board-on-flag', probability: 'coin-heads' }]
  }),
  course({
    id: 'marathon-madness',
    name: 'Marathon Madness',
    category: 'expert',
    manualPage: 28,
    players: allPlayers(5, 8),
    length: 'long',
    difficulty: 'expert',
    description: 'A four-board marathon with a starting Option.',
    boardIds: ['exchange', 'maelstrom', 'spin-zone', 'vault'],
    boardPlacements: [
      placed('spin-zone-1', 'spin-zone', 1, 13),
      placed('vault-1', 'vault', 13, 1),
      placed('exchange-1', 'exchange', 13, 13),
      placed('maelstrom-1', 'maelstrom', 13, 25),
      placed('docking-bay-a-1', 'docking-bay-a', 25, 13, 1)
    ],
    flags: [
      { number: 1, x: 24, y: 31 },
      { number: 2, x: 16, y: 7 },
      { number: 3, x: 10, y: 22 },
      { number: 4, x: 24, y: 18 }
    ],
    specialRules: [{ kind: 'starting-options', count: 1 }]
  })
]);

export const TEAM_COURSES = Object.freeze([
  course({
    id: 'tandem-carnage',
    name: 'Tandem Carnage',
    category: 'team',
    manualPage: 29,
    players: evenTeams,
    length: 'medium',
    difficulty: 'team',
    description: 'Either teammate can advance the shared ordered flag sequence.',
    boardIds: ['maelstrom', 'exchange'],
    boardPlacements: verticalBoards(['maelstrom', 'exchange']),
    flags: [
      { number: 1, x: 3, y: 15 },
      { number: 2, x: 4, y: 1 },
      { number: 3, x: 12, y: 11 },
      { number: 4, x: 10, y: 22 }
    ],
    specialRules: [{ kind: 'team-shared-flag-progress' }]
  }),
  course({
    id: 'all-for-one-or-one-for-all',
    name: 'All for One or One for All?',
    category: 'team',
    manualPage: 30,
    players: evenTeams,
    length: 'long',
    difficulty: 'team',
    description: 'A team wins when any one of its robots completes the flags.',
    boardIds: ['vault', 'spin-zone'],
    dockingBay: 'b',
    boardPlacements: verticalBoards(['vault', 'spin-zone'], 'b'),
    flags: [
      { number: 1, x: 7, y: 19 },
      { number: 2, x: 9, y: 6 },
      { number: 3, x: 3, y: 2 },
      { number: 4, x: 10, y: 22 }
    ],
    specialRules: [{ kind: 'team-individual-racer' }]
  }),
  course({
    id: 'capture-the-flag',
    name: 'Capture the Flag',
    category: 'team',
    manualPage: 31,
    players: evenTeams,
    length: 'medium',
    difficulty: 'team',
    description: 'Carry the opposing flag back onto the team home board.',
    boardIds: ['chop-shop', 'vault'],
    boardPlacements: [
      placed('chop-shop-1', 'chop-shop', 1, 1),
      placed('vault-1', 'vault', 13, 1)
    ],
    flags: [
      { number: 1, x: 3, y: 11 },
      { number: 2, x: 21, y: 2 }
    ],
    specialRules: [{ kind: 'capture-the-flag' }]
  }),
  course({
    id: 'toggle-boggle',
    name: 'Toggle Boggle',
    category: 'team',
    manualPage: 32,
    players: evenTeams,
    length: 'medium',
    difficulty: 'team',
    description: 'Control all three flags simultaneously.',
    boardIds: ['exchange'],
    flags: [
      { number: 1, x: 6, y: 6 },
      { number: 2, x: 10, y: 3 },
      { number: 3, x: 10, y: 10 }
    ],
    specialRules: [{ kind: 'toggle-flag-control' }]
  }),
  course({
    id: 'war-zone',
    name: 'War Zone',
    category: 'team',
    manualPage: 32,
    players: evenTeams,
    length: 'medium',
    difficulty: 'team',
    description: 'Eliminate the opposing team; there are no flags.',
    boardIds: ['island'],
    dockingBay: 'b',
    flags: [],
    specialRules: [{ kind: 'team-elimination' }, { kind: 'starting-options', count: 1 }]
  })
]);

export const PUBLISHED_COURSES = Object.freeze([
  ...BEGINNER_COURSES,
  ...EXPERT_COURSES,
  ...TEAM_COURSES
]);

export const PUBLISHED_COURSES_BY_ID = new Map(
  PUBLISHED_COURSES.map((publishedCourse) => [publishedCourse.id, publishedCourse])
);

// Emulator-only compatibility course used by the rules-focused legacy E2E
// fixtures while the production Risky Exchange course uses Docking Bay B.
const riskyExchangeDockA = PUBLISHED_COURSES_BY_ID.get('risky-exchange');
if (riskyExchangeDockA) {
  PUBLISHED_COURSES_BY_ID.set('risky-exchange-a', {
    ...riskyExchangeDockA,
    id: 'risky-exchange-a',
    boardPlacements: riskyExchangeDockA.boardPlacements.map((placement) =>
      placement.boardId === 'docking-bay-b'
        ? { ...placement, boardId: 'docking-bay-a', instanceId: 'docking-bay-a-1' }
        : placement
    )
  });
}
