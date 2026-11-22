# Development checklist

## Completed

- [x] Read and adopt the MVP implementation plan
- [x] Initialize npm workspace monorepo
- [x] Add shared authoritative hiss timing constants and overlap judge
- [x] Add Vite + Phaser client skeleton
- [x] Add Node.js WebSocket server skeleton
- [x] Add bilingual Simplified Chinese / English UI with persisted language choice
- [x] Add runtime validation for initial join and action messages
- [x] Add quick-start bot slot filling and human takeover of bot slots
- [x] Add an eight-second public matchmaking queue that starts immediately with four humans
- [x] Group waiting humans together, fill remaining slots with bots, and allow cancellation
- [x] Replace public-match bots with newly queued humans only at safe attempt boundaries
- [x] Cover four-human matching, timed bot fill, safe takeover and cancellation in integration tests
- [x] Generate, normalize and validate eight 64×64 idle/hiss key poses
- [x] Render native-scale idle/hiss lineups in Phaser
- [x] Add server-authoritative hiss intervals and 300 ms overlap judgment
- [x] Add seeded, slot-shuffled bot timing profiles with a fixed-cycle automation mode
- [x] Add automatic failure retry and room replay after success
- [x] Add synchronized client hiss poses, success confetti/shake and contextual failure reactions
- [x] Add bilingual dynamic attempt/result captions and live overlap diagnostics
- [x] Replace decorative wall frames with bilingual best-record, miss-count and synchronized-cat boards
- [x] Add a prominent local-player marker and green post-attempt highlighting for the largest valid synchronized group
- [x] Add a context-sensitive Enter shortcut for first matchmaking, immediate retry and replay
- [x] Allow mouse-wheel and vertical touch scrolling while the pointer is over the Phaser canvas
- [x] Browser-smoke-test the complete one-human/three-bot loop
- [x] Reserve disconnected human slots for a 10-second reconnect grace period
- [x] Restore the same player identity and cat slot after reconnect or fast refresh
- [x] Show reserved/reconnecting slots in the bilingual client UI
- [x] Add a four-WebSocket integration test for authoritative results, duplicate input and reconnect takeover
- [x] Add smoothed RTT and server clock-offset diagnostics to the bilingual HUD
- [x] Verify that a disconnect during an attempt cannot produce a phantom win
- [x] Add server-synchronized left/right movement with authoritative positions
- [x] Add rate-limited bilingual meow bubbles
- [x] Add proximity-checked harmless boop interaction and reactions
- [x] Browser-smoke-test movement, meow and boop visuals
- [x] Add a deterministic, server-broadcast Achoo warning before attempt three
- [x] Block hiss input during the pre-attempt sneeze without cancelling committed hisses
- [x] Add bilingual sneeze captions and a first-pass kitten reaction
- [x] Add original synthesized hiss, meow, boop, sneeze, win and failure sounds
- [x] Make mute persistent and functional
- [x] Add a persistent reduced-motion control that disables shake, confetti and exaggerated tweens
- [x] Add a server-authoritative three-minute room challenge clock and shared countdown
- [x] Add synchronized bilingual timeout/souvenir feedback and replay without reconnecting
- [x] Cover timeout and replay lifecycle in the WebSocket integration suite
- [x] Add simulated unequal-latency failure/recovery coverage for four WebSocket clients
- [x] Correct the shared countdown with the measured server clock offset
- [x] Add an isolated four-browser bilingual room/win smoke test using local Chrome or Edge
- [x] Generate and normalize anticipate, recover and side-eye poses for all four kittens
- [x] Sequence the five-pose hiss cycle against shared authoritative timing constants
- [x] Use dedicated recover/side-eye poses in synchronized failure gags
- [x] Add a verified CC0 real-cat hiss recording with per-kitten pitch and stereo variation
- [x] Retain synthesized hiss fallback and document audio provenance/hash
- [x] Add bilingual coarse-pointer controls for movement, hiss, meow and boop
- [x] Add clearly audible, gag-specific failure result cues
- [x] Generate and normalize walk, meow, boop and surprised poses for all four kittens
- [x] Drive movement, social interaction and Achoo reactions with dedicated poses
- [x] Add LAN development mode with host-aware WebSocket defaults for physical-device testing
- [x] Add local, opt-in structured playtest report export
- [x] Automate a full browser outage/reconnect drill inside the reserved-slot window
- [x] Add the Phase 5 physical-device and structured-session runbook
- [x] Add server-authoritative approaching/reveal encounters without leaking trigger identity during the cue
- [x] Add dog, stranger and cat-mom trigger rules with correct hold and false-alarm outcomes
- [x] Tighten threat synchronization to 500 ms overlap (about 200 ms maximum start spread)
- [x] Add trigger-driven fair bot timing that never hisses at cat mom
- [x] Add bilingual trigger instructions, initial NPC staging and outcome-specific kitten reactions
- [x] Replace trigger placeholders with validated transparent 64×64 dog, cat-mom and stranger pixel sprites
- [x] Add distinct synthesized approach, dog, stranger and cat-mom reveal cues
- [x] Add trigger-specific reveal and result motion: threat retreat/lunge, cat-mom approach/false-alarm recoil
- [x] Add clear static trigger result states for reduced-motion mode
- [x] Separate kittens and triggers into back-row / foreground lanes with deterministic random encounter placement
- [x] Replace the ambiguous pre-trigger oval with an approaching dust trail and question cue
- [x] Enlarge the 8:5 game stage, shrink kitten sprites and move HUD boards away from the play space
- [x] Add encounter metrics to exported playtest reports
- [x] Cover cue concealment, early hiss, cat-mom false alarms and strict jitter recovery in automated tests
- [x] Add deterministic 450/500/550 ms trigger-balance simulation across voice, visual-only, mixed-RTT and bot-assisted scenarios
- [x] Add server-capped 80 ms input-latency compensation using the client's clock-offset-corrected timestamp
- [x] Verify capped compensation in unit, protocol and WebSocket integration tests
- [x] Replace the one-encounter win with a six-wave Cat Night Shift
- [x] Add three shared paws, correct-call combo, perfect-sync bonuses and authoritative scoring
- [x] Add compact night progress HUD plus bilingual win, loss and timeout settlement screens
- [x] Cover full-night victory, three-mistake defeat, replay reset and settlement layout in automated tests
- [x] Add silhouette → clue → full-reveal staging without leaking trigger identity
- [x] Give real and fake Cat Mom one shared catlike silhouette with normal versus warped bell clues
- [x] Keep waves 1–2 guided, then remove answer copy, safe/threat color and HISS/HOLD coaching from waves 3–6
- [x] Cover clue-stage early hisses, concealed room snapshots and advanced-wave browser playthroughs

## Current phase

- [x] Phase 2 — single-device synchronization prototype
- [x] Phase 3 — multi-device room hardening
- [x] Phase 4 — MVP animation and visual polish

## Next — deferred until testers/devices are available

- [ ] Run physical-device and packet-loss playtests before external user testing (currently no phone/tablet available)
- [ ] Run the Phase 5 structured player test sets and record findings (currently no human test group available)

## Current limitations

- Dog, stranger and cat-mom use single-pose pixel sprites with Phaser reveal/result motion and distinct audio cues; true frame-by-frame NPC animation remains optional polish.
- The MVP uses nine timed key poses per kitten; true multi-frame walk cycles remain optional post-playtest polish.
- Invite rooms, authoritative results, reconnect grace, simulated jitter and four-browser automation work; physical-device and packet-loss playtests remain.
- Movement, meow, boop and Achoo now use dedicated poses plus short tweens.
- Hiss uses a real CC0 recording; the remaining cues are intentionally lightweight Web Audio synthesis.
- Public matchmaking is currently an in-memory single-server queue; multi-instance deployment will require shared queue storage such as Redis.

