import { compensatedAcceptedAtMs, evaluateEncounter, intervalFromAcceptedHiss, parseClientMessage, triggerCategory, triggerClue, triggerKindForEncounter, triggerSilhouette } from '@qiqihar/shared';
import { describe, expect, it } from 'vitest';

function event(slot: 0 | 1 | 2 | 3, acceptedAtMs: number) {
  const interval = intervalFromAcceptedHiss(slot, acceptedAtMs);
  return { slot, acceptedAtMs, activeStartMs: interval.startMs, activeEndMs: interval.endMs };
}

describe('trigger encounters', () => {
  it('requires 500 ms overlap for a threat', () => {
    expect(evaluateEncounter(1, 'dog', [event(0, 0), event(1, 50), event(2, 100), event(3, 200)]))
      .toMatchObject({ outcome: 'synced_threat', correct: true, overlapMs: 500, startSpreadMs: 200 });
    expect(evaluateEncounter(1, 'dog', [event(0, 0), event(1, 50), event(2, 100), event(3, 201)]))
      .toMatchObject({ outcome: 'desynced_threat', correct: false, overlapMs: 499, startSpreadMs: 201 });
  });

  it('treats silence as correct only when cat mom appears', () => {
    expect(evaluateEncounter(2, 'cat-mom', [])).toMatchObject({ outcome: 'correct_hold', correct: true });
    expect(evaluateEncounter(1, 'dog', [])).toMatchObject({ outcome: 'missed_threat', correct: false });
  });

  it('rejects even a perfectly synchronized hiss at cat mom', () => {
    expect(evaluateEncounter(2, 'cat-mom', [event(0, 0), event(1, 0), event(2, 0), event(3, 0)]))
      .toMatchObject({ outcome: 'false_alarm', correct: false });
  });

  it('reports missing and early slots', () => {
    expect(evaluateEncounter(1, 'dog', [event(0, 0), event(1, 30), event(2, 60)]).missingSlots).toEqual([3]);
    expect(evaluateEncounter(1, 'dog', [event(2, -10)], [2]))
      .toMatchObject({ outcome: 'jumped_the_gun', earlySlots: [2] });
  });

  it('uses the six-wave night sequence with two teaching encounters first', () => {
    expect(triggerKindForEncounter(1)).toBe('dog');
    expect(triggerKindForEncounter(2)).toBe('cat-mom');
    expect(triggerKindForEncounter(3)).toBe('stranger');
    expect(triggerKindForEncounter(4)).toBe('vacuum-mom');
    expect(triggerKindForEncounter(5)).toBe('cat-mom');
    expect(triggerKindForEncounter(6)).toBe('vacuum-mom');
  });

  it('mixes the fake cat mom into the later threat pool', () => {
    expect(triggerKindForEncounter(4)).toBe('vacuum-mom');
    expect(triggerCategory('vacuum-mom')).toBe('threat');
    expect(evaluateEncounter(4, 'vacuum-mom', [event(0, 0), event(1, 0), event(2, 0), event(3, 0)]))
      .toMatchObject({ outcome: 'synced_threat', correct: true });
  });

  it('gives real and fake mom the same silhouette but subtly different clues', () => {
    expect(triggerSilhouette('cat-mom')).toBe('catlike');
    expect(triggerSilhouette('vacuum-mom')).toBe('catlike');
    expect(triggerClue('cat-mom')).toBe('bell');
    expect(triggerClue('vacuum-mom')).toBe('warped-bell');
    expect(triggerSilhouette('dog')).toBe('low');
    expect(triggerSilhouette('stranger')).toBe('tall');
  });

  it('caps client-estimated input compensation and never crosses the reveal boundary', () => {
    expect(compensatedAcceptedAtMs(1_200, 1_140, 1_000)).toBe(1_140);
    expect(compensatedAcceptedAtMs(1_200, 900, 1_000)).toBe(1_120);
    expect(compensatedAcceptedAtMs(1_050, 900, 1_000)).toBe(1_000);
    expect(compensatedAcceptedAtMs(1_200, undefined, 1_000)).toBe(1_200);
  });

  it('accepts a finite action timestamp and rejects malformed compensation data', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'action', seq: 1, action: 'hiss', estimatedServerTimeMs: 1_234 })))
      .toMatchObject({ estimatedServerTimeMs: 1_234 });
    expect(parseClientMessage(JSON.stringify({ type: 'action', seq: 1, action: 'hiss', estimatedServerTimeMs: 'soon' })))
      .toBeNull();
  });
});
