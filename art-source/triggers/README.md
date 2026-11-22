# Trigger character source art

Generated with the built-in OpenAI image generation tool on 2026-11-15 and
2026-11-18, using
`apps/client/public/assets/cats/previews/idle_lineup.png` as a style reference.
The generated source PNGs retain transparency and are normalized by
`tools/process-trigger-art.py` into deterministic 64×64, 24-color RGBA sprites.

## Source mapping

- `dog-source.png` → `apps/client/public/assets/triggers/dog.png`
- `cat-mom-source.png` → `apps/client/public/assets/triggers/cat-mom.png`
- `stranger-source.png` → `apps/client/public/assets/triggers/stranger.png`
- `vacuum-mom-source.png` → `apps/client/public/assets/triggers/vacuum-mom.png`

## Prompt set

The first three prompts requested a single full-body, left-facing character with a
genuinely transparent background, generous padding, hard pixel edges, no
antialiasing, no text/UI/scenery/watermark, and readability after reduction to
64×64. The dog prompt specified a compact scruffy neighborhood dog; the mother
cat prompt specified a larger tawny protective cat with a familiar collar bell;
the stranger prompt specified a cautious, non-threatening person in a worn coat.

The fake-mom prompt used the existing Cat Mom and dog art as style references.
It requested a low round robot vacuum disguised under an orange-tabby Cat Mom
blanket, with sewn ears, a fake tail and bell, while leaving the wheels, side
brush and power light visible enough to reveal the trick at 64×64.

Run `python tools/process-trigger-art.py` after replacing a source PNG, followed
by `npm run validate:assets`.
