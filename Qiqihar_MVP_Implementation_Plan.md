# 齐齐哈尔 (Hiss Together!) — MVP Implementation Plan

> **Codex handoff document** · Version 1.0 · 2026-11-14  
> **Genre:** 4-player online cooperative comedy / pixel-art party game  
> **Target:** Desktop-first web browser, with responsive mobile viewing as a stretch goal  
> **Design mantra:** *Four tiny kittens are trying their hardest to look scary. Why is hissing together so difficult?*

## 0. Mission and non-negotiable experience

Build a complete, playable, small-scope multiplayer prototype inspired by a video of four tiny stray kittens hissing together. Four human players (or human + bot substitutes) control four distinctive kittens in a shared scene. Each player triggers a hiss, and the group wins when the **active hiss windows of all four kittens overlap by at least 300 ms**. Failure should be short, understandable, and funny; immediate retry is central to the experience.

The result should feel like a charming, chaotic comedy with readable animations, not a competitive timing test or a deep progression game.

**Reference:** https://www.bilibili.com/video/BV16aaW6nEzc/  
**Art direction:** Refer to the user-provided annotated screenshot. Key observations: one kitten has a strikingly kinked, lightning-bolt-like upright tail; one braces with widely splayed front paws; another has a sharp yet adorable stare; one opens its mouth very widely to hiss. The original video is **visual inspiration only**: draw original pixel assets, do not trace or redistribute video frames, and do not use existing franchise branding or characters.

### Success criteria for the MVP

- A player can join from a link, be assigned a kitten, and understand **Space = hiss** within 5 seconds.
- Four players can start and finish rounds in a shared room; real-time hiss state is consistent across clients.
- A genuine synchronized overlap causes the same authoritative win result for all clients.
- Near-misses and three-out-of-four attempts display distinct, funny failure reactions within ~1 second.
- Players can retry without reloading or requiring a four-person ready-up after every failed attempt.
- At least four kittens remain recognizable by **silhouette, expression, and markings**, not just color.
- The experience is fun with 1–3 people locally testing through bot stand-ins, even before four real players are available.
- Desktop Chrome/Edge works; no account, payment, chat, or installation required.

## 1. Game design overview

### Core loop

1. **Lobby / matching:** Join a four-slot room. Give each player a different kitten; fill empty slots with clearly labeled bots after a short wait or in developer/test mode.
2. **Meet & emote (10–15 seconds):** Cats can move left/right, meow, and do small visual interactions while the game displays “Four cats. One hiss.”
3. **Attempt (5–10 seconds):** Players press Space to trigger their kitten's fixed-timing hiss animation. Show readable anticipation, hiss, recovery, and unobtrusive timing hints.
4. **Outcome (0.7–1.5 seconds):** Either spectacular “齐齐哈尔!” success or a contextual failure gag. Do not show a generic red “FAILED” screen.
5. **Quick retry:** Return automatically to the next attempt with a short safe pause. Preserve room membership and cat identities.
6. **Round ending:** Win ends immediately. Otherwise a room challenge lasts up to about 3 minutes, then ends with “齐齐哈不了 · 但我们尽力了” and a four-cat souvenir screen. Players can replay together.

**Timing:** These durations are starting parameters; keep all values centralized and tune through playtests. Never prolong rounds by silently lowering win probability.

### Player controls

| Input | Action | Effect on success |
| --- | --- | --- |
| `Space` | Hiss | **Only required gameplay input**; participates in synchronization |
| `A` / `D` or arrow keys | Walk left/right | Visual positioning; cannot block other players |
| `E` | Meow | Audio/emoji/social cue; no sync effect |
| `F` | Interact near another kitten | Tiny slap, nose boop, cuddle; no sync effect |
| `R` | Replay / rejoin after results | Room-level continuation; optional |

No text chat, voice chat, inventory, upgrades, timers to grind, or paywalls in MVP. Consider tap controls later if mobile is supported.

## 2. Hiss timing — authoritative rule

Use **fixed animations and server-side authoritative timestamps**. Avoid ambiguous “everyone pressed within 0.5 seconds” messaging.

### Per-cat state machine

```text
IDLE -> ANTICIPATE (0.2 s) -> HISSING (0.7 s) -> RECOVER (0.3 s) -> IDLE
```

- On an accepted hiss action at time `t`, the active hiss interval is `[t + 0.2, t + 0.9]` seconds (server time).
- For four intervals, common overlap is:

```ts
const overlapMs = Math.max(
  0,
  Math.min(...hissIntervals.map(i => i.endMs)) -
  Math.max(...hissIntervals.map(i => i.startMs))
);
const success = overlapMs >= 300;
```

- Only count the **most recent valid hiss for each kitten within the same attempt**. Do not allow one player to spam several overlapping hiss states.
- Cooldown / recovery prevents accidental multi-triggering. Ignore auto-repeat (`keydown.repeat`) and duplicate action sequence IDs.
- Evaluate on the server when the fourth kitten's candidate active interval is known, or when an attempt expires. Send a single outcome event with timing details for all clients.
- Provide a forgiving, transparent network policy. Start with **server receipt timestamps** and an explicit test/latency overlay. Later, add bounded clock-offset estimation or input timestamp compensation if measured latency demands it; never trust arbitrary client timestamps without validation.
- Distinguish **rendering latency compensation** from **win-rule changes**. All clients must agree on the same authoritative result.
- The 300 ms overlap and duration values are **tunable hypotheses**, not finalized balance.

### Feedback and fairness

- A successful group hiss triggers an immediate large shared animation, sound effect, screen shake, and text **“齐齐哈尔！！”**.
- If overlap is insufficient, display a short diagnostic: **“Too early”**, **“Too late”**, **“3/4 cats”**, or **“All out of sync”**. Prefer whimsical captions in Chinese; offer English localization as stretch.
- Do not punish players with network lag based on misleading local animations. Log round-trip times in dev builds and replay authoritative event timelines in tests.
- Once all players are synced, random cosmetics may amplify the visual result but cannot cancel the win.

## 3. Comedy system: random chaos that stays fair

**Rule:** Randomness should create a story, not invalidate a correct input. Start with one gameplay-relevant telegraphed event; others should be visual-only.

| Event | Telegraphed? | Mechanics | MVP? |
| --- | --- | --- | --- |
| **Achoo!** kitten's nose tickles | Yes, clearly ~1–2 s ahead | Briefly blocks starting a hiss *before* an attempt window; never cancels an active valid hiss | **Yes**, one event |
| Grooming distraction | Not needed | Cosmetic idle, instantly interruptible | Later |
| Oversized puffball | Not needed | Fur explodes into round spikes on hiss | Optional, success VFX |
| Tangled tails | Yes | Briefly alters walking only, never the Space action | Later |
| Butterfly passing | Yes | Cats turn their heads; visual-only | Later |
| Off-key meow | Not needed | Random harmless audio variation | Later |
| Suspicious fart cloud | Not needed | Green puff and adjacent cats recoil; visual-only | Later |
| Chain scare | Yes | Hiss causes neighboring cats to flinch; cosmetic only | Later |

**Spawn guardrails:** No forced animation/state change during a decisive active hiss overlap. No events in the last 30 seconds of the room timer. Limit event frequency to avoid noise. Use deterministic seeded event selection on the server so every player sees the same story. Implement a debug force-event switch.

## 4. Failure is the main comedy engine

Resolve failures quickly (target gag 0.7–1.5 sec). Use **actual server events** to choose a gag, not random blame.

| Condition | Animation / scene | Caption idea |
| --- | --- | --- |
| **Three out of four** | Three kittens simultaneously slowly turn toward the one who missed; fourth nervously sweats | “说好的齐齐哈尔呢？” |
| **Too early** | One kitten's mouth opens and closes before others start; a tiny weak puff escapes | “你这只猫活在未来。” |
| **Too late** | Fourth kitten starts just after everyone has relaxed | “你是不是走路来的？” |
| **Sequential chorus** | Hisses cascade one after another, like a terrible symphony | “这是哈尔交响乐。” |
| **Near-perfect miss** | Four kittens freeze; crow caws; tiny crack in collective confidence | “差一点就成为传说。” |
| **No one hissed** | Awkward silence; one kitten looks around | “……喵？” |

- Avoid public shaming/labeling a player as the “loser.” The joke comes from timing and reactions, not harassment.
- Optional emoji reactions: `😾`, `😹`, `🥺`, `💪` after failure, displayed over each cat; one selection per player per attempt. This is **post-MVP** unless trivial.
- A small “best overlap” number or bar can make close attempts exciting, without requiring players to study a technical chart.

## 5. Social interaction and tiny expressive moments

- **Walk:** Cats can shuffle and gently bump into one another, but movement does not affect synchronized-hiss validity.
- **Meow:** Tap E for a one-shot meow bubble; cooldown prevents spam.
- **Boop:** If two cats are close and one presses F, show a soft paw boop or confused question mark.
- **Mutual interaction (stretch):** If two cats press F together within a short window, they touch noses, cuddle, or do a tiny high-five.
- **Group reactions:** Three cats looking at the fourth is the highest-priority MVP interaction animation.
- Do not implement a system that lets a troll stun or lock another player out of a hiss. If an animation needs to play, its visible effect should not stop accepted input.

## 6. Art bible — four original baby street kittens

### Core aesthetic

- Small, **slightly scruffy street kittens**, *not* fancy domestic cats or polished plush mascots.
- Cute but fierce: trying intensely to look terrifying while being obviously tiny.
- Big triangular ears, larger-than-adult-kitten heads, thin legs, large alert eyes, subtly arched spines, small whiskers, tiny fangs, splayed front paws.
- Slightly awkward defensive posture; exaggerated body language with believable kitten anatomy.
- Warm muted brown, grey, cream, ginger; subtle tabby stripes and forehead M-patterns.
- Cohesive silhouettes and pixel density, but **individual posture and markings**.
- **No costumes, hats, bows, collars, weapons, or franchise references.**
- Preserve inspiration from the annotated reference: bent tail, spread claws, intense stare, dramatically open mouth.

### Four characters

| ID | Name / Chinese | Defining silhouette & markings | Personality | Signature animations |
| --- | --- | --- | --- | --- |
| 01 | **Lightning Tail / 闪电尾** | Grey-brown tabby; tall upright tail with **two sharp kinks**, like zigzag lightning; tall ears, bright eyes | Impulsive, self-appointed leader | Tail twitches idle; snaps upright during hiss; vibrates on success |
| 02 | **Ground Gripper / 扒地猫** | Warm-brown tabby; **front paws widely spread with visible little toes**; low chest, strong planted stance, ears tilted outward | Scared but determined | Scrapes front paws; crouches to prepare; slips backward after an overenthusiastic hiss |
| 03 | **Judgmental Eyes / 犀利眼** | Grey tabby, creamy muzzle; narrower slightly slanted eyes, dark M forehead stripes, one tilted ear | Deadpan observer, side-eye specialist | Scans left/right; deliberate slow head-turn toward missed teammate |
| 04 | **Big Hiss / 大嘴哈** | Light ginger-brown tabby, cream chest; forward lean, big ears and **huge open hissing mouth**, tiny teeth | Loud, dramatic, earnest | Opens mouth enormously; fur fluffs up; nearly falls back after hiss |

**Silhouette check:** Export each cat as a monochrome silhouette at game scale. If the four are not distinguishable at normal zoom, revise poses **before** rendering more frames. Characters should not differ only by fur tint.

### Pixel constraints and camera

- **Logical game resolution:** `320 × 180` px; integer nearest-neighbor upscale to fit browser canvas.
- **Sprite frame canvas:** `64 × 64` px per character per animation frame (transparent PNG). Characters can occupy ~48–58 px in height within a stable baseline; tails and ears must not crop. If a long kinked tail needs extra space, use consistent padding rather than scaling the character down unpredictably.
- **View:** three-quarter front, slightly low angle; face, spread front paws, arched back and distinctive tails all readable.
- Crisp pixel clusters, limited per-cat palette, no gradients, blur, vector-smooth strokes, anti-aliasing, or fractional sprite scaling.
- Same foot baseline and same camera view across all characters; register anchor / pivot for the feet; no frame jitter.
- Background: simple, cozy but slightly grubby alley or cardboard-box corner; never visually overpower the cats.
- Capture kitten eye expression at game scale: readable highlights, eyelid angles, fang shapes, and open-mouth dark interior.

### Suggested palette

Keep palettes consistent rather than rigidly matching these sample colors:

- Deep outline / eyes: `#312C2A`
- Warm brown fur: `#A87854`, highlight `#D3A77A`
- Grey tabby fur: `#78818A`, highlight `#ABB3B5`
- Cream muzzle/chest: `#E8D9BB`
- Inner ears / nose: `#D98F91`
- Mouth interior: `#612C39`
- Alley floor: `#B9AD9A`

Use 3–5 major shades per material where practical; ensure fur stripes don't become distracting noise.

### Animation list

Plan these states, but **implement in stages**:

| Animation | Frames (target) | MVP scope | Notes |
| --- | ---: | --- | --- |
| `idle` | 4 | Yes | Breath/blink/tail twitch; not excessive |
| `anticipate` | 3 | Yes | Crouch, ears tilt, spine tightens |
| `hiss` | 5 | Yes | Open mouth, fangs, spread paws, arch back |
| `recover` | 3 | Yes | Settle fur and close mouth |
| `side_eye` | 3 | Yes (at least for failure) | Three-to-one look; character 03 extra expressive |
| `surprised` | 3 | Nice to have | Jump / yelp, used by sneeze |
| `happy` | 4 | Nice to have | Celebrate synchronized win |
| `embarrassed` | 3 | Nice to have | Sweat / awkward paw lick |

Animation time is controlled by the state machine, **not** by number of frames; hold/extending frames is fine. Use a **small smoke test first**: eight key poses total (four idle and four hiss) before producing all frames and reactions.

### Asset naming and directories

```text
public/assets/
  cats/
    kitten_01_lightning_tail/
      idle.png
      hiss.png
      anticipate.png
      recover.png
      side_eye.png
      metadata.json
    kitten_02_ground_gripper/...
    kitten_03_judgmental_eyes/...
    kitten_04_big_hiss/...
  fx/
    hiss_puff.png
    sweat_drop.png
    question_mark.png
  backgrounds/
    alley.png
  audio/
    meow_01.ogg
    hiss_01.ogg
    win.ogg
    fail.ogg
```

**Sprite sheet convention:** each PNG is a horizontal strip of `N` tiles, each exactly `64×64`; `metadata.json` stores `frameWidth`, `frameHeight`, `frames`, `fps`, `loop`, `pivot`. Include an asset validator that checks true PNG type, dimensions, transparency, sheet divisibility, and filename completeness.

**If image-generation tools are unavailable in Codex:** programmatically create **original, recognizable pixel-art sprites** via a pixel grid, PIL/Pillow, SVG rasterization with nearest-neighbor, or scripted pixel shapes. Do not misrepresent generated placeholders as polished hand art. Prefer working, coherent first-pass assets and document a hand-painting / external asset upgrade path. Do not scrape or trace the video or use Pokémon assets for Lightning Tail.

## 7. Ready-to-use art generation prompt for Codex

> Copy this section to the art-generation step, together with the annotated screenshot as a **visual reference**. The desired outputs are assets, not only text descriptions.

```text
Create original high-quality handcrafted-style 2D pixel art of four distinct, slightly scruffy stray baby kittens for a web party game called 齐齐哈尔 (Hiss Together!). The mood is cute-but-fierce: tiny kittens are desperately trying to look intimidating while hissing in perfect unison, so their expressions feel earnest, defensive, and accidentally funny.

Visual design: believable juvenile kitten anatomy simplified into readable 64x64-pixel sprites; larger heads and triangular ears, thin legs, clear splayed front paws, slightly arched backs, upright tails, tabby stripes, forehead M markings, whiskers, sharp-but-cute eyes, dark open hissing mouths, tiny fangs. Three-quarter front view with feet on the same baseline and consistent sprite scale. A slightly scruffy alley-kitten feeling, NOT plush mascots, perfectly round kawaii cats, or fantasy warriors. Restrained brown, grey, cream, ginger palette with warm shadows. Crisp intentional pixel clusters, no gradients, no antialiasing, no blur, no clothing, no accessories, no smooth vector edges, transparent background.

The four specific kittens:
1. Lightning Tail (闪电尾): grey-brown tabby, distinctive thin upright tail with two angular zigzag kinks, energetic vigilant eyes. Tail twitches in idle and jolts when hissing.
2. Ground Gripper (扒地猫): warm brown tabby, low defensive posture, extra-wide splayed front paws gripping the floor, ears angled outward, nervous yet determined.
3. Judgmental Eyes (犀利眼): grey tabby with creamy muzzle, dark M marking, slightly narrower slanted eyes and one tilted ear; subtle deadpan side-eye attitude.
4. Big Hiss (大嘴哈): light ginger-brown tabby with creamy chest, wide open hissing mouth with two tiny fangs, big eyes, fierce forward lean, exaggerated puffed fur.

They must look like a coherent litter but each must read differently in silhouette, posture, face and markings. Keep realistic kitten proportions stylized for comedy. Their signature features must remain visible at native 64x64 scale.

FIRST deliver only: (a) lineup of four idle kittens on transparent background, (b) lineup of four hissing kittens on transparent background, (c) eight individual transparent 64x64 PNG key poses (idle and hiss for each cat), and (d) a concise palette and consistency checklist. Verify all assets are usable in a game engine. DO NOT generate every animation yet. After visual approval, generate horizontal sprite sheets at 64x64 per frame for idle (4), anticipate (3), hiss (5), recover (3), side_eye (3); then optionally surprised, happy, embarrassed.

Use actual PNG assets. If you cannot call a dedicated image-generation model, create original assets with code and report the limitation honestly; avoid mere text prompts or empty placeholder images. Pixel alignment, frame consistency, recognizable anatomy and distinctive features take priority over detail.
```

## 8. Technical architecture

### Recommended stack

- **Client:** TypeScript, Vite, **Phaser 3** (pixelArt / nearest-neighbor settings), HTML overlay for room/controls/results.
- **Server:** Node.js + TypeScript + `ws` WebSocket library; authoritative game state and event broadcasting.
- **Shared types:** TypeScript package or folder for message schemas, timing constants, entity IDs, and pure synchronization logic.
- **Tests:** Vitest for logic, Playwright browser smoke tests where practical.
- **Deployment:** Static client hosting plus always-on WebSocket server with HTTPS/WSS; keep local `npm run dev` workflow easy. Avoid dependence on paid infrastructure during prototype.

Use an explicit client/server split so four browsers connect to the same authoritative room. Code should be simple and legible; avoid adding databases, matchmaking services, user accounts, frameworks, and complex physics before needed.

### Suggested repository layout

```text
qiqihar/
  README.md
  package.json
  apps/
    client/
      index.html
      src/
        main.ts
        game/BootScene.ts
        game/LobbyScene.ts
        game/PlayScene.ts
        game/ResultScene.ts
        game/catSprite.ts
        network/socketClient.ts
        ui/
      public/assets/...
    server/
      src/index.ts
      src/roomManager.ts
      src/gameRoom.ts
      src/syncJudge.ts
      src/events.ts
  packages/
    shared/
      src/protocol.ts
      src/constants.ts
      src/types.ts
  tests/
    syncJudge.test.ts
    protocol.test.ts
    multiplayer.test.ts
  tools/
    generate-cat-art.ts  # or Python; only if needed
    validate-assets.ts
  docs/
    art-bible.md
    playtest-checklist.md
```

### Suggested room/game lifecycle

```text
ROOM_WAITING -> ROOM_INTRO -> ROOM_PLAYING -> ROOM_SUCCESS or ROOM_TIMEOUT
                                  ^    |
                                  |    v
                               ATTEMPT_FEEDBACK
                                  |
                                  +--> next ATTEMPT
```

- Four numbered cat slots; each player receives a randomly available slot, consistent for the room lifetime.
- Lobby should have visible room link / invite code and a **Quick Start With Bots** development button.
- Add a simple public match queue (first four compatible waiting players) if achievable in MVP; initially support room URLs reliably. Never make testing dependent on finding four strangers online.
- Bots should be labeled as bots. Give them imperfect, seed-based timing rather than making them always succeed. Make one deterministic bot-test mode for automated synchronization tests.
- Disconnect policy: show a reconnect indicator; reserve a disconnected human's slot for a short grace period, then optionally replace with bot only between attempts. If a player returns, hand control back safely between attempts.
- Each client sends at most lightweight action events; broadcast transforms and state changes. Do not sync individual art frames over the network.
- Validate room ID, player slot ownership, action type, duplicate sequence number, input rate limits, and allowable states.

### Minimal protocol examples

```ts
type ClientMessage =
  | { type: 'join'; roomId?: string; nickname?: string }
  | { type: 'action'; seq: number; action: 'hiss' | 'meow' | 'interact' }
  | { type: 'move'; seq: number; direction: -1 | 0 | 1 }
  | { type: 'replay' };

type ServerMessage =
  | { type: 'joined'; roomId: string; playerId: string; slot: number }
  | { type: 'room_state'; state: RoomSnapshot }
  | { type: 'hiss_started'; slot: number; serverTimeMs: number; attemptId: number }
  | { type: 'attempt_result'; attemptId: number; success: boolean; overlapMs: number; gag: string; events: AttemptEvent[] }
  | { type: 'chaos_event'; eventId: string; kind: string; startMs: number; affectedSlots: number[] }
  | { type: 'room_result'; result: 'win' | 'timeout'; attempts: number; bestOverlapMs: number };
```

Use runtime schema validation on untrusted WebSocket messages. Treat `nickname` as optional decoration; provide no editable chat in MVP.

## 9. UI / UX wireframe

```text
+---------------------------------------------------------+
| 齐齐哈尔!             Room: ABCD    Time 01:42         |
|                                                         |
|                  [cardboard box / alley]                |
|                                                         |
|            /_\       /\_/\       /\_/\              |
|          [cat 1]   [cat 2]   [cat 3]   [cat 4]          |
|           P1        P2       BOT        P4               |
|                                                         |
|         「三缺一！大家都在看谁？」                        |
|                                                         |
| [ A/D Move ]  [ SPACE: HISS! ] [ E Meow ] [ F Boop ]    |
|                Attempts: 4   Best: 0.21 s               |
+---------------------------------------------------------+
```

(ASCII cat line is only a layout placeholder, **not art**.)

- Keep cats large enough to read their faces (zoom by integer scales).
- Reserve lower HUD for concise controls and attempt feedback; keep most of the screen free of floating UI.
- Show slot labels or small 1–4 badges above cats, including “YOU” indicator.
- Limit camera shake; allow reduced-motion and audio mute toggles.
- UI copy in **Simplified Chinese** first; localization strings organized for future English.
- Use CSS / UI for text, Phaser for sprites and animation. Ensure fonts contain Chinese glyphs.
- Accessibility: support keyboard and mouse focus, readable contrast, no information conveyed only by color, subtitles for cues.

## 10. Sound and effects

- Short, distinct kitten hiss with variation but no loud unpleasant peaks.
- Meow SFX for E, small sneeze cue for the telegraphed event.
- On near miss: tiny silence and comedic chirp/crow sound; avoid spamming audio every frame.
- On synchronized victory: a four-layer collective “HAAAA!”, fluffy burst, small screen shake, confetti, caption “齐齐哈尔！！”.
- All audio must be licensed for use or created originally; provide a mute toggle, default reasonable volume.

## 11. Results and lightweight retention

MVP results screen:

- Win: **“齐齐哈尔 · 第 N 次尝试成功”**; four cats proudly puffed up.
- Timeout: **“齐齐哈不了 · 但我们尽力了”**; four cats flopped over.
- Show attempts and best common hiss overlap, a replay button, and a **shareable screenshot** (post-MVP if it significantly expands scope).

Post-MVP collection ideas: “Three Missing One / 三缺一”, “Epic Sneeze / 惊天喷嚏”, “Fart Mystery / 放屁疑云”, “Cat Symphony / 哈尔交响乐”, “Perfect Hiss / 齐齐哈尔”. Unlock memorable scenes rather than currencies or grind.

## 12. Implementation phases — follow this order

### Phase 0 — repo & running skeleton

- Initialize monorepo, scripts, lint/typecheck/test commands, Phaser canvas, Node WebSocket server.
- `npm install && npm run dev` starts both apps, with a documented local URL and optional four-browser test instructions.
- Add `README.md`, controls, architecture overview, and environment variables.

**Done when:** one browser connects to the server and renders a placeholder *game scene* (placeholder allowed only at this infrastructure stage).

### Phase 1 — character visual prototype (art gate)

- Use the art prompt in §7.
- Generate **eight actual 64x64 pixel-art key poses**: idle + hiss for each of four kittens.
- Display two lineups in a scene: idle and hiss; verify silhouettes at native scale, including zigzag tail, splayed paws, sharp eyes, huge open mouth.
- Build and run asset PNG validator. Create `docs/art-bible.md` documenting revisions.

**Done when:** four kittens are distinct and attractive at game scale; all assets load with nearest-neighbor scaling and clean transparency. **Do not mass-generate frames before this gate.**

### Phase 2 — single-device sync prototype

- Render 4 kittens; Space controls one, test keys or bots control others.
- Add hiss state timing and authoritative `calculateOverlap` pure function.
- Animate anticipation/hiss/recovery, win text, and 3-of-4 look-at-missing-cat gag.
- Add a debug panel with each cat's start time and common overlap.

**Done when:** deterministic simulated hiss timings reliably produce success/failure and comedic feedback.

### Phase 3 — multiplayer rooms and synchronization

- Room URLs, join/leave, four slots, server game loop, action messages, room state broadcasts, retries.
- Implement server-authoritative timing; test from four tabs and ideally from two physical devices.
- Handle reconnection, duplicates, rapid input, and basic latency variations.
- Add test bots; basic public matchmaking may follow reliable invite rooms.

**Done when:** all clients observe matching results and room progress, including in near-miss cases.

### Phase 4 — fun / polish pass

- Expand to MVP animation strips (`idle`, `anticipate`, `hiss`, `recover`, `side_eye`).
- Implement one predictable **Achoo!** event with obvious warning.
- Add walking, meow and one harmless close-range interaction.
- Add early/late/chorus gags, SFX, intro, 3-minute timeout and final result screen.
- Add mute/reduced-motion settings and a 4-browser smoke test.

**Done when:** a complete room plays from joining to win/timeout/replay with no dead ends.

### Phase 5 — user testing and decision

Playtest 3 sets:

1. One person with three bots: is it immediately comprehensible and funny?
2. Four people together: does coordinating hisses create laughter and repeat attempts?
3. Four strangers or players without voice: can they coordinate using only animations and meows?

Track: first successful hiss time, average attempts, fraction of time spent in feedback vs active play, premature exits, comments on confusion, favorite fail gag. Review qualitative reactions; do not optimize arbitrary numeric thresholds without playtesting.

**Gate:** If testers find it funny but frustrating, tune feedback and timing fairness before adding content. If it is boring despite many gags, revisit the shared timing mechanic before creating more sprites.

## 13. Unit and integration tests

At minimum include:

- All four hissing with `>=300ms` common overlap => success.
- `299ms` common overlap => failure.
- Three cats only => failure with three-of-four reaction.
- Sequential non-overlapping hisses => chorus failure.
- Equal start times => maximum overlap.
- Duplicate Space events from same player do not count twice.
- Rapid key repeats while recovering do not create extra hiss events.
- Disconnect during attempt does not produce a phantom win.
- Bot replacement occurs only at a safe boundary.
- All clients receive exactly one `attempt_result` per attempt ID.
- Random event cannot cancel a valid active hiss once committed.
- PNG sheet sizes and transparency are verified.
- At least one automated local test drives four clients through a successful sync and restart.

## 14. Non-goals for MVP

Explicitly **do not** build these before the playable room works:

- Shop, currency, skin economy, accounts, persistence/database.
- Ranking, ELO, competitive scoring, toxic “blame the loser” votes.
- Voice chat, public text chat, moderation-heavy user-generated content.
- Multiple maps, complicated enemies, complex rhythm charts.
- Dozens of random events or intricate physics.
- Full mobile app release, native desktop app, 3D art.
- Huge animation production before the eight-pose style check.

## 15. Codex execution instructions

You are the implementation agent. **Implement runnable code and assets, not merely an explanation.**

1. Inspect repository structure and existing code before creating new files; preserve useful setup.
2. Work in the phase order above. Keep a `TODO.md` checklist with completed tasks, current limitations, and next steps.
3. Make reasonable defaults without asking routine setup questions. Prioritize a **runnable minimal vertical slice** over partial ambitious features.
4. Build and test frequently. When you finish a phase, run the relevant commands; fix type errors and asset loading failures before moving on.
5. For image assets, attempt a capable art-generation integration only if available; otherwise create coherent first-pass original pixel art programmatically and state this limitation. Save actual transparent PNGs and metadata.
6. Keep all timing numbers in `packages/shared/src/constants.ts` with explanatory comments.
7. Use deterministic seeded randomness for testable comedy events.
8. Provide clear console logging in development mode; keep production logs concise and avoid sensitive identifiers.
9. Ensure the lobby, game, fail gag, successful synchronized hiss, timeout, and replay are all navigable.
10. Finish with a concise report: files added, commands run, how to open four local clients, implemented vs deferred features, and known issues.

### Definition of done

A tester can clone the repo, install dependencies, start client + server locally, open four browser tabs (or bots), recognize four uniquely posed kittens, press Space to hiss, see funny near-miss and three-of-four reactions, synchronize all four active hiss windows for at least 300 ms to trigger **齐齐哈尔！！**, and replay without restarting the server.

---

**Future creative hooks (not MVP commitments):** giant group-hiss transformation after repeated wins; robot vacuum/dog encounter; group screenshot cards; cooperative emote chains; small collectible comedy-moment gallery; multiple levels only when core loop proves fun.
