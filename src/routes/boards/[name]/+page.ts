import { error } from '@sveltejs/kit';
import { ALL_BOARD_FACES, BOARD_FACES_BY_ID } from '$lib/game/board-catalog';
import type { PageLoad } from './$types';

export const prerender = true;

export function entries() {
  return ALL_BOARD_FACES.map(({ id }) => ({ name: id }));
}

export const load: PageLoad = ({ params }) => {
  const boardId = params.name.endsWith('.html')
    ? params.name.slice(0, -'.html'.length)
    : params.name;
  if (!BOARD_FACES_BY_ID.has(boardId)) {
    error(404, 'Unknown Robo Rally board face');
  }
  return { boardId };
};
