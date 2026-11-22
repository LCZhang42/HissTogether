import Phaser from 'phaser';
import { HISS_TIMING, TRIGGER_TIMING, findSynchronizedSlots, type CatSlot, type EncounterOutcome, type RoomSnapshot, type ServerMessage, type TriggerClue, type TriggerDirection, type TriggerKind, type TriggerSilhouette } from '@qiqihar/shared';
import { attemptSlotFeedback, encounterSlotFeedback, type SlotFeedback } from './slotFeedback';

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
// Render the 64px source art at native scale. Fractional downscaling drops pixel
// clusters before the browser enlarges the canvas and makes faces look muddy.
const catScale = [1, 1, 1, 1] as const;
const CAT_BASE_Y = 124;
const TRIGGER_BASE_Y = 194;
const triggerLanes = [86, 160, 234] as const;
const catPoses = ['idle', 'anticipate', 'hiss', 'recover', 'side_eye', 'walk', 'meow', 'boop', 'surprised'] as const;
type CatPose = typeof catPoses[number];

export class BootScene extends Phaser.Scene {
  private catSprites: Phaser.GameObjects.Image[] = [];
  private markers: Phaser.GameObjects.Arc[] = [];
  private resetTimers: Phaser.Time.TimerEvent[] = [];
  private currentPoses: CatPose[] = ['idle', 'idle', 'idle', 'idle'];
  private localSlot: CatSlot | undefined;
  private synchronizedSlots = new Set<CatSlot>();
  private slotFeedback = new Map<CatSlot, SlotFeedback>();
  private triggerShape!: Phaser.GameObjects.Graphics;
  private triggerSprite!: Phaser.GameObjects.Image;
  private triggerLabel!: Phaser.GameObjects.Text;
  private currentTriggerKind: TriggerKind | undefined;
  private currentTriggerDirection: TriggerDirection = 'left';
  private currentTriggerX: number = triggerLanes[1];

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
    for (const trigger of ['dog', 'cat-mom', 'stranger', 'vacuum-mom'] as const) {
      this.load.image(`trigger-${trigger}`, `/assets/triggers/${trigger}.png`);
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#b9ad9a');
    this.add.rectangle(160, 55, 320, 110, 0xcfc4b2).setStrokeStyle(1, 0xa99a86);
    this.add.rectangle(160, 155, 320, 90, 0x8f7e6d);
    // Visitors stay behind the kittens so the core four-player silhouettes remain readable.
    this.triggerShape = this.add.graphics().setDepth(0.5).setVisible(false);
    this.triggerSprite = this.add.image(0, 0, 'trigger-dog').setOrigin(0.5, 1).setDepth(0.5).setVisible(false);
    this.triggerLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#3b302b', backgroundColor: '#f5e6cc', padding: { x: 3, y: 2 },
    }).setOrigin(0.5).setDepth(3).setVisible(false);
    cats.forEach((_, index) => {
      const x = catX[index]!;
      const marker = this.add.circle(x, CAT_BASE_Y, 20, 0xf5e6cc, 0.18).setStrokeStyle(1, 0x6d5d51, 0.45).setDepth(1);
      const sprite = this.add.image(x, CAT_BASE_Y, `cat-${index}-idle`).setOrigin(0.5, 1).setScale(catScale[index]!).setDepth(1);
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
    if (message.type === 'trigger_cue') this.playTriggerCue(message.encounterId, message.direction, message.silhouette);
    if (message.type === 'trigger_clue') this.playTriggerClue(message.encounterId, message.direction, message.silhouette, message.clue);
    if (message.type === 'trigger_revealed') this.revealTrigger(message.encounterId, message.kind, message.direction);
    if (message.type === 'encounter_result') this.playEncounterResult(message);
    if (message.type === 'player_moved') this.moveCat(message.slot, message.x);
    if (message.type === 'social_action') this.playMeow(message.slot);
    if (message.type === 'interaction') this.playBoop(message.fromSlot, message.toSlot);
    if (message.type === 'chaos_event') message.affectedSlots.forEach((slot) => this.playAchoo(slot));
    if (message.type === 'room_result' && message.result !== 'win') this.playTimeout();
  }

  private triggerX(encounterId: number, direction: TriggerDirection): number {
    const directionOffset = direction === 'left' ? 0 : 1;
    return triggerLanes[(encounterId + directionOffset) % triggerLanes.length]!;
  }

  private triggerLabelCopy(kind: TriggerKind): string {
    const chinese = document.documentElement.lang === 'zh-CN';
    if (kind === 'cat-mom') return chinese ? '妈妈！' : 'MAMA';
    if (kind === 'dog') return chinese ? '狗！' : 'DOG!';
    if (kind === 'vacuum-mom') return chinese ? '假妈妈？！' : 'FAKE MAMA?!';
    return chinese ? '陌生人！' : 'STRANGER!';
  }

  private drawSilhouette(silhouette: TriggerSilhouette, clue?: TriggerClue): void {
    this.triggerShape.clear().fillStyle(0x3f3935, 0.78).lineStyle(1, 0x241f1d, 0.65);
    if (silhouette === 'catlike') {
      this.triggerShape
        .fillEllipse(2, 5, 44, 22).fillCircle(-15, -8, 11)
        .fillTriangle(-24, -12, -18, -25, -12, -14)
        .fillTriangle(-17, -15, -8, -25, -7, -11)
        .lineStyle(5, 0x3f3935, 0.78)
        .lineBetween(22, 4, 30, -2)
        .lineBetween(30, -2, 31, -11)
        .lineBetween(31, -11, 25, -20);
    } else if (silhouette === 'tall') {
      this.triggerShape
        .fillCircle(0, -31, 8).fillRoundedRect(-10, -24, 20, 34, 5)
        .fillRect(-9, 7, 7, 17).fillRect(3, 7, 7, 17);
    } else {
      this.triggerShape
        .fillEllipse(1, 6, 48, 20).fillCircle(-21, -2, 10)
        .fillTriangle(-29, -7, -24, -19, -18, -8)
        .fillRect(-14, 11, 7, 12).fillRect(12, 11, 7, 12);
    }

    if (!clue) return;
    this.triggerShape.lineStyle(2, clue === 'warped-bell' ? 0xd46b4d : 0xf2cf78, 0.95).fillStyle(0xf2cf78, 0.92);
    if (clue === 'scratching') {
      [-7, 0, 7].forEach((x) => this.triggerShape.beginPath().moveTo(x, -18).lineTo(x + 6, -28).strokePath());
    } else if (clue === 'footsteps') {
      this.triggerShape.fillEllipse(-15, 18, 7, 11).fillEllipse(13, 22, 7, 11);
    } else {
      this.triggerShape.fillTriangle(-7, -29, 7, -29, 10, -16).fillCircle(2, -14, 3);
      if (clue === 'warped-bell') {
        this.triggerShape
          .fillStyle(0xd46b4d, 0.95).fillRect(-15, -24, 4, 4).fillRect(12, -20, 3, 3)
          .lineStyle(2, 0xd46b4d, 0.9).beginPath().moveTo(-19, -10).lineTo(-12, -7).lineTo(-18, -3).strokePath();
      }
    }
  }

  private playTriggerCue(encounterId: number, direction: TriggerDirection, silhouette: TriggerSilhouette): void {
    this.tweens.killTweensOf([this.triggerShape, this.triggerSprite, this.triggerLabel]);
    this.currentTriggerKind = undefined;
    this.currentTriggerDirection = direction;
    this.currentTriggerX = this.triggerX(encounterId, direction);
    this.triggerSprite.clearTint().setAlpha(1).setAngle(0).setVisible(false);
    const fromX = direction === 'left' ? 10 : 310;
    const targetX = this.currentTriggerX;
    this.drawSilhouette(silhouette);
    this.triggerShape.setPosition(fromX, 169).setVisible(true);
    this.triggerLabel.setText('… ?').setPosition(fromX, 142).setVisible(true);
    this.catSprites.forEach((sprite, slot) => {
      if (!sprite.active) return;
      this.tweens.killTweensOf(sprite);
      this.setPose(slot as CatSlot, 'anticipate');
      sprite.setScale(catScale[slot]!).setAngle(0).setY(CAT_BASE_Y);
      if (this.motionEnabled()) {
        this.tweens.add({
          targets: sprite,
          scaleX: catScale[slot]! * 1.03,
          scaleY: catScale[slot]! * 0.94,
          duration: 180,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.InOut',
        });
      }
    });
    if (this.motionEnabled()) {
      this.tweens.add({ targets: [this.triggerShape, this.triggerLabel], x: targetX, duration: TRIGGER_TIMING.silhouetteMs - 50, ease: 'Sine.Out' });
    } else {
      this.triggerShape.setX(targetX);
      this.triggerLabel.setX(targetX);
    }
  }

  private playTriggerClue(
    encounterId: number,
    direction: TriggerDirection,
    silhouette: TriggerSilhouette,
    clue: TriggerClue,
  ): void {
    this.currentTriggerDirection = direction;
    this.currentTriggerX = this.triggerX(encounterId, direction);
    this.tweens.killTweensOf([this.triggerShape, this.triggerLabel]);
    this.drawSilhouette(silhouette, clue);
    this.triggerShape.setPosition(this.currentTriggerX, 169).setScale(1).setVisible(true);
    const clueCopy: Record<TriggerClue, string> = {
      scratching: 'skrr…', footsteps: 'tap · tap', bell: '♪ …', 'warped-bell': '♪ … bzz',
    };
    this.triggerLabel.setText(clueCopy[clue]).setPosition(this.currentTriggerX, 137).setVisible(true);
    if (this.motionEnabled()) {
      this.tweens.add({ targets: [this.triggerShape, this.triggerLabel], scale: 1.08, duration: 100, yoyo: true, ease: 'Sine.InOut' });
    }
  }

  private revealTrigger(encounterId: number, kind: TriggerKind, direction: TriggerDirection): void {
    this.tweens.killTweensOf([this.triggerShape, this.triggerSprite, this.triggerLabel]);
    const x = this.triggerX(encounterId, direction);
    const fromX = direction === 'left' ? -24 : 344;
    this.currentTriggerKind = kind;
    this.currentTriggerDirection = direction;
    this.currentTriggerX = x;
    this.triggerShape.clear().setVisible(false);
    this.triggerSprite
      .setTexture(`trigger-${kind}`)
      .setPosition(this.motionEnabled() ? fromX : x, TRIGGER_BASE_Y)
      // 64 * 1.5 = 96px, avoiding the soft fractional resampling from 1.3 / 1.4.
      .setScale(1.5)
      .setFlipX(direction === 'left')
      .setAlpha(1)
      .setAngle(0)
      .clearTint()
      .setVisible(true);
    this.triggerLabel
      .setText(this.triggerLabelCopy(kind))
      .setPosition(x, 108)
      .setScale(1)
      .setVisible(encounterId <= 2);
    if (this.motionEnabled()) {
      const duration = kind === 'dog' ? 180 : kind === 'cat-mom' ? 280 : kind === 'vacuum-mom' ? 320 : 360;
      this.tweens.add({ targets: this.triggerSprite, x, duration, ease: kind === 'dog' ? 'Back.Out' : 'Sine.Out' });
      if (kind === 'dog') {
        this.tweens.add({ targets: this.triggerSprite, y: 185, duration: 90, yoyo: true, repeat: 1, ease: 'Quad.Out' });
      } else if (kind === 'cat-mom') {
        this.tweens.add({ targets: this.triggerSprite, angle: direction === 'left' ? 2 : -2, duration: 150, yoyo: true, ease: 'Sine.InOut' });
      } else if (kind === 'vacuum-mom') {
        this.tweens.add({
          targets: this.triggerSprite,
          angle: direction === 'left' ? 3 : -3,
          duration: 80,
          yoyo: true,
          repeat: 3,
          ease: 'Sine.InOut',
        });
      } else {
        this.tweens.add({ targets: this.triggerSprite, scaleY: 0.91, duration: 130, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
      }
      this.cameras.main.flash(100, 245, 230, 200, false);
    }
  }

  private playEncounterResult(message: Extract<ServerMessage, { type: 'encounter_result' }>): void {
    this.resetTimers.forEach((timer) => timer.remove(false));
    this.resetTimers = [];
    this.synchronizedSlots = message.outcome === 'correct_hold'
      ? new Set([0, 1, 2, 3] as const)
      : new Set(findSynchronizedSlots(message.events.map((event) => ({
        slot: event.slot, startMs: event.activeStartMs, endMs: event.activeEndMs,
      })), TRIGGER_TIMING.requiredOverlapMs));
    this.animateTriggerResult(message.outcome);
    this.setSlotFeedback(encounterSlotFeedback(message, this.synchronizedSlots));
    if (message.outcome === 'synced_threat') {
      this.catSprites.forEach((_, slot) => this.setPose(slot as CatSlot, 'hiss').setScale(catScale[slot]!));
      if (this.motionEnabled()) {
        this.cameras.main.flash(220, 255, 240, 190);
        this.cameras.main.shake(260, 0.008);
        this.confetti();
      }
      return;
    }
    this.resetCats();
    const acted = new Set(message.events.map((event) => event.slot));
    if (message.outcome === 'correct_hold') {
      this.catSprites.forEach((sprite, slot) => {
        this.setPose(slot as CatSlot, 'idle');
        if (this.motionEnabled()) this.tweens.add({ targets: sprite, y: CAT_BASE_Y - 4, duration: 130, yoyo: true });
      });
    } else if (message.outcome === 'false_alarm') {
      this.catSprites.forEach((_, slot) => this.setPose(slot as CatSlot, acted.has(slot as CatSlot) ? 'recover' : 'side_eye'));
    } else if (message.outcome === 'jumped_the_gun') {
      this.catSprites.forEach((_, slot) => this.setPose(slot as CatSlot, message.earlySlots.includes(slot as CatSlot) ? 'surprised' : 'side_eye'));
    } else if (message.outcome === 'missed_threat') {
      this.catSprites.forEach((sprite, slot) => {
        if (message.missingSlots.includes(slot as CatSlot)) {
          this.setPose(slot as CatSlot, 'surprised');
          if (this.motionEnabled()) this.tweens.add({ targets: sprite, y: CAT_BASE_Y - 4, duration: 120, yoyo: true, repeat: 2 });
        } else this.setPose(slot as CatSlot, 'side_eye');
      });
    } else {
      this.catSprites.forEach((_, slot) => this.setPose(slot as CatSlot, 'recover'));
    }
  }

  private animateTriggerResult(outcome: EncounterOutcome): void {
    if (!this.triggerSprite.visible || !this.currentTriggerKind) return;
    this.tweens.killTweensOf([this.triggerSprite, this.triggerLabel]);
    const enteredFromLeft = this.currentTriggerDirection === 'left';
    const edgeX = enteredFromLeft ? -24 : 344;
    const inwardX = Math.max(54, Math.min(266, this.currentTriggerX + (enteredFromLeft ? 22 : -22)));

    if (!this.motionEnabled()) {
      if (outcome === 'synced_threat') {
        this.triggerSprite.setVisible(false);
        this.triggerLabel.setVisible(false);
      } else if (outcome === 'correct_hold') {
        this.triggerSprite.setX(inwardX).setTint(0xe8f3d7);
      } else if (outcome === 'false_alarm') {
        this.triggerSprite.setX(this.currentTriggerX + (enteredFromLeft ? -24 : 24)).setTint(0xffd4c4);
      }
      return;
    }

    if (outcome === 'synced_threat') {
      this.tweens.add({
        targets: [this.triggerSprite, this.triggerLabel],
        x: edgeX,
        alpha: 0,
        duration: this.currentTriggerKind === 'dog' ? 260 : 420,
        ease: 'Quad.In',
        onComplete: () => {
          this.triggerSprite.setVisible(false).setAlpha(1);
          this.triggerLabel.setVisible(false).setAlpha(1);
        },
      });
      return;
    }

    if (outcome === 'correct_hold') {
      this.tweens.add({ targets: this.triggerSprite, x: inwardX, y: 190, duration: 320, ease: 'Sine.Out' });
      this.tweens.add({ targets: this.triggerSprite, angle: enteredFromLeft ? 2 : -2, duration: 150, yoyo: true, repeat: 1 });
      return;
    }

    if (outcome === 'false_alarm') {
      this.triggerSprite.setTint(0xffd4c4);
      this.tweens.add({ targets: this.triggerSprite, x: this.currentTriggerX + (enteredFromLeft ? -28 : 28), angle: enteredFromLeft ? -5 : 5, duration: 180, ease: 'Back.Out' });
      this.tweens.add({ targets: this.triggerSprite, alpha: 0.55, duration: 90, yoyo: true, repeat: 2 });
      return;
    }

    if (outcome === 'missed_threat') {
      this.tweens.add({ targets: this.triggerSprite, x: inwardX, duration: 220, yoyo: true, ease: 'Sine.InOut' });
      return;
    }

    this.tweens.add({
      targets: this.triggerSprite,
      angle: enteredFromLeft ? -4 : 4,
      x: this.triggerSprite.x + (enteredFromLeft ? 4 : -4),
      duration: 80,
      yoyo: true,
      repeat: 2,
    });
  }

  private applyRoomState(state: RoomSnapshot, localSlot?: CatSlot): void {
    this.localSlot = localSlot;
    if (state.phase === 'playing' || state.phase === 'waiting') {
      this.synchronizedSlots.clear();
      this.slotFeedback.clear();
    }
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
      if (this.motionEnabled()) this.tweens.add({ targets: sprite, y: CAT_BASE_Y + 2, duration: HISS_TIMING.recoverMs, ease: 'Sine.Out' });
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
    if (this.motionEnabled()) this.tweens.add({ targets: sprite, y: CAT_BASE_Y - 5, duration: 100, yoyo: true, ease: 'Quad.Out' });
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
      y: CAT_BASE_Y - 8,
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
    this.setSlotFeedback(attemptSlotFeedback(message, this.synchronizedSlots));
    if (message.success) {
      this.catSprites.forEach((sprite, slot) => this.setPose(slot as CatSlot, 'hiss').setScale(catScale[slot]!));
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
            if (this.motionEnabled()) this.tweens.add({ targets: sprite, y: CAT_BASE_Y - 4, duration: 120, yoyo: true, repeat: 2 });
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
      if (this.motionEnabled()) sprite.setAngle(slot % 2 === 0 ? -9 : 9).setY(CAT_BASE_Y + 4);
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
      const feedback = this.slotFeedback.get(slot as CatSlot);
      const danger = feedback?.tone === 'danger';
      const warning = feedback?.tone === 'warning';
      marker.setFillStyle(
        danger ? 0xd95747 : warning ? 0xe3a044 : synchronized ? 0x8fd19a : 0xf5e6cc,
        danger ? 0.5 : warning ? 0.38 : synchronized ? 0.42 : 0.18,
      );
      marker.setStrokeStyle(
        danger || warning || synchronized || local ? 2 : 1,
        danger ? 0x8c241c : warning ? 0x91561e : synchronized ? 0x2f7d45 : local ? 0xffe08a : 0x6d5d51,
        danger || warning || synchronized || local ? 1 : 0.45,
      );
    });
  }

  private setSlotFeedback(feedback: Map<CatSlot, SlotFeedback>): void {
    this.slotFeedback = feedback;
    this.markers.forEach((marker, slot) => {
      this.tweens.killTweensOf(marker);
      marker.setScale(1);
      if (feedback.get(slot as CatSlot)?.tone === 'danger' && this.motionEnabled()) {
        this.tweens.add({ targets: marker, scale: 1.12, duration: 110, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
      }
    });
    this.updateMarkerStyles();
  }

  private setPose(slot: CatSlot, pose: CatPose): Phaser.GameObjects.Image {
    this.currentPoses[slot] = pose;
    return this.catSprites[slot]!
      .clearTint()
      .setTexture(`cat-${slot}-${pose}`)
      .setScale(catScale[slot])
      .setAngle(0)
      .setFlipX(false)
      .setY(CAT_BASE_Y);
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
        y: 204,
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
