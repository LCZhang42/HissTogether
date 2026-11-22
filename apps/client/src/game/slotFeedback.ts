import {
  findTimingOutliers,
  type CatSlot,
  type HissInterval,
  type ServerMessage,
} from '@qiqihar/shared';

export type SlotFeedbackReason = 'fast' | 'slow' | 'missing' | 'wrong' | 'early' | 'off-beat';
export interface SlotFeedback {
  tone: 'danger' | 'warning';
  reason: SlotFeedbackReason;
}

type EncounterResultMessage = Extract<ServerMessage, { type: 'encounter_result' }>;
type AttemptResultMessage = Extract<ServerMessage, { type: 'attempt_result' }>;

const slots = [0, 1, 2, 3] as const;

function intervals(events: readonly AttemptResultMessage['events'][number][]): HissInterval[] {
  return events.map((event) => ({
    slot: event.slot,
    startMs: event.activeStartMs,
    endMs: event.activeEndMs,
  }));
}

function timingFailureFeedback(
  events: readonly AttemptResultMessage['events'][number][],
  synchronizedSlots: ReadonlySet<CatSlot>,
): Map<CatSlot, SlotFeedback> {
  const feedback = new Map<CatSlot, SlotFeedback>();
  for (const outlier of findTimingOutliers(intervals(events))) {
    feedback.set(outlier.slot, { tone: 'danger', reason: outlier.timing });
  }
  for (const event of events) {
    if (!feedback.has(event.slot) && !synchronizedSlots.has(event.slot)) {
      feedback.set(event.slot, { tone: 'warning', reason: 'off-beat' });
    }
  }
  return feedback;
}

export function encounterSlotFeedback(
  result: EncounterResultMessage,
  synchronizedSlots: ReadonlySet<CatSlot>,
): Map<CatSlot, SlotFeedback> {
  if (result.correct) return new Map();
  if (result.outcome === 'desynced_threat') return timingFailureFeedback(result.events, synchronizedSlots);

  const feedback = new Map<CatSlot, SlotFeedback>();
  if (result.outcome === 'missed_threat') {
    result.missingSlots.forEach((slot) => feedback.set(slot, { tone: 'danger', reason: 'missing' }));
    result.events.forEach((event) => {
      if (!synchronizedSlots.has(event.slot)) feedback.set(event.slot, { tone: 'warning', reason: 'off-beat' });
    });
  } else if (result.outcome === 'false_alarm') {
    result.events.forEach((event) => feedback.set(event.slot, { tone: 'danger', reason: 'wrong' }));
  } else if (result.outcome === 'jumped_the_gun') {
    result.earlySlots.forEach((slot) => feedback.set(slot, { tone: 'danger', reason: 'early' }));
    result.events.forEach((event) => {
      if (!feedback.has(event.slot) && !synchronizedSlots.has(event.slot)) {
        feedback.set(event.slot, { tone: 'warning', reason: 'off-beat' });
      }
    });
  }
  return feedback;
}

export function attemptSlotFeedback(
  result: AttemptResultMessage,
  synchronizedSlots: ReadonlySet<CatSlot>,
): Map<CatSlot, SlotFeedback> {
  if (result.success) return new Map();
  const actedSlots = new Set(result.events.map((event) => event.slot));
  if (actedSlots.size === slots.length) return timingFailureFeedback(result.events, synchronizedSlots);

  const feedback = new Map<CatSlot, SlotFeedback>();
  slots.filter((slot) => !actedSlots.has(slot))
    .forEach((slot) => feedback.set(slot, { tone: 'danger', reason: 'missing' }));
  result.events.forEach((event) => {
    if (!synchronizedSlots.has(event.slot)) feedback.set(event.slot, { tone: 'warning', reason: 'off-beat' });
  });
  return feedback;
}
