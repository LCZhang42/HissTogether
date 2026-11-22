#!/usr/bin/env node

const ACTIVE_MS = 700;
const THRESHOLDS = [450, 500, 550];
const TRIALS = Number(process.env.TRIALS ?? 50_000);

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function normal(random, mean = 0, standardDeviation = 1) {
  const first = Math.max(Number.EPSILON, random());
  const second = random();
  return mean + standardDeviation * Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function uniform(random, minimum, maximum) {
  return minimum + random() * (maximum - minimum);
}

const scenarios = [
  {
    name: '4 humans · voice rhythm',
    sample(random) {
      const rtts = Array.from({ length: 4 }, () => uniform(random, 30, 90));
      const accepted = rtts.map((rtt) => normal(random, 560, 45) + rtt / 2 + normal(random, 0, 8));
      return { accepted, rtts };
    },
  },
  {
    name: '4 humans · visual only',
    sample(random) {
      const rtts = Array.from({ length: 4 }, () => uniform(random, 30, 110));
      const accepted = rtts.map((rtt) => normal(random, 570, 75) + rtt / 2 + normal(random, 0, 12));
      return { accepted, rtts };
    },
  },
  {
    name: '4 humans · one 220ms RTT',
    sample(random) {
      const rtts = [35, 60, 100, 220];
      const accepted = rtts.map((rtt) => normal(random, 560, 45) + rtt / 2 + normal(random, 0, 25));
      return { accepted, rtts };
    },
  },
  {
    name: '1 human + 3 adaptive bots',
    sample(random) {
      const humanRtt = uniform(random, 35, 180);
      const humanAccepted = normal(random, 580, 100) + humanRtt / 2 + normal(random, 0, 18);
      const bots = humanAccepted < 650
        ? [humanAccepted + 40, humanAccepted + 80, humanAccepted + 120]
        : [650, 650, 650];
      return { accepted: [humanAccepted, ...bots], rtts: [humanRtt, 0, 0, 0] };
    },
  },
];

function simulate(scenario, seed) {
  const random = mulberry32(seed);
  const rows = Object.fromEntries(THRESHOLDS.map((threshold) => [threshold, { successes: 0 }]));
  let totalSpreadMs = 0;
  let highestRttWasLatest = 0;
  let compensatedSuccesses = 0;
  let compensatedHighestRttWasLatest = 0;

  for (let trial = 0; trial < TRIALS; trial += 1) {
    const { accepted, rtts } = scenario.sample(random);
    const earliest = Math.min(...accepted);
    const latest = Math.max(...accepted);
    const spreadMs = latest - earliest;
    const overlapMs = Math.max(0, ACTIVE_MS - spreadMs);
    totalSpreadMs += spreadMs;
    if (accepted.indexOf(latest) === rtts.indexOf(Math.max(...rtts))) highestRttWasLatest += 1;
    const compensated = accepted.map((value, index) => value - Math.min(80, rtts[index] / 2));
    const compensatedLatest = Math.max(...compensated);
    const compensatedSpreadMs = compensatedLatest - Math.min(...compensated);
    if (ACTIVE_MS - compensatedSpreadMs >= 500) compensatedSuccesses += 1;
    if (compensated.indexOf(compensatedLatest) === rtts.indexOf(Math.max(...rtts))) compensatedHighestRttWasLatest += 1;
    for (const threshold of THRESHOLDS) {
      if (overlapMs >= threshold) rows[threshold].successes += 1;
    }
  }

  return {
    name: scenario.name,
    meanSpreadMs: totalSpreadMs / TRIALS,
    highestRttLatestRate: highestRttWasLatest / TRIALS,
    compensatedSuccessRate: compensatedSuccesses / TRIALS,
    compensatedHighestRttLatestRate: compensatedHighestRttWasLatest / TRIALS,
    successRates: Object.fromEntries(THRESHOLDS.map((threshold) => [threshold, rows[threshold].successes / TRIALS])),
  };
}

const results = scenarios.map((scenario, index) => simulate(scenario, 0x51a7f00d + index * 997));
console.log(`# Trigger timing simulation (${TRIALS.toLocaleString()} trials per scenario)`);
console.log('');
console.log('| Scenario | Mean spread | 450ms overlap | 500ms overlap | 550ms overlap | Highest-RTT player latest |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const result of results) {
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  console.log(`| ${result.name} | ${result.meanSpreadMs.toFixed(0)}ms | ${percent(result.successRates[450])} | ${percent(result.successRates[500])} | ${percent(result.successRates[550])} | ${percent(result.highestRttLatestRate)} |`);
}
console.log('');
console.log('| Scenario | Raw 500ms success | Capped-compensation success | Raw high-RTT latest | Compensated high-RTT latest |');
console.log('| --- | ---: | ---: | ---: | ---: |');
for (const result of results) {
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  console.log(`| ${result.name} | ${percent(result.successRates[500])} | ${percent(result.compensatedSuccessRate)} | ${percent(result.highestRttLatestRate)} | ${percent(result.compensatedHighestRttLatestRate)} |`);
}
console.log('');
console.log('Model notes: reaction and network jitter are seeded normal distributions; RTT contributes half its value as outbound delay.');
console.log('Compensation subtracts at most 80ms from the estimated outbound delay and never moves input before reveal.');
console.log('This is a balance model, not a substitute for the physical-device sessions in docs/playtest-runbook.md.');
