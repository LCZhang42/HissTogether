import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((candidate): candidate is string => Boolean(candidate));
const screenshotDir = process.env.QIQIHAR_SCREENSHOT_DIR;

async function captureScreenshot(page: Page, name: string): Promise<void> {
  if (!screenshotDir) return;
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: resolve(screenshotDir, name), fullPage: true });
}

function waitForOutput(process: ChildProcess, marker: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${marker}`)), 20_000);
    const inspect = (chunk: unknown) => {
      if (String(chunk).includes(marker)) {
        clearTimeout(timer);
        resolvePromise();
      }
    };
    process.stdout?.on('data', inspect);
    process.stderr?.on('data', inspect);
    process.once('error', reject);
    process.once('exit', (code) => code && reject(new Error(`Child process exited with ${code}`)));
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

describe('four-browser room', () => {
  let serverProcess: ChildProcess;
  let clientProcess: ChildProcess;
  let browser: Browser;
  const contexts: BrowserContext[] = [];
  const serverPort = 22_000 + Math.floor(Math.random() * 1_000);
  const clientPort = serverPort + 1_000;
  const baseUrl = `http://localhost:${clientPort}`;

  beforeAll(async () => {
    const chromePath = chromeCandidates.find(existsSync);
    if (!chromePath) throw new Error('Chrome or Edge is required; set CHROME_PATH to its executable.');

    serverProcess = spawn(process.execPath, [resolve('apps/server/dist/index.js')], {
      env: { ...process.env, PORT: String(serverPort), CHALLENGE_MS: '30000', BOT_PROFILE_MODE: 'cycle' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForOutput(serverProcess, 'WebSocket server listening');

    clientProcess = spawn(process.execPath, [
      resolve('apps/client/node_modules/vite/bin/vite.js'),
      '--host', 'localhost',
      '--port', String(clientPort),
      '--strictPort',
    ], {
      cwd: resolve('apps/client'),
      env: { ...process.env, VITE_WS_URL: `ws://localhost:${serverPort}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForOutput(clientProcess, 'Local:');

    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--disable-gpu', '--no-proxy-server', '--proxy-bypass-list=<-loopback>'],
    });
  });

  afterAll(async () => {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
    await browser?.close();
    clientProcess?.kill();
    serverProcess?.kill();
  });

  afterEach(async () => {
    const completedContexts = contexts.splice(0);
    await Promise.all(completedContexts.map((context) => context.close().catch(() => undefined)));
  });

  async function newPlayer(url: string): Promise<Page> {
    const context = await browser.newContext();
    contexts.push(context);
    await context.addInitScript(() => {
      localStorage.setItem('qiqihar-locale', 'en');
      localStorage.setItem('qiqihar-muted', 'true');
      localStorage.setItem('qiqihar-reduced-motion', 'true');
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'commit' });
    await page.locator('#connection').filter({ hasText: 'Connected' }).waitFor();
    return page;
  }

  it('renders the disguised robot vacuum as a threat without covering the kittens', async () => {
    const page = await newPlayer(baseUrl);
    await page.locator('canvas').waitFor();
    await delay(250);
    await page.evaluate(() => {
      const now = Date.now();
      window.dispatchEvent(new CustomEvent('qiqihar-message', {
        detail: {
          localSlot: 0,
          message: {
            type: 'trigger_cue', encounterId: 6, direction: 'left', silhouette: 'catlike',
            cueStartedAtMs: now, clueAtMs: now + 450, revealAtMs: now + 1_000,
          },
        },
      }));
    });
    await delay(450);
    await captureScreenshot(page, 'vacuum-mom-silhouette.png');
    await page.evaluate(() => {
      const now = Date.now();
      window.dispatchEvent(new CustomEvent('qiqihar-message', {
        detail: {
          localSlot: 0,
          message: {
            type: 'trigger_clue', encounterId: 6, direction: 'left', silhouette: 'catlike', clue: 'warped-bell',
            clueAtMs: now, revealAtMs: now + 550,
          },
        },
      }));
    });
    await delay(180);
    await captureScreenshot(page, 'vacuum-mom-clue.png');
    await page.evaluate(() => {
      const now = Date.now();
      window.dispatchEvent(new CustomEvent('qiqihar-message', {
        detail: {
          localSlot: 0,
          message: {
            type: 'trigger_revealed',
            encounterId: 6,
            direction: 'left',
            kind: 'vacuum-mom',
            category: 'threat',
            revealedAtMs: now,
            responseEndsAtMs: now + 1_400,
          },
        },
      }));
    });
    await delay(150);
    await captureScreenshot(page, 'vacuum-mom-trigger.png');
    await page.evaluate(() => {
      const starts = [1_000, 1_040, 1_080, 1_600];
      window.dispatchEvent(new CustomEvent('qiqihar-message', {
        detail: {
          localSlot: 0,
          message: {
            type: 'encounter_result', encounterId: 6, triggerKind: 'vacuum-mom', outcome: 'desynced_threat',
            correct: false, overlapMs: 100, startSpreadMs: 600,
            progress: {
              night: { wave: 6, totalWaves: 6, paws: 2, maxPaws: 3, combo: 0, bestCombo: 2, score: 400, correctWaves: 4 },
              scoreAwarded: 0, perfectSync: false, result: null,
            },
            events: starts.map((startMs, slot) => ({
              slot, acceptedAtMs: startMs, activeStartMs: startMs, activeEndMs: startMs + 700,
            })),
            earlySlots: [], missingSlots: [],
          },
        },
      }));
    });
    await delay(250);
    await captureScreenshot(page, 'timing-outlier-feedback.png');
    expect(await page.locator('canvas').isVisible()).toBe(true);
  });

  it('identifies a late human hiss with a red circle and readable label', async () => {
    const page = await newPlayer(baseUrl);
    await page.locator('#quick-start').click();
    await page.locator('#status').filter({ hasText: 'A dog!' }).waitFor();
    await delay(900);
    await page.keyboard.press('Space');
    await page.locator('#scene-feedback:not([hidden])').waitFor({ timeout: 5_000 });
    expect(await page.locator('#status').textContent()).toContain('Right target, wrong timing!');

    const localLabel = page.locator('#slot-label-0');
    await expect.poll(() => localLabel.textContent()).toBe('YOU · SLOW!');
    expect(await localLabel.getAttribute('class')).toContain('is-danger');
    expect(await page.locator('.slot-labels .is-synchronized').count()).toBe(3);
    await captureScreenshot(page, 'late-cat-feedback.png');
  });

  it('shows bilingual public matchmaking countdown and can cancel back to a room', async () => {
    const page = await newPlayer(baseUrl);
    await page.keyboard.press('Enter');
    await page.locator('#status').filter({ hasText: /Matching 1\/4/ }).waitFor();
    await page.locator('#matchmake').filter({ hasText: 'Cancel match' }).waitFor();
    expect(await page.locator('#copy').isVisible()).toBe(false);

    await page.locator('#locale').click();
    await page.locator('#status').filter({ hasText: /匹配中 1\/4/ }).waitFor();
    await page.locator('#matchmake').filter({ hasText: '取消匹配' }).click();
    await page.waitForFunction(() => document.querySelector('#room-code')?.textContent !== '——');
    await page.locator('#matchmake').filter({ hasText: '随机匹配' }).waitFor();
    expect(await page.locator('#copy').isVisible()).toBe(true);
  });

  it('shows matching bilingual state and one authoritative scored wave in four isolated sessions', async () => {
    const first = await newPlayer(baseUrl);
    await first.waitForFunction(() => document.querySelector('#room-code')?.textContent !== '——');
    const roomId = (await first.locator('#room-code').textContent())?.trim();
    expect(roomId).toMatch(/^[A-F0-9]{6}$/);

    const pages = [first];
    for (let index = 1; index < 4; index += 1) {
      pages.push(await newPlayer(`${baseUrl}/?room=${roomId}`));
    }
    await Promise.all(pages.map((page) => page.locator('#status').filter({ hasText: 'A dog!' }).waitFor()));

    const poseAssets = await first.evaluate(() => performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('/assets/cats/') && name.endsWith('.png')));
    for (const pose of ['idle', 'anticipate', 'hiss', 'recover', 'side_eye', 'walk', 'meow', 'boop', 'surprised']) {
      expect(poseAssets.filter((name) => name.endsWith(`/${pose}.png`))).toHaveLength(4);
    }
    const triggerAssets = await first.evaluate(() => performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('/assets/triggers/') && name.endsWith('.png')));
    for (const trigger of ['dog', 'cat-mom', 'stranger', 'vacuum-mom']) {
      expect(triggerAssets.some((name) => name.endsWith(`/assets/triggers/${trigger}.png`))).toBe(true);
    }

    const realHiss = await first.evaluate(async () => {
      const response = await fetch('/assets/audio/cat-hiss-zabuhailo.wav');
      const context = new AudioContext();
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const result = { duration: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate };
      await context.close();
      return result;
    });
    expect(realHiss.duration).toBeCloseTo(2.312, 2);
    expect(realHiss.channels).toBe(1);
    expect(realHiss.sampleRate).toBeGreaterThanOrEqual(44_100);

    expect(await Promise.all(pages.map((page) => page.locator('#room-code').textContent())))
      .toEqual([roomId, roomId, roomId, roomId]);
    expect(await Promise.all(pages.map((page) => page.locator('.slot-labels').getByText('YOU').count())))
      .toEqual([1, 1, 1, 1]);
    expect(await Promise.all(pages.map((page) => page.locator('.you-marker-layer span:not([hidden])').count())))
      .toEqual([1, 1, 1, 1]);

    const interruptedPage = pages[3]!;
    const interruptedUrl = interruptedPage.url();
    await interruptedPage.context().setOffline(true);
    await interruptedPage.reload({ waitUntil: 'commit', timeout: 3_000 }).catch(() => undefined);
    await first.locator('#connection').filter({ hasText: 'Holding kitten slot' }).waitFor({ timeout: 5_000 });
    await delay(700);
    await interruptedPage.context().setOffline(false);
    await interruptedPage.goto(interruptedUrl, { waitUntil: 'commit' });
    await interruptedPage.locator('#connection').filter({ hasText: 'Connected' }).waitFor();
    await interruptedPage.locator('#status').filter({ hasText: /A silhouette|Listen|It is Mom/ }).waitFor();
    expect(await interruptedPage.locator('#room-code').textContent()).toBe(roomId);
    expect(await interruptedPage.locator('.slot-labels').getByText('YOU').count()).toBe(1);

    expect(await first.locator('#scene-title').textContent()).toBe('FOUR CATS · ONE HISS');
    await first.locator('#locale').click();
    await expect.poll(() => first.locator('#scene-title').textContent()).toBe('四只猫 · 一声哈气');
    await first.locator('#locale').click();

    await Promise.all(pages.map((page) => page.locator('#status').filter({ hasText: 'A dog!' }).waitFor({ timeout: 12_000 })));
    expect(await Promise.all(pages.map((page) => page.locator('#reaction-meter').isVisible())))
      .toEqual([true, true, true, true]);
    expect(await Promise.all(pages.map((page) => page.locator('#status').getAttribute('data-tone'))))
      .toEqual(['danger', 'danger', 'danger', 'danger']);
    await captureScreenshot(first, '01-danger-response.png');
    await Promise.all(pages.map((page) => page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    })));

    await Promise.all(pages.map((page) => page.locator('#scene-feedback').filter({ hasText: /HISS TOGETHER!!|PERFECT HISS!/ }).waitFor()));
    await Promise.all(pages.map((page) => page.locator('#status').filter({ hasText: 'The danger ran away!' }).waitFor()));
    expect(await Promise.all(pages.map((page) => page.locator('#status').getAttribute('data-tone'))))
      .toEqual(['success', 'success', 'success', 'success']);
    expect(await first.locator('#scene-feedback').evaluate((feedback) => getComputedStyle(feedback).animationName))
      .toBe('none');
    await captureScreenshot(first, '02-synchronized-success.png');
    expect(await Promise.all(pages.map((page) => page.locator('#sync-value').textContent())))
      .toEqual(['4/4', '4/4', '4/4', '4/4']);
    expect(await Promise.all(pages.map((page) => page.locator('.slot-labels .is-synchronized').count())))
      .toEqual([4, 4, 4, 4]);
    expect(await Promise.all(pages.map((page) => page.locator('#replay').isVisible())))
      .toEqual([false, false, false, false]);
    expect(await Promise.all(pages.map((page) => page.locator('#copy-report').isVisible())))
      .toEqual([false, false, false, false]);
    expect(await Promise.all(pages.map((page) => page.locator('#night-wave').textContent())))
      .toEqual(['1 / 6', '1 / 6', '1 / 6', '1 / 6']);
    expect((await first.locator('#score-value').textContent())?.trim()).toMatch(/^0*\d+$/);
    expect(await first.locator('#combo-value').textContent()).toContain('×1');
    const connectionCopies = await Promise.all(pages.map((page) => page.locator('#connection').textContent()));
    expect(connectionCopies.every((value) => value?.includes('Attempts:'))).toBe(true);
    await first.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await first.keyboard.press('Enter');
    await Promise.all(pages.map((page) => page.locator('#status').filter({ hasText: /A silhouette|Listen|It is Mom/ }).waitFor()));
  });

  it('plays the bot-assisted loop with coarse-pointer touch controls', async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    contexts.push(context);
    await context.addInitScript(() => {
      localStorage.setItem('qiqihar-locale', 'en');
      localStorage.setItem('qiqihar-muted', 'false');
      localStorage.setItem('qiqihar-reduced-motion', 'true');
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'commit' });
    await page.locator('#connection').filter({ hasText: 'Connected' }).waitFor();
    await expect.poll(() => page.locator('#touch-controls').isVisible(), { timeout: 5_000 }).toBe(true);
    const canvasInput = await page.locator('#game canvas').evaluate((canvas) => {
      const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
      canvas.dispatchEvent(wheel);
      return { defaultPrevented: wheel.defaultPrevented, touchAction: getComputedStyle(canvas).touchAction };
    });
    expect(canvasInput).toEqual({ defaultPrevented: false, touchAction: 'pan-y' });

    await page.locator('#quick-start').click();
    await page.locator('#status').filter({ hasText: 'A dog!' }).waitFor();
    await expect.poll(() => page.locator('#touch-hiss').textContent()).toBe('HISS NOW!');
    expect(await page.locator('#touch-hiss').getAttribute('class')).toContain('is-urgent');
    expect(await page.locator('#reaction-meter').getAttribute('data-tone')).toBe('danger');
    const dangerInput = page.evaluate(() => new Promise<void>((resolvePromise) => {
      window.setTimeout(() => {
        document.querySelector('#touch-hiss')?.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 5, pointerType: 'touch', bubbles: true,
        }));
        resolvePromise();
      }, 250);
    }));
    await captureScreenshot(page, '03-mobile-danger.png');
    await dangerInput;
    await page.locator('#scene-feedback').filter({ hasText: /HISS TOGETHER!!|PERFECT HISS!/ }).waitFor();

    const originalLeft = await page.locator('#slot-label-0').evaluate((label) => (label as HTMLElement).style.left);
    await page.locator('#touch-left').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch' });
    await page.locator('#touch-left').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch' });
    await expect.poll(
      () => page.locator('#slot-label-0').evaluate((label) => (label as HTMLElement).style.left),
      { timeout: 3_000 },
    ).not.toBe(originalLeft);

    await page.locator('#touch-meow').dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch' });
    await expect.poll(() => page.locator('#emote-0').textContent()).toBe('MEOW!');
    for (let step = 0; step < 8; step += 1) {
      await page.locator('#touch-right').dispatchEvent('pointerdown', { pointerId: 3, pointerType: 'touch' });
      await page.locator('#touch-right').dispatchEvent('pointerup', { pointerId: 3, pointerType: 'touch' });
      await delay(40);
    }
    await page.locator('#touch-boop').dispatchEvent('pointerdown', { pointerId: 4, pointerType: 'touch' });
    await expect.poll(() => page.locator('#emote-1').textContent()).toBe('BOOP!');

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Enter');
    await page.locator('#status').filter({ hasText: 'It is Mom' }).waitFor();
    await expect.poll(() => page.locator('#touch-hiss').textContent()).toBe('HOLD!');
    expect(await page.locator('#touch-hiss').getAttribute('class')).toContain('is-hold');
    expect(await page.locator('#reaction-meter').getAttribute('data-tone')).toBe('safe');
    const falseAlarmInput = page.evaluate(() => new Promise<void>((resolvePromise) => {
      window.setTimeout(() => {
        document.querySelector('#touch-hiss')?.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 6, pointerType: 'touch', bubbles: true,
        }));
        resolvePromise();
      }, 250);
    }));
    await captureScreenshot(page, '04-mobile-hold.png');
    await falseAlarmInput;
    await page.locator('#status').filter({ hasText: 'It is Mom! Do not hiss!' }).waitFor();
    await expect.poll(() => page.locator('#sync-value').textContent()).toBe('0/4');
    expect(await page.locator('.slot-labels .is-synchronized').count()).toBe(0);
    expect(await page.locator('#night-paws').textContent()).toBe('🐾🐾♡');
    expect(await page.locator('#combo-value').textContent()).toContain('×0');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Enter');
    await page.locator('#status').filter({ hasText: 'A silhouette' }).waitFor({ timeout: 1_200 });
    expect(pageErrors).toEqual([]);
  });

  it('shows a complete night report after spending all three paws', async () => {
    const page = await newPlayer(baseUrl);
    await page.locator('#quick-start').click();
    for (let wave = 1; wave <= 3; wave += 1) {
      await page.locator('#status').filter({ hasText: 'A silhouette' }).waitFor({ timeout: 5_000 });
      await page.keyboard.press('Space');
      await page.locator('#scene-feedback:not([hidden])').waitFor({ timeout: 3_000 });
      if (wave < 3) {
        await page.keyboard.press('Enter');
        await expect.poll(() => page.locator('#night-wave').textContent()).toBe(`${wave + 1} / 6`);
      }
    }

    await page.locator('#night-summary').waitFor({ state: 'visible' });
    expect(await page.locator('#night-summary-title').textContent()).toBe('OUT OF PAWS!');
    expect(await page.locator('#summary-correct').textContent()).toBe('0 / 6');
    expect(await page.locator('#summary-combo').textContent()).toBe('×0');
    expect(await page.locator('#night-replay').isVisible()).toBe(true);
    await captureScreenshot(page, '05-night-summary-loss.png');
  });

  it('completes all six waves before showing the winning night report', async () => {
    const page = await newPlayer(baseUrl);
    await page.locator('#quick-start').click();
    const waves = [true, false, true, true, false, true];

    for (const [index, shouldHiss] of waves.entries()) {
      await expect.poll(() => page.locator('#night-wave').textContent()).toBe(`${index + 1} / 6`);
      await page.locator('#reaction-meter').waitFor({ state: 'visible', timeout: 5_000 });
      if (index >= 2) {
        expect(await page.locator('#status').textContent()).toBe('Visitor revealed — trust your eyes and choose!');
        expect(await page.locator('#reaction-meter').getAttribute('data-tone')).toBe('mystery');
        expect(await page.locator('#touch-hiss').textContent()).toBe('HISS!');
      }
      if (shouldHiss) await page.keyboard.press('Space');
      await page.locator('#scene-feedback:not([hidden])').waitFor({ timeout: 4_000 });
      expect(await page.locator('#night-paws').textContent()).toBe('🐾🐾🐾');
      if (index < waves.length - 1) {
        await page.keyboard.press('Enter');
        await expect.poll(() => page.locator('#night-wave').textContent()).toBe(`${index + 2} / 6`);
      }
    }

    await page.locator('#night-summary').waitFor({ state: 'visible' });
    expect(await page.locator('#night-summary-title').textContent()).toBe('NIGHT CLEARED!');
    expect(await page.locator('#summary-correct').textContent()).toBe('6 / 6');
    expect(await page.locator('#summary-combo').textContent()).toBe('×6');
    expect(Number(await page.locator('#summary-score').textContent())).toBeGreaterThan(0);
    await expect.poll(() => page.locator('#night-replay').textContent()).toBe('Work another shift');
    expect((await page.locator('#night-replay').boundingBox())?.width).toBeGreaterThan(150);
    await captureScreenshot(page, '06-night-summary-win.png');
  });
});
