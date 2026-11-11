export const GROUPS = ["Arms", "Chest", "Shoulders", "Back", "Abs"];

const exercise = (id, name, groups, mode = "weighted") => ({ id, name, groups, mode });

export const EXERCISES = [
  exercise("bench-press", "Bench press", ["Chest"]),
  exercise("incline-dumbbell-press", "Incline dumbbell press", ["Chest"]),
  exercise("triceps-pressdown", "Cable triceps pressdown", ["Arms"]),
  exercise("dumbbell-curl", "Dumbbell curl", ["Arms"]),
  exercise("lateral-raise", "Dumbbell lateral raise", ["Shoulders"]),
  exercise("lat-pulldown", "Lat pulldown", ["Back"]),
  exercise("chest-supported-row", "Chest-supported dumbbell row", ["Back"]),
  exercise("hammer-curl", "Dumbbell hammer curl", ["Arms"]),
  exercise("overhead-triceps-extension", "Overhead cable triceps extension", ["Arms"]),
  exercise("reverse-crunch", "Reverse crunch", ["Abs"], "bodyweight"),
  exercise("shoulder-press", "Seated dumbbell shoulder press", ["Shoulders"]),
  exercise("dumbbell-bench-press", "Flat dumbbell press", ["Chest"]),
  exercise("preacher-curl", "Preacher curl", ["Arms"]),
  exercise("cable-crunch", "Cable crunch", ["Abs"]),
  exercise("push-up", "Push-up", ["Chest"], "bodyweight"),
  exercise("elevated-push-up", "Feet-elevated push-up", ["Chest"], "bodyweight"),
  exercise("close-grip-push-up", "Close-grip push-up", ["Arms"], "bodyweight"),
  exercise("pike-push-up", "Pike push-up", ["Shoulders"], "bodyweight"),
  exercise("pull-up", "Pull-up", ["Back"], "bodyweight"),
  exercise("chin-up", "Chin-up", ["Back", "Arms"], "bodyweight"),
  exercise("inverted-row", "Inverted row", ["Back"], "bodyweight"),
  exercise("bodyweight-triceps-extension", "Bodyweight triceps extension", ["Arms"], "bodyweight"),
  exercise("dip", "Parallel-bar dip", ["Chest", "Arms"], "bodyweight"),
  exercise("dead-bug", "Dead bug", ["Abs"], "bodyweight"),
];

export const BUILT_IN = new Map(EXERCISES.map(item => [item.id, item]));

function prescription(id, sets, min, max, alternativeId, alternativeMin, alternativeMax, alternativeNote = "") {
  const alternative = alternativeId ? { id: alternativeId, min: alternativeMin, max: alternativeMax, note: alternativeNote } : null;
  return { id, sets, min, max, alternative };
}

export const PLAN = [
  {
    day: "A", name: "Chest & triceps", focus: ["Chest", "Arms", "Shoulders"],
    lifts: [
      prescription("bench-press", 3, 3, 5, "push-up", 6, 12),
      prescription("incline-dumbbell-press", 2, 8, 12, "elevated-push-up", 6, 12),
      prescription("triceps-pressdown", 3, 10, 15, "close-grip-push-up", 6, 12),
      prescription("dumbbell-curl", 2, 8, 12, "chin-up", 4, 8, "Assisted as needed"),
      prescription("lateral-raise", 2, 12, 20, null),
    ],
  },
  {
    day: "B", name: "Back & biceps", focus: ["Back", "Arms", "Abs"],
    lifts: [
      prescription("lat-pulldown", 3, 8, 12, "pull-up", 4, 8, "Assisted as needed"),
      prescription("chest-supported-row", 2, 8, 12, "inverted-row", 6, 12),
      prescription("hammer-curl", 3, 8, 12, "chin-up", 4, 8, "Assisted as needed"),
      prescription("overhead-triceps-extension", 2, 10, 15, "bodyweight-triceps-extension", 6, 12),
      prescription("reverse-crunch", 2, 10, 15, "dead-bug", 8, 12, "Per side"),
    ],
  },
  {
    day: "C", name: "Shoulders & arms", focus: ["Shoulders", "Arms", "Chest", "Abs"],
    lifts: [
      prescription("shoulder-press", 3, 6, 10, "pike-push-up", 6, 12),
      prescription("dumbbell-bench-press", 3, 8, 12, "dip", 5, 10, "Assisted as needed"),
      prescription("lateral-raise", 2, 12, 20, null),
      prescription("preacher-curl", 2, 10, 15, "chin-up", 4, 8, "Assisted as needed"),
      prescription("triceps-pressdown", 2, 10, 15, "close-grip-push-up", 6, 12),
      prescription("cable-crunch", 2, 10, 15, "reverse-crunch", 10, 15),
    ],
  },
];

export const BENCH_REFERENCE = {
  exerciseId: "bench-press",
  mode: "weighted",
  sets: Array.from({ length: 3 }, () => ({ weightKg: 60, reps: 3 })),
};

export const METRICS = {
  estimate: { title: "Estimated 1RM", unit: "kg" },
  volume: { title: "External volume", unit: "kg" },
  bestReps: { title: "Best set", unit: "reps" },
  reps: { title: "Total reps", unit: "reps" },
};

const DAY_MS = 86_400_000;

export function localDate(now = new Date()) {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

export function addDays(date, amount) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + amount * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
}

export function mondayOf(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function normalizeName(name) {
  return name.trim().normalize("NFKC").toLowerCase().replace(/[-\s]+/g, " ");
}

export function sortWorkouts(workouts) {
  return [...workouts].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function epley(weightKg, reps) {
  return weightKg > 0 && reps > 0 ? weightKg * (1 + reps / 30) : null;
}

export function summarizeSets(sets, mode) {
  const reps = sets.reduce((total, set) => total + set.reps, 0);
  const bestReps = sets.reduce((best, set) => Math.max(best, set.reps), 0);
  const weighted = sets.filter(set => set.weightKg > 0);
  const volume = weighted.length ? weighted.reduce((total, set) => total + set.weightKg * set.reps, 0) : null;
  const estimate = mode === "weighted" && weighted.length
    ? Math.max(...weighted.map(set => epley(set.weightKg, set.reps)))
    : null;
  return { estimate, volume, bestReps, reps, sets: sets.length };
}

export function recordMetrics(mode) {
  return mode === "weighted" ? ["estimate", "volume"] : ["bestReps", "reps"];
}

export function isBetter(value, prior) {
  return value != null && prior != null && value - prior > 1e-8;
}

export function startingReference(exerciseId, mode) {
  if (exerciseId !== BENCH_REFERENCE.exerciseId || mode !== BENCH_REFERENCE.mode) return null;
  return summarizeSets(BENCH_REFERENCE.sets, mode);
}

export function exerciseHistory(workouts, exerciseId, mode) {
  const reference = startingReference(exerciseId, mode);
  const best = { ...reference };
  const metrics = recordMetrics(mode);
  const history = [];

  for (const workout of sortWorkouts(workouts)) {
    for (const entry of workout.entries) {
      if (entry.exerciseId !== exerciseId || entry.mode !== mode) continue;
      const values = summarizeSets(entry.sets, mode);
      const records = metrics.filter(key => isBetter(values[key], best[key]));
      for (const key of metrics) {
        if (best[key] == null || isBetter(values[key], best[key])) best[key] = values[key];
      }
      history.push({ workout, entry, values, records });
    }
  }
  return history;
}

function bestIn(rows, key) {
  return rows.reduce((best, row) => {
    const value = row.values[key];
    return value != null && (best == null || value > best) ? value : best;
  }, null);
}

function sumIn(rows, key) {
  const values = rows.map(row => row.values[key]).filter(value => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function compareRange(history, from, to) {
  const rows = history.filter(({ workout }) => workout.date >= from && workout.date <= to);
  return {
    sessions: new Set(rows.map(row => row.workout.id)).size,
    estimate: bestIn(rows, "estimate"),
    volume: sumIn(rows, "volume"),
    bestReps: bestIn(rows, "bestReps"),
    reps: sumIn(rows, "reps"),
    sets: sumIn(rows, "sets"),
  };
}

export function returningMetrics(history, returnDate, reference, mode) {
  const oldRows = history.filter(row => row.workout.date < returnDate);
  const currentRows = history.filter(row => row.workout.date >= returnDate);
  const latest = currentRows.at(-1);

  return recordMetrics(mode).map(key => {
    const previous = bestIn(oldRows, key);
    const baseline = reference?.[key] ?? null;
    const prior = previous ?? baseline;
    const comebackBest = bestIn(currentRows, key);
    const bestLogged = bestIn(history, key);
    const allTime = baseline != null && (bestLogged == null || baseline > bestLogged) ? baseline : bestLogged;
    return {
      key, prior, usesReference: previous == null && baseline != null,
      latest: latest?.values[key] ?? null, comebackBest, allTime,
      surpassed: isBetter(comebackBest, prior),
    };
  });
}

export function chartSeries(history, metric) {
  const byDay = new Map();
  const combine = metric === "volume" || metric === "reps" ? (a, b) => a + b : Math.max;

  for (const row of history) {
    const value = row.values[metric];
    if (value == null) continue;
    const { date } = row.workout;
    const existing = byDay.get(date);
    byDay.set(date, {
      date, value: existing ? combine(existing.value, value) : value,
      record: row.records.includes(metric) || Boolean(existing?.record),
    });
  }
  return [...byDay.values()];
}

export function scheduleFor(workouts, today, returnDate) {
  const sorted = sortWorkouts(workouts.filter(workout => workout.date <= today));
  const latest = sorted.at(-1);
  const rotationDays = new Map();

  for (const workout of sorted) {
    if (workout.date >= returnDate && (!rotationDays.has(workout.date) || workout.planDay)) {
      rotationDays.set(workout.date, workout.planDay);
    }
  }

  let dayIndex = 0;
  for (const day of rotationDays.values()) {
    const plannedIndex = PLAN.findIndex(item => item.day === day);
    dayIndex = ((plannedIndex === -1 ? dayIndex : plannedIndex) + 1) % PLAN.length;
  }

  const earliest = latest ? addDays(latest.date, 2) : today;
  return { nextDate: earliest > today ? earliest : today, dayIndex, latest };
}

export function plannedDay(date, schedule) {
  const offset = daysBetween(schedule.nextDate, date);
  return offset >= 0 && offset % 2 === 0 ? PLAN[(schedule.dayIndex + offset / 2) % PLAN.length] : null;
}

export function nextBenchTarget(entry) {
  const sets = entry?.sets ?? BENCH_REFERENCE.sets;
  const weight = sets[0]?.weightKg;
  const valid = sets.length === 3 && weight > 0 && sets.every(set => set.weightKg === weight && set.reps >= 3);
  if (!valid) return null;
  const reps = sets.map(set => Math.min(set.reps, 5));
  const lowest = Math.min(...reps);
  if (lowest === 5) return { weightKg: weight + 2.5, reps: [3, 3, 3] };
  reps[reps.indexOf(lowest)] += 1;
  return { weightKg: weight, reps };
}

function csvCell(value) {
  if (value == null) return '""';
  const raw = String(value);
  const safe = typeof value === "string" && /^(?:\s*[=+\-@]|[\t\r\n])/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function workoutCsv(workouts) {
  const rows = [["date", "workout_id", "plan_day", "muscle_groups", "exercise", "load_type", "set", "weight_kg", "reps", "set_estimated_1rm_kg", "set_volume_kg", "workout_notes"]];
  for (const workout of sortWorkouts(workouts)) {
    for (const entry of workout.entries) {
      for (const [index, set] of entry.sets.entries()) {
        const estimate = entry.mode === "weighted" ? epley(set.weightKg, set.reps) : null;
        rows.push([
          workout.date, workout.id, workout.planDay, workout.muscleGroups.join(" / "),
          entry.name, entry.mode, index + 1, set.weightKg, set.reps,
          estimate == null ? null : Math.round(estimate * 100) / 100,
          set.weightKg == null ? null : Math.round(set.weightKg * set.reps * 100) / 100, workout.notes,
        ]);
      }
    }
  }
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
