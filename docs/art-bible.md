# Art bible — phase 1 review notes

The source of truth is section 6 of `Qiqihar_MVP_Implementation_Plan.md`.

## Native-scale checklist

- 64×64 transparent PNGs, crisp edges, no antialiasing or gradients
- Shared three-quarter-front camera and stable foot pivot
- Recognizable in monochrome silhouette
- 01: two-kink upright lightning tail
- 02: very wide front-paw stance with visible toes
- 03: narrow judgmental eyes, forehead M and one tilted ear
- 04: huge dark open mouth, tiny fangs and forward lean
- Limited warm grey/brown/cream/ginger palette
- No costumes, collars, props or franchise references

## Gate status

Passed for the first playable prototype on 2026-11-14:

- Lightning Tail remains identifiable by the two-kink tail at 64×64.
- Ground Gripper remains identifiable by the low, extra-wide paw stance.
- Judgmental Eyes remains identifiable by the asymmetric ears and narrow eyes.
- Big Hiss remains identifiable by its enormous mouth in the hiss pose.
- All eight key poses are true 64×64 RGBA PNGs with crisp binary transparency.

These are coherent first-pass generated assets, not final hand-painted production art. Preserve the silhouettes while refining anatomy and animation registration. Full animation-strip production can proceed, but should keep the same foot pivot and be reviewed in small batches.

## Generation and normalization

- Generated with the built-in image generation tool using the implementation plan's character descriptions, one prompt per pose.
- Prompts specified original handcrafted pixel art, three-quarter front view, transparent background, no props or franchise references, and each kitten's signature silhouette.
- `tools/process-generated-art.py` removes faint generated glow, applies binary alpha, limits the palette, uses nearest-neighbor scaling, and anchors feet at `(32, 61)`.
- `npm run validate:assets` decodes each PNG and verifies type, dimensions, real transparency, filenames and metadata.

