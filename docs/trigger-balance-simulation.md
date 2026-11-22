# Trigger timing balance simulation

Generated on 2026-11-17 with `npm run simulate:triggers`. The model uses 50,000
deterministic trials per scenario. It is a tuning aid, not a replacement for the
physical-device sessions in `docs/playtest-runbook.md`.

## Threshold comparison

| Scenario | Mean spread | 450ms overlap | 500ms overlap | 550ms overlap | Highest-RTT player latest |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4 humans · voice rhythm | 96ms | 99.9% | 98.8% | 89.8% | 32.0% |
| 4 humans · visual only | 158ms | 90.1% | 74.3% | 48.6% | 30.9% |
| 4 humans · one 220ms RTT | 137ms | 97.1% | 86.9% | 61.4% | 69.1% |
| 1 human + 3 adaptive bots | 101ms | 99.5% | 98.1% | 94.6% | 43.7% |

The current 500ms requirement remains the recommended starting point. It keeps
voice-coordinated play reliable while leaving a meaningful failure rate for
visual-only coordination. A 550ms requirement is too punitive before real-device
evidence; 450ms weakens the intended precision increase.

## Capped input compensation

The client sends its clock-offset-corrected estimate of the server time when the
hiss was pressed. The server remains authoritative and can move the accepted
time backward by at most 80ms, never before the reveal boundary.

| Scenario | Raw 500ms success | Capped-compensation success | Raw high-RTT latest | Compensated high-RTT latest |
| --- | ---: | ---: | ---: | ---: |
| 4 humans · voice rhythm | 98.8% | 98.9% | 32.0% | 24.9% |
| 4 humans · visual only | 74.3% | 75.2% | 30.9% | 25.2% |
| 4 humans · one 220ms RTT | 86.9% | 95.9% | 69.1% | 41.8% |
| 1 human + 3 adaptive bots | 98.1% | 99.4% | 43.7% | 25.0% |

The cap materially reduces the mixed-network bias without meaningfully changing
normal-network success rates. Keep the 80ms cap until physical-device reports
show either persistent high-RTT unfairness or excessive forgiveness.

## Model assumptions

- Hiss active duration is 700ms.
- RTT contributes half its value as outbound delay.
- Reaction time and network jitter use seeded normal distributions.
- The compensation model removes at most `min(RTT / 2, 80ms)`.
- It does not model dropped packets, background-tab throttling or players who
  misidentify the trigger.
