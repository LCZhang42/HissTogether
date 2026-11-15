import Phaser from 'phaser';
import { HISS_TIMING, findSynchronizedSlots, type CatSlot, type RoomSnapshot, type ServerMessage } from '@qiqihar/shared';

interface GameMessageDetail {
  message: ServerMessage;
  localSlot?: CatSlot;
}

const cats = [
  'kitten_01_lightning_tail',
  'kitten_02_ground_gripper',
  'kitten_03_judgmental_eyes',
  'kitten_04_big_hiss',
] as const;

const catX = [48, 122, 198, 272] as const;
const catScale = [1, 1, 1, 0.9] as const;
const catPoses = ['idle', 'anticipate', 'hiss', 'recover', 'side_eye', 'walk', 'meow', 'boop', 'surprised'] as const;
type CatPose = typeof catPoses[number];

export class BootScene extends Phaser.Scene {
  private catSprites: Phaser.GameObjects.Image[] = [];
  private markers: Phaser.GameObjects.Arc[] = [];
  private resetTimers: Phaser.Time.TimerEvent[] = [];
  private currentPoses: CatPose[] = ['idle', 'idle', 'idle', 'idle'];
  private localSlot: CatSlot | undefined;
  private synchronizedSlots = new Set<CatSlot>();

  private readonly messageHandler = (event: Event): void => {
    const { message, localSlot } = (event as CustomEvent<GameMessageDetail>).detail;
    this.handleMessage(message, localSlot);
  };
  private readonly enterHandler = (): void => {
    window.dispatchEvent(new Event('qiqihar-enter-shortcut'));
  };

  constructor() { super('boot'); }

  preload(): void {
    cats.forEach((cat, index) => {
      catPoses.forEach((pose) => {
        this.load.image(`cat-${index}-${pose}`, `/assets/cats/${cat}/${pose}.png`);
      });
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#b9ad9a');
    this.add.rectangle(160, 57, 320, 114, 0xcfc4b2).setStrokeStyle(1, 0xa99a86);
    this.add.rectangle(160, 145, 320, 70, 0x8f7e6d);
    cats.forEach((_, index) => {
      const x = catX[index]!;
      const marker = this.add.circle(x, 139, 23, 0xf5e6cc, 0.18).setStrokeStyle(1, 0x6d5d51, 0.45);
      const sprite = this.add.image(x, 139, `cat-${index}-idle`).setOrigin(0.5, 1).setScale(catScale[index]!);
      this.markers.push(marker);
      this.catSprites.push(sprite);
    });

    window.addEventListener('qiqihar-message', this.messageHandler);
    this.input.keyboard?.on('keydown-ENTER', this.enterHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('qiqihar-message', this.messageHandler);
      this.input.keyboard?.off('keydown-ENTER', this.enterHandler);
    });
  }

  private handleMessage(message: ServerMessage, localSlot?: CatSlot): void {
    if (message.type === 'room_state') this.applyRoomState(message.state, localSlot);
    if (message.type === 'hiss_started') this.playHiss(message.slot);
    if (message.type === 'attempt_result') this.playResult(message);
    if (message.type === 'player_moved') this.moveCat(message.slot, message.x);
    if (message.type === 'social_action') this.playMeow(message.slot);
    if (message.type === 'interaction') this.playBoop(message.fromSlot, message.toSlot);
    if (message.type === 'chaos_event') message.affectedSlots.forEach((slot) => this.playAchoo(slot));
    if (message.type === 'room_result' && message.result === 'timeout') this.playTimeout();
  }

  private applyRoomState(state: RoomSnapshot, localSlot?: CatSlot): void {
    this.localSlot = localSlot;
    if (state.phase === 'playing' || state.phase === 'waiting') this.synchronizedSlots.clear();
    for (let slot = 0; slot < 4; slot += 1) {
      const player = state.players.find((candidate) => candidate.slot === slot);
      if (player) {
        this.catSprites[slot]?.setX(player.x);
        this.markers[slot]?.setX(player.x);
      }
    }
    this.updateMarkerStyles();
    if (state.phase === 'playing') {
      this.resetCats();
    }
  }

  private playHiss(slot: CatSlot): void {
    const sprite = this.catSprites[slot];
    if (!sprite) return;
    this.tweens.killTweensOf(sprite);
    this.setPose(slot, 'anticipate');
    const baseScale = catScale[slot];
    sprite.setScale(baseScale * 0.94);
    if (this.motionEnabled()) this.tweens.add({ targets: sprite, scaleX: baseScale * 1.04, scaleY: baseScale * 0.9, duration: HISS_TIMING.anticipateMs, ease: 'Quad.In' });

    this.resetTimers.push(this.time.delayedCall(HISS_TIMING.anticipateMs, () => {
      if (!sprite.active) return;
      this.setPose(slot, 'hiss');
      sprite.setScale(baseScale * 0.92);
      if (this.motionEnabled()) this.tweens.add({ targets: sprite, scale: baseScale, duration: 150, ease: 'Back.Out' });
      else sprite.setScale(baseScale);
    }));
    this.resetTimers.push(this.time.delayedCall(HISS_TIMING.anticipateMs + HISS_TIMING.activeMs, () => {
      if (!sprite.active) return;
      this.setPose(slot, 'recover');
      sprite.setScale(baseScale);
      if (this.motionEnabled()) this.tweens.add({ targets: sprite, y: 141, duration: HISS_TIMING.recoverMs, ease: 'Sine.Out' });
    }));
    this.resetTimers.push(this.time.delayedCall(
      HISS_TIMING.anticipateMs + HISS_TIMING.activeMs + HISS_TIMING.recoverMs,
      () => sprite.active && this.setPose(slot, 'idle'),
    ));
  }

  private moveCat(slot: CatSlot, x: number): void {
    const sprite = this.catSprites[slot];
    const marker = this.markers[slot];
    if (!sprite || !marker) return;
    const direction = Math.sign(x - sprite.x);
    if (this.canUseSocialPose(slot) && direction !== 0) this.setPose(slot, 'walk').setFlipX(direction < 0);
    if (this.motionEnabled()) this.tweens.add({ targets: [sprite, marker], x, duration: 90, ease: 'Sine.Out' });
    else { sprite.setX(x); marker.setX(x); }
    this.time.delayedCall(140, () => {
      if (sprite.active && this.currentPoses[slot] === 'walk') this.setPose(slot, 'idle');
    });
  }

  private playMeow(slot: CatSlot): void {
    const sprite = this.catSprites[slot];
    if (!sprite || !this.canUseSocialPose(slot)) return;
    this.setPose(slot, 'meow');
    if (this.motionEnabled()) this.tweens.add({ targets: sprite, y: 134, duration: 100, yoyo: true, ease: 'Quad.Out' });
    this.time.delayedCall(420, () => {
      if (sprite.active && this.currentPoses[slot] === 'meow') this.setPose(slot, 'idle');
    });
  }

  private playBoop(fromSlot: CatSlot, toSlot: CatSlot): void {
    const source = this.catSprites[fromSlot];
    const target = this.catSprites[toSlot];
    if (!source || !target || !this.canUseSocialPose(fromSlot)) return;
    const direction = Math.sign(target.x - source.x) || 1;
    this.setPose(fromSlot, 'boop').setFlipX(direction < 0);
    if (this.canUseSocialPose(toSlot)) this.setPose(toSlot, 'surprised');
    if (this.motionEnabled()) {
      this.tweens.add({ targets: source, x: source.x + direction * 7, duration: 120, yoyo: true, ease: 'Sine.InOut' });
      this.tweens.add({ targets: target, angle: direction * 5, duration: 90, yoyo: true, repeat: 1 });
    }
    this.time.delayedCall(420, () => {
      if (source.active && this.currentPoses[fromSlot] === 'boop') this.setPose(fromSlot, 'idle');
      if (target.active && this.currentPoses[toSlot] === 'surprised') this.setPose(toSlot, 'idle');
    });
  }

  private playAchoo(slot: CatSlot): void {
    const sprite = this.catSprites[slot];
    if (!sprite) return;
    this.setPose(slot, 'surprised');
    sprite.setTint(0xffd4c4);
    if (!this.motionEnabled()) {
      this.time.delayedCall(1_250, () => sprite.active && this.setPose(slot, 'idle'));
      return;
    }
    this.tweens.add({
      targets: sprite,
      y: 128,
      scaleX: catScale[slot] * 1.15,
      scaleY: catScale[slot] * 0.86,
      angle: slot % 2 === 0 ? -7 : 7,
      duration: 170,
      yoyo: true,
      repeat: 2,
      ease: 'Back.Out',
    });
    this.time.delayedCall(1_250, () => {
      if (sprite.active) this.setPose(slot, 'idle');
    });
  }

  private playResult(message: Extract<ServerMessage, { type: 'attempt_result' }>): void {
    this.resetTimers.forEach((timer) => timer.remove(false));
    this.resetTimers = [];
    this.synchronizedSlots = new Set(findSynchronizedSlots(message.events.map((event) => ({
      slot: event.slot,
      startMs: event.activeStartMs,
      endMs: event.activeEndMs,
    }))));
    this.updateMarkerStyles();
    if (message.success) {
      this.catSprites.forEach((sprite, slot) => this.setPose(slot as CatSlot, 'hiss').setScale(catScale[slot]! * 1.06));
      if (this.motionEnabled()) {
        this.cameras.main.flash(220, 255, 240, 190);
        this.cameras.main.shake(260, 0.008);
        this.confetti();
      }
      return;
    }

    this.resetCats();
    if (message.gag === 'three-of-four') {
      const active = new Set(message.events.map((event) => event.slot));
      const missing = ([0, 1, 2, 3] as const).find((slot) => !active.has(slot));
      if (missing !== undefined) {
        this.catSprites.forEach((sprite, slot) => {
          if (slot === missing) {
            if (this.motionEnabled()) this.tweens.add({ targets: sprite, y: 135, duration: 120, yoyo: true, repeat: 2 });
          } else {
            this.setPose(slot as CatSlot, 'side_eye');
            sprite.setFlipX(slot < missing).setAngle(slot < missing ? 4 : -4);
          }
        });
      }
    } else if (message.gag === 'chorus') {
      this.catSprites.forEach((sprite, slot) => {
        this.setPose(slot as CatSlot, 'recover');
        sprite.setAngle(slot % 2 === 0 ? -5 : 5);
      });
    } else if (message.gag === 'near-miss') {
      this.catSprites.forEach((_, slot) => this.setPose(slot as CatSlot, 'recover'));
    } else {
      this.catSprites.forEach((_, slot) => this.setPose(slot as CatSlot, 'side_eye'));
    }
  }

  private playTimeout(): void {
    this.resetCats();
    this.catSprites.forEach((sprite, slot) => {
      sprite.setTint(0xc8b8aa);
      if (this.motionEnabled()) sprite.setAngle(slot % 2 === 0 ? -9 : 9).setY(143);
    });
  }

  private resetCats(): void {
    this.catSprites.forEach((sprite, slot) => {
      this.tweens.killTweensOf(sprite);
      this.setPose(slot as CatSlot, 'idle');
    });
  }

  private updateMarkerStyles(): void {
    this.markers.forEach((marker, slot) => {
      const synchronized = this.synchronizedSlots.has(slot as CatSlot);
      const local = slot === this.localSlot;
      marker.setFillStyle(synchronized ? 0x8fd19a : 0xf5e6cc, synchronized ? 0.42 : 0.18);
      marker.setStrokeStyle(
        synchronized || local ? 2 : 1,
        synchronized ? 0x2f7d45 : local ? 0xffe08a : 0x6d5d51,
        synchronized || local ? 1 : 0.45,
      );
    });
  }

  private setPose(slot: CatSlot, pose: CatPose): Phaser.GameObjects.Image {
    this.currentPoses[slot] = pose;
    return this.catSprites[slot]!
      .clearTint()
      .setTexture(`cat-${slot}-${pose}`)
      .setScale(catScale[slot])
      .setAngle(0)
      .setFlipX(false)
      .setY(139);
  }

  private canUseSocialPose(slot: CatSlot): boolean {
    return ['idle', 'walk', 'meow', 'boop', 'surprised'].includes(this.currentPoses[slot]!);
  }

  private confetti(): void {
    const colors = [0xe8d9bb, 0xd98f91, 0xa87854, 0x78818a];
    for (let index = 0; index < 24; index += 1) {
      const piece = this.add.rectangle(20 + (index * 47) % 285, -4 - (index % 5) * 5, 3, 3, colors[index % colors.length]!).setDepth(12);
      this.tweens.add({
        targets: piece,
        y: 184,
        x: piece.x + ((index % 3) - 1) * 24,
        angle: 180 + index * 13,
        duration: 700 + (index % 6) * 90,
        ease: 'Quad.In',
        onComplete: () => piece.destroy(),
      });
    }
  }

  private motionEnabled(): boolean {
    return document.documentElement.dataset.reducedMotion !== 'true';
  }
}
