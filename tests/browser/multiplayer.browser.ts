import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((candidate): candidate is string => Boolean(candidate));

function waitForOutput(process: ChildProcess, marker: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${marker}`)), 10_000);
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
      env: { ...process.env, PORT: String(serverPort), CHALLENGE_MS: '15000', BOT_PROFILE_MODE: 'cycle' },
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

  it('shows matching bilingual state and one authoritative win in four isolated sessions', async () => {
    const first = await newPlayer(baseUrl);
    await first.waitForFunction(() => document.querySelector('#room-code')?.textContent !== '——');
    const roomId = (await first.locator('#room-code').textContent())?.trim();
    expect(roomId).toMatch(/^[A-F0-9]{6}$/);

    const pages = [first];
    for (let index = 1; index < 4; index += 1) {
      pages.push(await newPlayer(`${baseUrl}/?room=${roomId}`));
    }
    await Promise.all(pages.map((page) => page.locator('#status').filter({ hasText: 'Attempt 1' }).waitFor()));

    const poseAssets = await first.evaluate(() => performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('/assets/cats/') && name.endsWith('.png')));
    for (const pose of ['idle', 'anticipate', 'hiss', 'recover', 'side_eye', 'walk', 'meow', 'boop', 'surprised']) {
      expect(poseAssets.filter((name) => name.endsWith(`/${pose}.png`))).toHaveLength(4);
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
    await interruptedPage.locator('#status').filter({ hasText: /Attempt \d+/ }).waitFor();
    expect(await interruptedPage.locator('#room-code').textContent()).toBe(roomId);
    expect(await interruptedPage.locator('.slot-labels').getByText('YOU').count()).toBe(1);

    expect(await first.locator('#scene-title').textContent()).toBe('FOUR CATS · ONE HISS');
    await first.locator('#locale').click();
    await expect.poll(() => first.locator('#scene-title').textContent()).toBe('四只猫 · 一声哈气');
    await first.locator('#locale').click();

    await Promise.all(pages.map(async (page, index) => {
      await delay([0, 70, 140, 240][index]!);
      await page.keyboard.press('Space');
    }));

    await Promise.all(pages.map((page) => page.locator('#scene-feedback').filter({ hasText: 'HISS TOGETHER!!' }).waitFor()));
    expect(await Promise.all(pages.map((page) => page.locator('#sync-value').textContent())))
      .toEqual(['4 / 4', '4 / 4', '4 / 4', '4 / 4']);
    expect(await Promise.all(pages.map((page) => page.locator('.slot-labels .is-synchronized').count())))
      .toEqual([4, 4, 4, 4]);
    expect(await Promise.all(pages.map((page) => page.locator('#replay').isVisible())))
      .toEqual([true, true, true, true]);
    expect(await Promise.all(pages.map((page) => page.locator('#copy-report').isVisible())))
      .toEqual([true, true, true, true]);
    const connectionCopies = await Promise.all(pages.map((page) => page.locator('#connection').textContent()));
    expect(connectionCopies.every((value) => value?.includes('Attempts: 1'))).toBe(true);
    await first.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await first.keyboard.press('Enter');
    await Promise.all(pages.map((page) => page.locator('#status').filter({ hasText: 'A nose is tickling' }).waitFor()));
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
    await page.locator('#status').filter({ hasText: 'Attempt 1' }).waitFor();
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
    await page.locator('#touch-hiss').dispatchEvent('pointerdown', { pointerId: 5, pointerType: 'touch' });
    await page.locator('#scene-feedback').filter({ hasText: 'HISS TOGETHER!!' }).waitFor();

    await page.locator('#replay').click();
    await page.locator('#status').filter({ hasText: 'Attempt 2' }).waitFor();
    await page.locator('#touch-hiss').dispatchEvent('pointerdown', { pointerId: 6, pointerType: 'touch' });
    await delay(120);
    await page.locator('#touch-hiss').dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch' });
    await page.locator('#status').filter({ hasText: 'One whisker away from legend.' }).waitFor();
    await expect.poll(() => page.locator('#sync-value').textContent()).toBe('3 / 4');
    expect(await page.locator('.slot-labels .is-synchronized').count()).toBe(3);
    expect(await page.locator('#failures-value').textContent()).toBe('1');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Enter');
    await page.locator('#status').filter({ hasText: 'A nose is tickling' }).waitFor({ timeout: 900 });
    expect(pageErrors).toEqual([]);
  });
});
