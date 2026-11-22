# Phase 5 playtest runbook

Before a physical session, run `npm run simulate:triggers` and retain the output
with the session notes. The current baseline and assumptions are documented in
`docs/trigger-balance-simulation.md`.

## LAN setup

1. Connect the development computer and test devices to the same trusted Wi-Fi network.
2. Run `npm run dev:lan`.
3. Find the computer's LAN IPv4 address (for example `192.168.1.23`).
4. Open `http://<LAN-IP>:5173` on each device. The client automatically connects its WebSocket to the same host on port `8080`.
5. If Windows asks, allow Node.js on private networks only.

Do not expose these development ports directly to the public internet.

## Test sets

Run each set with a fresh room:

1. **One person + three bots:** confirm the mechanic is understandable without explanation and note the first confusing moment.
2. **Four friends with voice:** observe whether coordinating hisses produces laughter, retries and spontaneous social actions.
3. **Four players without voice:** prohibit voice/text coordination and check whether animation, meows and timing feedback are sufficient.

## Connection-loss drill

During one active attempt, switch one phone to airplane mode for 2–4 seconds, then reconnect to Wi-Fi. Confirm:

- the other devices show that kitten's slot as reserved;
- the same phone restores its original kitten slot within 10 seconds;
- the interrupted attempt cannot produce a phantom success;
- the next attempt gives every device the same result.

## Capturing results

After a cleared, failed or timed-out night, press **Copy playtest report / 复制试玩报告** and paste the JSON into the session notes. The report remains local until copied and contains no nickname, free text or device identifier. It includes final score, correct waves, best combo and remaining paws.

Also record these human observations:

- Did players understand the goal before their first attempt?
- Did players notice that waves 1–2 teach the rule while waves 3–6 remove the answer prompt?
- Could players tell the normal bell from the warped bell + motor clue without mistaking either clue for permission to hiss early?
- Did the shared catlike silhouette make fake Mom funny and suspicious, or merely feel unfair?
- Whether players understood the six-wave structure and shared three-paw limit.
- Final score, correct waves and where the first combo broke.
- Favorite failure gag and least clear feedback.
- Whether players used meow, movement or boop without prompting.
- Any premature exit and the stated reason.
- One direct quote describing the funniest or most frustrating moment.
- Whether the same high-RTT player is repeatedly shown as the latest kitten.

## Review

Compare the three test sets qualitatively before changing timing. If the game is funny but frustrating, tune synchronization feedback and fairness first. If it remains boring despite understanding the mechanic, revisit the shared-timing loop before producing more content.
