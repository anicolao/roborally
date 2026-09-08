# Generated board tiles

These raster assets form the first graphical Robo Rally board skin. They were
created with OpenAI image generation in one cohesive, orthographic industrial
factory style, then reduced to 256 × 256 for the web. Source sheets were
generated inside a flat green surround so complete square tiles could be
extracted without accidental cropping. Walls, lasers, gears, pits, and docks
remain transparent overlays; the Maelstrom-derived floor, conveyors, pushers,
and repair sites are full-square tiles.

The shared prompt contract was: a square, strict top-down orthographic,
high-end painted board-game tile on a quiet, full-bleed dark gunmetal floor.
Every game feature uses one thick, high-contrast silhouette that occupies
roughly 75–90% of the tile and remains recognizable at 32 pixels. The prompts
explicitly prohibit unnecessary inset panels, thin information marks, and
decorative micro-detail, as well as logos, watermarks, perspective, people, and
robots. Each derivative asked for exactly
one floor, pit, repair site, Option repair site, gear, conveyor, pusher, laser,
docking pad, or wall. Directional art is authored facing north and rotated by
the renderer. Odd- and even-register pushers have separate assets with their
activation registers printed directly on the machinery. Clockwise and
counterclockwise gears have separate warm/cool assets. Laser strengths 1, 2,
and 3 likewise have separate source and beam assets, distinguished by both
color and width. Left-turn conveyor art is the only directional feature
mirrored by the renderer.

The floor, regular and Option repair sites, odd/even pushers, and regular and
express conveyors use the 2005 Maelstrom board as their geometry and visual
information reference. Each source reference was cropped on the board's exact
150-pixel grid before image generation. Connected conveyor pairs were generated
as one source strip and only then divided into square assets so their edges
remain aligned.

The wall overlay is the exact bottom 42-pixel rail from `pusher-odd.webp`,
rotated 180 degrees and placed along the north edge for the renderer's rotation
convention. `wall-corner.png` joins north and west copies of that same rail with
a 42-pixel diagonal miter, keeping its frame, caution stripe, and thickness
continuous through joined corners.

The docking pad was regenerated as a compact central octagon and stored as a
transparent overlay with all generated pixels restricted to the central 172 ×
172 area. The renderer's accepted floor therefore shows unchanged through the
outer 42 pixels on every side, leaving every possible wall placement
unobstructed. Dock numbers remain live renderer text rather than generated
artwork.

Board manifests record each conveyor's incoming travel directions separately
from its rules-facing rotation. The renderer layers the shared straight and
curved assets for merge squares, preserving continuous belt edges without a
special one-off merge image.

The images are application assets and are licensed with this GPL-3.0-only
repository.
