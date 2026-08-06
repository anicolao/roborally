export const OPTION_CARD_PRESENTATIONS = [
  {
    id: 'large',
    label: 'Large',
    width: 720,
    height: 480,
    use: 'Focused inspection',
    layout: 'standard'
  },
  {
    id: 'medium',
    label: 'Medium',
    width: 480,
    height: 320,
    use: 'Ordinary game UI',
    layout: 'standard'
  },
  {
    id: 'small',
    label: 'Small',
    width: 320,
    height: 213,
    use: 'Dense tabletop UI',
    layout: 'compact-copy'
  }
] as const;

export type OptionCardSize = (typeof OPTION_CARD_PRESENTATIONS)[number]['id'];

export function optionCardPresentation(size: OptionCardSize) {
  return OPTION_CARD_PRESENTATIONS.find(({ id }) => id === size) ?? OPTION_CARD_PRESENTATIONS[1];
}
