import type { CourseSpecialRule } from './game/course-catalog';

/** Short player-facing reminders for the published course variants. */
export function courseRuleText(rule: CourseSpecialRule): string {
  switch (rule.kind) {
    case 'starting-option-draft': return `Choose ${rule.keep} of ${rule.dealt} Options before the race.`;
    case 'moving-flags': return 'Flags move during the race.';
    case 'robot-laser-multiplier': return `Robot lasers deal ${rule.multiplier} times their usual damage.`;
    case 'starting-damage': return `Start with ${rule.amount} damage.`;
    case 'power-down-disabled': return 'Power down is unavailable.';
    case 'repair-sites-draw-options': return 'Repair sites award extra Options.';
    case 'programming-limit': return `You have ${rule.seconds} seconds to program each turn.`;
    case 'starting-options': return `Start with ${rule.count} Option.`;
    case 'superbot': return 'Destroy the SuperBot to steal its powers.';
    case 'two-controlled-robots': return 'Each player controls two robots.';
    case 'rotate-board-on-flag': return 'Touch a flag and flip a coin: heads rotates the board.';
    case 'team-shared-flag-progress': return 'Teammates share flag progress.';
    case 'team-individual-racer': return 'Help your team’s racer reach the flags.';
    case 'capture-the-flag': return 'Capture the opposing team’s flag.';
    case 'toggle-flag-control': return 'Touch flags to take control of them for your team.';
    case 'team-elimination': return 'Eliminate the opposing team.';
  }
}
