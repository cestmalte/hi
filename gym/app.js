import {
  GROUPS, EXERCISES, BUILT_IN, PLAN, BENCH_REFERENCE, METRICS,
  localDate, isDate, addDays, daysBetween, mondayOf, normalizeName, sortWorkouts,
  startingReference, exerciseHistory, recordMetrics, compareRange, returningMetrics,
  chartSeries, scheduleFor, plannedDay, nextBenchTarget, workoutCsv,
} from "./training.js";

const STORAGE = "cestmalte.gym.v1.";
const WORKOUT_KEY = `${STORAGE}workout.`;
const PAGES = new Set(["overview", "log", "progress", "plan"]);
const PROGRESS_VIEWS = { history: "History", compare: "Compare", returning: "Returning lifter" };
const NUMBER = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const dateOptions = {
  full: { weekday: "long", day: "numeric", month: "long" },
  short: { weekday: "short", day: "numeric", month: "short" },
  tile: { weekday: "short", day: "numeric" },
  stamp: { day: "numeric", month: "short", year: "numeric" },
  axis: { day: "numeric", month: "short" },
  weekday: { weekday: "short" },
};
const DATE = Object.fromEntries(Object.entries(dateOptions).map(([key, options]) => [
  key, new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }),
]));
const PR_LABELS = { estimate: "1RM PR", volume: "Volume PR", bestReps: "Set reps PR", reps: "Total reps PR" };
const EXERCISE_ALIASES = new Map([
  ["barbell bench press", "bench-press"], ["push ups", "push-up"], ["pushups", "push-up"],
  ["pull ups", "pull-up"], ["pullups", "pull-up"], ["dips", "dip"],
]);
const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const htmlEscapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value = "") => String(value).replace(/[&<>"']/g, char => htmlEscapes[char]);
const num = value => NUMBER.format(value);
const formatDate = (date, kind = "stamp") => DATE[kind].format(new Date(`${date}T00:00:00Z`));
const metricText = (value, key) => value == null ? "—" : `${num(value)} ${METRICS[key].unit}`;
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const progressId = (id, mode) => `${encodeURIComponent(id)}:${mode}`;
const idForWorkout = () => globalThis.crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

let storageNotice = "";
let toastTimer;
let chartObserver;
let currentPage = pageInHash() ?? "overview";
let progressView = "history";
let selectedExercise = progressId("bench-press", "weighted");
let selectedMetric = "estimate";
let workoutError = "";
let compareError = "";
let returnError = "";
let pickerOpen = false;
let exerciseQuery = "";
let editing = null;
let workouts = loadWorkouts();
let settings = readJson(`${STORAGE}settings`);
if (!isDate(settings?.returnDate)) {
  settings = { returnDate: localDate() };
  writeJson(`${STORAGE}settings`, settings);
}
let draft = readJson(`${STORAGE}draft`);
if (!draft?.id || !Array.isArray(draft.entries) || !draft.groupOverrides) draft = null;
if (draft && workouts.some(workout => workout.id === draft.id)) {
  draft = null;
  writeJson(`${STORAGE}draft`, null);
}
let ranges = weekRanges();

function pageInHash() {
  const page = location.hash.slice(1);
  return PAGES.has(page) ? page : null;
}

function notify(message, error = false) {
  clearTimeout(toastTimer);
  toast.classList.toggle("toast-error", error);
  toast.textContent = message;
  toastTimer = setTimeout(() => { toast.textContent = ""; }, error ? 6500 : 4000);
}

function setStorageNotice(message) {
  storageNotice = message;
  const notice = document.querySelector("#storage-notice");
  if (notice) {
    notice.textContent = message;
    notice.hidden = !message;
  }
  document.querySelectorAll(".storage-label").forEach(label => { label.hidden = Boolean(message); });
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    setStorageNotice("Some browser data could not be read. Check whether this browser allows local storage.");
    return null;
  }
}

function writeJson(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    setStorageNotice("Browser storage is unavailable or full. Changes could not be saved.");
    return false;
  }
}

function validSet(set) {
  return set && Number.isInteger(set.reps) && set.reps > 0
    && (set.weightKg === null || (Number.isFinite(set.weightKg) && set.weightKg > 0));
}

function loadWorkouts() {
  try {
    const saved = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(WORKOUT_KEY)) continue;
      const workout = readJson(key);
      const valid = workout && typeof workout.id === "string" && isDate(workout.date)
        && typeof workout.createdAt === "string" && typeof workout.updatedAt === "string"
        && Array.isArray(workout.muscleGroups) && typeof workout.notes === "string"
        && Array.isArray(workout.entries) && workout.entries.length > 0
        && workout.entries.every(entry => entry && typeof entry.exerciseId === "string" && typeof entry.name === "string"
          && Array.isArray(entry.groups) && ["weighted", "bodyweight"].includes(entry.mode)
          && Array.isArray(entry.sets) && entry.sets.length > 0 && entry.sets.every(validSet));
      if (valid) saved.push(workout);
      else setStorageNotice("A saved workout could not be read. Other workouts are still available.");
    }
    return sortWorkouts(saved);
  } catch {
    setStorageNotice("This browser did not grant access to local storage.");
    return [];
  }
}

function weekRanges(today = localDate()) {
  const monday = mondayOf(today);
  return { aFrom: addDays(monday, -28), aTo: addDays(today, -28), bFrom: monday, bTo: today };
}

function currentSchedule(today = localDate()) {
  return scheduleFor(workouts, today, settings.returnDate);
}

function createDraft() {
  return {
    id: idForWorkout(), date: localDate(), planDay: "",
    notes: "", groupOverrides: {}, entries: [],
  };
}

function activeDraft() {
  if (editing) return editing.draft;
  draft ??= createDraft();
  return draft;
}

function persistDraft() {
  if (!editing) writeJson(`${STORAGE}draft`, draft);
}

function selectedGroups(form) {
  const defaults = new Set(form.entries.flatMap(entry => entry.groups));
  return GROUPS.filter(group => form.groupOverrides[group] ?? defaults.has(group));
}

function draftSets(sets) {
  return sets.map(set => ({ weightKg: set.weightKg == null ? "" : String(set.weightKg), reps: String(set.reps) }));
}

function catalog() {
  const items = new Map(EXERCISES.map(item => [item.id, item]));
  for (const workout of workouts) {
    for (const entry of workout.entries) {
      if (!BUILT_IN.has(entry.exerciseId)) {
        items.set(entry.exerciseId, { id: entry.exerciseId, name: entry.name, mode: entry.mode, groups: entry.groups });
      }
    }
  }
  return items;
}

function recentExercise(id, date, fromDate) {
  for (let i = workouts.length - 1; i >= 0; i -= 1) {
    const workout = workouts[i];
    if (workout.date > date || (fromDate && workout.date < fromDate)) continue;
    const entry = workout.entries.find(item => item.exerciseId === id);
    if (entry) return entry;
  }
  return null;
}

function defaultPrescription(id) {
  for (const day of PLAN) {
    for (const lift of day.lifts) {
      if (lift.id === id) return { sets: lift.sets, reps: lift.min };
      if (lift.alternative?.id === id) return { sets: lift.sets, reps: lift.alternative.min };
    }
  }
  return { sets: 1, reps: "" };
}

function newEntry(item, date, prescription = defaultPrescription(item.id)) {
  const isBench = item.id === BENCH_REFERENCE.exerciseId;
  const fromDate = isBench && date >= settings.returnDate ? settings.returnDate : null;
  const last = recentExercise(item.id, date, fromDate);
  const reference = isBench ? BENCH_REFERENCE.sets : null;
  const source = last?.sets ?? reference;
  return {
    exerciseId: item.id, name: item.name, groups: [...(last?.groups ?? item.groups)],
    mode: last?.mode ?? item.mode,
    sets: source ? draftSets(source) : Array.from({ length: prescription.sets }, () => ({ weightKg: "", reps: String(prescription.reps) })),
  };
}

function workoutGroups(workout) {
  return workout.muscleGroups.join(" · ");
}

function displaySets(entry) {
  const chunks = [];
  for (const { weightKg, reps } of entry.sets) {
    const last = chunks.at(-1);
    if (last && last.weightKg === weightKg && last.reps === reps) last.count += 1;
    else chunks.push({ weightKg, reps, count: 1 });
  }
  return chunks.map(({ weightKg, reps, count }) => {
    if (weightKg == null) return count === 1 ? `${reps} reps` : `${count} × ${reps} reps`;
    const weight = `${entry.mode === "bodyweight" ? "+" : ""}${num(weightKg)} kg`;
    return `${weight} × ${reps}${count === 1 ? "" : ` × ${count}`}`;
  }).join(" · ");
}

function heading(title, subtitle = "", action = "") {
  return `<header class="page-heading"><div>${subtitle ? `<p class="eyebrow">${esc(subtitle)}</p>` : ""}<h1>${esc(title)}</h1></div>${action}</header>`;
}

function storageBanner() {
  return `<p id="storage-notice" class="notice" role="status" ${storageNotice ? "" : "hidden"}>${esc(storageNotice)}</p>`;
}

function rotationTiles(firstDate, length, schedule, done = new Set()) {
  return Array.from({ length }, (_, index) => {
    const date = addDays(firstDate, index);
    const plan = plannedDay(date, schedule);
    const label = plan ? `Day ${plan.day}` : done.has(date) ? "Done" : "Rest";
    const style = date === schedule.nextDate ? "next" : plan || done.has(date) ? "" : "rest";
    return `<li class="rotation-tile ${style}" aria-label="${formatDate(date, "full")}, ${label}"><small>${formatDate(date, "tile")}</small><strong>${label}</strong></li>`;
  }).join("");
}

function benchTargetText(lastEntry) {
  const target = nextBenchTarget(lastEntry);
  return target ? `${num(target.weightKg)} kg for ${target.reps.join(" / ")} reps` : "3 sets of 3–5 reps at a repeatable load";
}

function currentBench() {
  return exerciseHistory(workouts, "bench-press", "weighted").findLast(row => row.workout.date >= settings.returnDate);
}

function weeklyRecordCount(start, today) {
  const keys = new Map();
  for (const workout of workouts) {
    if (workout.date < start || workout.date > today) continue;
    for (const entry of workout.entries) keys.set(progressId(entry.exerciseId, entry.mode), entry);
  }
  let count = 0;
  for (const entry of keys.values()) {
    const history = exerciseHistory(workouts, entry.exerciseId, entry.mode);
    count += history.filter(row => row.workout.date >= start && row.workout.date <= today)
      .reduce((sum, row) => sum + row.records.length, 0);
  }
  return count;
}

function renderOverview() {
  const today = localDate();
  const schedule = currentSchedule(today);
  const next = PLAN[schedule.dayIndex];
  const last = schedule.latest;
  const since = last ? daysBetween(last.date, today) : null;
  const nextDate = schedule.nextDate === today ? `Today · ${formatDate(today, "short")}` : formatDate(schedule.nextDate, "short");
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const done = new Set(workouts.filter(workout => workout.date >= monday && workout.date <= today).map(workout => workout.date));
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    const logged = done.has(date);
    const upcoming = !logged && Boolean(plannedDay(date, schedule));
    const state = logged ? "Logged" : upcoming ? "Scheduled" : "No workout";
    return `<li class="${logged ? "week-done" : upcoming ? "week-planned" : ""} ${date === today ? "week-today" : ""}" aria-label="${formatDate(date, "full")}, ${state}"><span>${formatDate(date, "weekday")}</span><span class="week-mark" aria-hidden="true">${logged ? "✓" : upcoming ? "○" : "·"}</span></li>`;
  }).join("");
  const bench = currentBench();
  const values = bench?.values ?? startingReference("bench-press", "weighted");
  const newRecords = weeklyRecordCount(monday, today);
  const recent = workouts.filter(workout => workout.date <= today).slice(-4).reverse();

  return `${heading("Overview", formatDate(today, "full"), '<a class="button button-primary" href="#log">+ Log workout</a>')}${storageBanner()}
    <div class="stack">
      <section class="hero panel" aria-labelledby="next-workout">
        <div>
          <p class="eyebrow">Next workout · ${nextDate}</p>
          <h2 class="hero-title" id="next-workout">Day ${next.day}</h2>
          <p class="hero-subtitle">${esc(next.name)}</p>
          <div class="hero-actions"><button class="button" type="button" data-action="start-plan" data-day="${next.day}">Load Day ${next.day}</button><a class="text-link" href="#plan">View plan <span aria-hidden="true">→</span></a></div>
        </div>
        <div class="hero-calendar"><p class="eyebrow">Every-other-day rotation</p><ol class="rotation-grid" aria-label="Upcoming rotation">${rotationTiles(schedule.nextDate, 5, schedule)}</ol></div>
      </section>
      <div class="dashboard-grid">
        <section class="panel" aria-labelledby="consistency-title">
          <div class="panel-heading"><h2 id="consistency-title">Weekly consistency</h2><span class="dim small nowrap">${formatDate(monday, "axis")}–${formatDate(sunday, "axis")}</span></div>
          <p class="stat-large number">${done.size} <span class="stat-unit">training ${done.size === 1 ? "day" : "days"}</span></p>
          <ol class="week" aria-label="Training days this week">${week}</ol>
          <p class="legend"><span><b aria-hidden="true">✓</b> Logged</span><span><b aria-hidden="true">○</b> Scheduled</span></p>
        </section>
        <section class="panel" aria-labelledby="last-workout-title">
          <div class="panel-heading"><h2 id="last-workout-title">Days since last workout</h2></div>
          <p class="stat-large number">${since == null ? "—" : since} ${since == null ? "" : `<span class="stat-unit">${since === 1 ? "day" : "days"}</span>`}</p>
          <p class="stat-detail">${last ? `${formatDate(last.date, "short")} · ${esc(workoutGroups(last))}` : "Your first saved workout will appear here."}</p>
          ${newRecords ? `<p class="stat-detail"><span class="badge">${plural(newRecords, "PR")} this week</span></p>` : ""}
        </section>
      </div>
      <section class="panel" aria-labelledby="bench-summary-title">
        <div class="panel-heading"><h2 id="bench-summary-title">Bench press progress</h2><a class="text-link nowrap" href="#progress" data-action="bench-progress">View progress <span aria-hidden="true">→</span></a></div>
        <dl class="bench-summary">
          <div><dt>${bench ? "Latest workout" : "Starting reference"}</dt><dd class="set-summary number">${esc(displaySets(bench?.entry ?? BENCH_REFERENCE))}</dd></div>
          <div><dt>Estimated 1RM</dt><dd class="number">${metricText(values.estimate, "estimate")}</dd></div>
          <div><dt>Session volume</dt><dd class="number">${metricText(values.volume, "volume")}</dd></div>
        </dl>
        <p class="bench-target"><strong>Next bench target</strong> · ${benchTargetText(bench?.entry)} if you have at least two reps in reserve.</p>
      </section>
      ${recent.length ? `<section class="panel" aria-labelledby="recent-title"><div class="panel-heading"><h2 id="recent-title">Recent workouts</h2></div><ul class="recent-list">${recent.map(workout => `<li><div><strong>${formatDate(workout.date, "stamp")}${workout.planDay ? ` · Day ${esc(workout.planDay)}` : ""}</strong><p class="dim small">${esc(workoutGroups(workout))} · ${plural(workout.entries.length, "exercise")}</p></div><button class="button button-small" type="button" data-action="edit" data-id="${esc(workout.id)}">Edit<span class="sr-only"> workout on ${formatDate(workout.date, "stamp")}</span></button></li>`).join("")}</ul></section>` : ""}
    </div>`;
}

function catalogOptions() {
  const form = activeDraft();
  const present = new Set(form.entries.map(entry => entry.exerciseId));
  const normalized = normalizeName(exerciseQuery);
  const alias = EXERCISE_ALIASES.get(normalized);
  const items = [...catalog().values()];
  const matches = items.filter(item => !present.has(item.id) && (normalizeName(item.name).includes(normalized) || item.id === alias));
  const exact = items.some(item => normalizeName(item.name) === normalized || item.id === alias)
    || form.entries.some(entry => normalizeName(entry.name) === normalized)
    || Boolean(alias);
  const create = normalized && !exact ? `<button type="button" class="picker-create" data-action="custom-exercise">Add “${esc(exerciseQuery.trim())}”</button>` : "";
  return `${matches.slice(0, 7).map(item => `<button type="button" data-action="add-exercise" data-id="${esc(item.id)}"><span>${esc(item.name)}</span><small>${esc(item.groups.join(" · "))}</small></button>`).join("")}${create}${!matches.length && !create ? '<p class="dim small">That exercise is already in this workout.</p>' : ""}`;
}

function exerciseCard(entry, index) {
  const id = `entry-${index}`;
  const bodyweight = entry.mode === "bodyweight";
  return `<article class="exercise-card" id="${id}" aria-labelledby="${id}-title">
    <div class="exercise-card-heading"><div><h3 id="${id}-title">${esc(entry.name)}</h3>${entry.groups.length ? `<p class="dim small">${esc(entry.groups.join(" · "))}</p>` : ""}</div><button class="icon-button" type="button" data-action="remove-exercise" data-entry="${index}" aria-label="Remove ${esc(entry.name)}">×</button></div>
    <div class="exercise-options">
      <div class="field"><label for="${id}-mode">Load type</label><select id="${id}-mode" data-entry="${index}" data-field="mode"><option value="weighted" ${bodyweight ? "" : "selected"}>Weighted</option><option value="bodyweight" ${bodyweight ? "selected" : ""}>Bodyweight</option></select></div>
      ${BUILT_IN.has(entry.exerciseId) ? "" : `<div class="field"><label for="${id}-group">Primary group</label><select id="${id}-group" data-entry="${index}" data-field="exercise-group"><option value="">Select group</option>${GROUPS.map(group => `<option ${entry.groups.includes(group) ? "selected" : ""}>${group}</option>`).join("")}</select></div>`}
    </div>
    <div class="set-grid"><span class="set-label">Set</span><span class="set-label">${bodyweight ? "Added kg (optional)" : "Weight (kg)"}</span><span class="set-label">Reps</span><span></span>
      ${entry.sets.map((set, indexSet) => `<span class="set-number number">${indexSet + 1}</span>
        <input type="number" inputmode="decimal" step="any" min="${bodyweight ? "0" : "0.0001"}" max="10000" ${bodyweight ? 'placeholder="Optional"' : 'placeholder="kg" required'} value="${esc(set.weightKg)}" data-entry="${index}" data-set="${indexSet}" data-field="weightKg" aria-label="${esc(entry.name)}, set ${indexSet + 1}, ${bodyweight ? "added weight in kilograms, optional" : "weight in kilograms"}">
        <input type="number" inputmode="numeric" step="1" min="1" max="1000" required placeholder="Reps" value="${esc(set.reps)}" data-entry="${index}" data-set="${indexSet}" data-field="reps" aria-label="${esc(entry.name)}, set ${indexSet + 1}, reps">
        <button class="icon-button" type="button" data-action="remove-set" data-entry="${index}" data-set="${indexSet}" aria-label="Remove set ${indexSet + 1} of ${esc(entry.name)}" ${entry.sets.length === 1 ? "disabled" : ""}>−</button>`).join("")}
    </div>
    <button class="button button-small add-set" type="button" data-action="add-set" data-entry="${index}" ${entry.sets.length >= 100 ? "disabled" : ""}>+ Add set</button>
  </article>`;
}

function quickExerciseIds() {
  const ids = new Set();
  for (const workout of [...workouts].reverse()) {
    for (const entry of workout.entries) ids.add(entry.exerciseId);
    if (ids.size >= 4) break;
  }
  return [...new Set([...ids, "bench-press", "dumbbell-curl", "push-up", "reverse-crunch"])].slice(0, 4);
}

function renderLog() {
  const form = activeDraft();
  const groups = selectedGroups(form);
  const templateDay = form.planDay || PLAN[currentSchedule().dayIndex].day;
  const totalSets = form.entries.reduce((total, entry) => total + entry.sets.length, 0);
  const items = catalog();
  const headerAction = editing ? '<button class="button" type="button" data-action="cancel-edit">Cancel edit</button>' : "";
  return `${heading(editing ? "Edit workout" : "Log workout", "", headerAction)}${storageBanner()}
    <form class="log-form stack" data-form="workout" novalidate>
      <section class="panel" aria-labelledby="workout-details-title">
        <div class="panel-heading"><h2 id="workout-details-title">Workout details</h2></div>
        <div class="field-grid">
          <div class="field"><label for="workout-date">Date</label><input id="workout-date" type="date" max="${localDate()}" required value="${esc(form.date)}" data-field="date"></div>
          <div class="field"><label for="workout-day">Rotation day</label><select id="workout-day" data-field="planDay"><option value="">Unscheduled</option>${PLAN.map(day => `<option value="${day.day}" ${form.planDay === day.day ? "selected" : ""}>Day ${day.day}</option>`).join("")}</select></div>
        </div>
        <fieldset class="group-field"><legend>Muscle groups</legend><div class="group-buttons">${GROUPS.map(group => `<label><input type="checkbox" data-field="group" value="${group}" ${groups.includes(group) ? "checked" : ""}><span>${group}</span></label>`).join("")}</div></fieldset>
      </section>
      <section class="panel log-block" aria-labelledby="workout-exercises-title">
        <div class="panel-heading"><h2 id="workout-exercises-title">Exercises</h2><button class="button button-small" type="button" data-action="toggle-picker" aria-expanded="${pickerOpen}" ${pickerOpen ? 'aria-controls="exercise-picker"' : ""}>${pickerOpen ? "Close search" : "+ Add exercise"}</button></div>
        ${pickerOpen ? `<div class="picker" id="exercise-picker"><label class="sr-only" for="exercise-search">Search exercises</label><input type="search" id="exercise-search" placeholder="Search or enter a new exercise" autocomplete="off" maxlength="75" value="${esc(exerciseQuery)}"><div class="picker-options" id="exercise-options">${catalogOptions()}</div></div>` : ""}
        ${form.entries.length ? `<div class="log-workout-exercises">${form.entries.map(exerciseCard).join("")}</div>` : `<div class="exercise-empty"><p class="small dim">Add an exercise or start with a template.</p><div class="quick-add">${quickExerciseIds().map(id => `<button class="chip" type="button" data-action="add-exercise" data-id="${esc(id)}">${esc(items.get(id)?.name)}</button>`).join("")}<button class="chip" type="button" data-action="add-plan" data-day="${esc(templateDay)}">Load Day ${esc(templateDay)}</button></div></div>`}
      </section>
      <section class="panel" aria-labelledby="session-notes-title"><div class="field"><label id="session-notes-title" for="workout-notes">Session notes <span class="dim">(optional)</span></label><textarea id="workout-notes" maxlength="2000" data-field="notes" placeholder="RPE, energy, or anything to remember">${esc(form.notes)}</textarea></div></section>
      <p class="notice form-error" id="workout-error" role="alert" ${workoutError ? "" : "hidden"}>${esc(workoutError)}</p>
      <div class="form-footer"><span class="small dim">${plural(form.entries.length, "exercise")} · ${plural(totalSets, "set")}</span><div class="form-footer-actions">${editing ? `<button class="button button-quiet danger" type="button" data-action="delete" data-id="${esc(form.id)}">Delete</button>` : ""}<button class="button button-primary" type="submit">${editing ? "Save changes" : "Save workout"}</button></div></div>
    </form>`;
}

function progressChoices() {
  const logged = new Map();
  for (const workout of workouts) {
    for (const entry of workout.entries) {
      const key = progressId(entry.exerciseId, entry.mode);
      logged.set(key, { id: entry.exerciseId, name: entry.name, mode: entry.mode, key });
    }
  }
  for (const item of EXERCISES) {
    const key = progressId(item.id, item.mode);
    if (!logged.has(key)) logged.set(key, { ...item, key });
  }
  const counts = new Map();
  for (const item of logged.values()) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  return [...logged.values()].sort((a, b) => a.name.localeCompare(b.name)).map(item => ({
    ...item, label: counts.get(item.id) > 1 ? `${item.name} (${item.mode})` : item.name,
  }));
}

function progressExercise() {
  const items = progressChoices();
  const current = items.find(item => item.key === selectedExercise) ?? items.find(item => item.id === "bench-press");
  selectedExercise = current.key;
  return { current, items };
}

function chartMetrics(history, mode) {
  const keys = recordMetrics(mode);
  if (mode === "bodyweight" && history.some(row => row.values.volume != null)) keys.push("volume");
  return keys;
}

function badges(keys) {
  return keys.map(key => `<span class="badge">${PR_LABELS[key]}</span>`).join(" ");
}

function historyTables(history, mode) {
  const main = recordMetrics(mode);
  const optionalVolume = mode === "bodyweight" && history.some(row => row.values.volume != null);
  const columns = optionalVolume ? [...main, "volume"] : main;
  const title = key => key === "estimate" ? "Est. 1RM" : key === "volume" ? "Volume" : METRICS[key].title;
  const rows = [...history].reverse();
  const edit = workout => `<button class="button button-small" type="button" data-action="edit" data-id="${esc(workout.id)}">Edit<span class="sr-only"> workout on ${formatDate(workout.date)}</span></button>`;
  return `<div class="history-desktop table-scroll" tabindex="0" role="region" aria-label="Exercise history table">
      <table class="history-table"><thead><tr><th scope="col">Date</th><th scope="col">Sets</th>${columns.map(key => `<th scope="col">${title(key)}</th>`).join("")}<th scope="col">Records</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${rows.map(({ workout, entry, values, records }) => `<tr><td class="nowrap">${formatDate(workout.date)}</td><td class="sets-cell">${esc(displaySets(entry))}${workout.notes ? `<small class="row-note">${esc(workout.notes)}</small>` : ""}</td>${columns.map(key => `<td class="number nowrap">${metricText(values[key], key)}</td>`).join("")}<td>${records.length ? badges(records) : "—"}</td><td>${edit(workout)}</td></tr>`).join("")}</tbody></table></div>
    <div class="history-mobile"><table><thead><tr><th scope="col">Date</th>${main.map(key => `<th scope="col">${title(key)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(({ workout, entry, values, records }) => `<tr><td>${formatDate(workout.date)}<details><summary>Set details</summary><p class="row-note">${esc(displaySets(entry))}</p>${optionalVolume ? `<p class="row-note">Volume ${metricText(values.volume, "volume")}</p>` : ""}${workout.notes ? `<p class="row-note">${esc(workout.notes)}</p>` : ""}${edit(workout)}</details></td>${main.map(key => `<td class="number">${metricText(values[key], key)}${records.includes(key) ? `<br>${badges([key])}` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderHistory(history, current) {
  const keys = chartMetrics(history, current.mode);
  if (!keys.includes(selectedMetric)) selectedMetric = keys[0];
  const points = chartSeries(history, selectedMetric);
  const reference = startingReference(current.id, current.mode);
  const emptyMessage = history.length ? "There are no recorded values for this metric." : "Save a workout with this exercise to see its trend.";
  const explanation = current.mode === "weighted"
    ? "Estimated 1RM is the best Epley estimate in each session. Volume is the sum of weight × reps across sets."
    : "Bodyweight trends use reps. External volume counts added load when entered.";

  return `<section class="panel" aria-labelledby="trend-title">
    <div class="chart-head"><div><h2 id="trend-title">Exercise trend</h2>${points.length ? `<p class="dim small">${formatDate(points[0].date, "axis")} – ${formatDate(points.at(-1).date, "axis")}</p>` : ""}</div>
      <div class="field"><label for="chart-metric">Metric</label><select id="chart-metric">${keys.map(key => `<option value="${key}" ${selectedMetric === key ? "selected" : ""}>${METRICS[key].title}</option>`).join("")}</select></div></div>
    ${points.length ? `<div class="chart-wrap"><canvas id="progress-chart" role="img" aria-label="${esc(METRICS[selectedMetric].title)} over time. Values are listed in the session history."></canvas><div class="chart-tip" id="chart-tip" hidden></div></div>` : `<div class="empty-chart"><strong>No chart data yet</strong><p class="dim small">${emptyMessage}</p></div>`}
    <p class="metric-note">${explanation}</p>
  </section>
  <section class="panel" aria-labelledby="history-title">
    <div class="panel-heading"><h2 id="history-title">Session history</h2><span class="dim small">${plural(history.length, "session")}</span></div>
    ${reference ? `<p class="small dim history-reference">Starting reference ${esc(displaySets(BENCH_REFERENCE))} · ${metricText(reference.estimate, "estimate")} estimated 1RM · ${metricText(reference.volume, "volume")} volume</p>` : ""}
    ${history.length ? historyTables(history, current.mode) : '<p class="small dim">No saved sessions for this exercise.</p>'}
  </section>`;
}

function rangeField(label, prefix, values) {
  return `<fieldset class="range"><legend>${label}</legend><div class="field-grid">
    <div class="field"><label for="${prefix}-from">From</label><input id="${prefix}-from" name="${prefix}From" type="date" value="${esc(values[`${prefix}From`])}" required></div>
    <div class="field"><label for="${prefix}-to">To (optional)</label><input id="${prefix}-to" name="${prefix}To" type="date" value="${esc(values[`${prefix}To`])}"></div>
  </div></fieldset>`;
}

function deltaText(a, b, key) {
  if (a == null || b == null) return "—";
  const value = Math.round((b - a) * 100) / 100;
  const unit = METRICS[key] ? ` ${METRICS[key].unit}` : "";
  const text = `${value > 0 ? "+" : ""}${num(value)}${unit}`;
  return value > 0 ? `<span class="accent">${text}</span>` : text;
}

function renderCompare(history, current) {
  const a = compareRange(history, ranges.aFrom, ranges.aTo || ranges.aFrom);
  const b = compareRange(history, ranges.bFrom, ranges.bTo || ranges.bFrom);
  const metricRows = [...chartMetrics(history, current.mode), "sessions", "sets"];
  const showValue = (value, key) => METRICS[key] ? metricText(value, key) : value == null ? "—" : num(value);
  const label = key => METRICS[key]?.title ?? (key === "sessions" ? "Sessions" : "Working sets");
  const describeRange = (from, to) => !to || from === to ? formatDate(from) : `${formatDate(from, "axis")} – ${formatDate(to)}`;
  return `<section class="panel" aria-labelledby="compare-range-title">
    <div class="panel-heading"><div><h2 id="compare-range-title">Compare dates or ranges</h2><p class="dim small">Choose two inclusive date ranges. Leave an end date blank to compare a single day.</p></div></div>
    <form class="compare-form" data-form="compare">
      <div class="field-grid">${rangeField("Period A", "a", ranges)}${rangeField("Period B", "b", ranges)}</div>
      <p class="notice form-error" id="compare-error" role="alert" ${compareError ? "" : "hidden"}>${esc(compareError)}</p>
      <div class="form-footer"><button class="button button-primary" type="submit">Compare</button><button class="button button-quiet" type="button" data-action="week-compare">This week vs. 4 weeks ago</button></div>
    </form>
  </section>
  <section class="panel" aria-labelledby="comparison-title">
    <div class="panel-heading"><div><h2 id="comparison-title">${esc(current.name)} comparison</h2><p class="dim small">A ${describeRange(ranges.aFrom, ranges.aTo)} · B ${describeRange(ranges.bFrom, ranges.bTo)}</p></div></div>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Period comparison table"><table class="compare-table"><thead><tr><th scope="col">Metric</th><th scope="col">Period A</th><th scope="col">Period B</th><th scope="col">Change (B − A)</th></tr></thead><tbody>
      ${metricRows.map(key => `<tr><th scope="row">${label(key)}</th><td class="number nowrap">${showValue(a[key], key)}</td><td class="number nowrap">${showValue(b[key], key)}</td><td class="number nowrap">${deltaText(a[key], b[key], key)}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="metric-note">Strength and best-set values use the highest result in each period. Volume and total reps add up all sessions.</p>
  </section>`;
}

function renderReturning(history, current) {
  const reference = startingReference(current.id, current.mode);
  const values = returningMetrics(history, settings.returnDate, reference, current.mode);
  const latest = history.filter(row => row.workout.date >= settings.returnDate).at(-1);
  return `<section class="panel" aria-labelledby="return-date-title">
    <div class="panel-heading"><div><h2 id="return-date-title">Returning lifter</h2><p class="dim small">Set your first day back. Add older workouts through the log to include them in your pre-return best.</p></div></div>
    <form class="return-settings" data-form="return-date"><div class="field"><label for="return-date">Return date</label><input id="return-date" name="returnDate" type="date" max="${localDate()}" required value="${settings.returnDate}"></div><button class="button" type="submit">Save date</button></form>
    <p class="notice form-error" id="return-error" role="alert" ${returnError ? "" : "hidden"}>${esc(returnError)}</p>
  </section>
  <section class="panel" aria-labelledby="return-results-title"><div class="panel-heading"><div><h2 id="return-results-title">${esc(current.name)} comeback</h2><p class="dim small">${latest ? `Latest session ${formatDate(latest.workout.date)}` : "Your latest post-return session will appear here."}</p></div></div>
    <div class="return-grid">${values.map(metric => `<article class="return-card">
      <h3>${METRICS[metric.key].title}</h3><dl><dt>Latest</dt><dd class="number">${metricText(metric.latest, metric.key)}</dd><dt>Best since return</dt><dd class="number">${metricText(metric.comebackBest, metric.key)}</dd><dt>${metric.usesReference ? "Starting reference" : "Pre-return best"}</dt><dd class="number">${metricText(metric.prior, metric.key)}</dd><dt>All-time best</dt><dd class="number">${metricText(metric.allTime, metric.key)}</dd></dl>
      ${metric.surpassed ? `<span class="badge">${metric.usesReference ? "Starting reference surpassed" : "Pre-return best surpassed"}</span>` : metric.prior == null ? '<p class="metric-note">Add an older session to set a comparison mark.</p>' : ""}
    </article>`).join("")}</div>
    ${reference ? '<p class="metric-note">The all-time best includes your bench starting reference and saved bench sessions.</p>' : ""}
  </section>`;
}

function renderProgress() {
  const { current, items } = progressExercise();
  const history = exerciseHistory(workouts, current.id, current.mode);
  const views = { history: renderHistory, compare: renderCompare, returning: renderReturning };
  return `${heading("Progress")}${storageBanner()}<div class="stack">
    <div class="progress-controls"><div class="field"><label for="progress-exercise">Exercise</label><select id="progress-exercise">${items.map(item => `<option value="${esc(item.key)}" ${item.key === current.key ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select></div>
    <div class="segment" role="group" aria-label="Progress view">${Object.entries(PROGRESS_VIEWS).map(([view, label]) => `<button type="button" data-action="progress-view" data-view="${view}" aria-pressed="${view === progressView}">${label}</button>`).join("")}</div></div>
    ${views[progressView](history, current)}
  </div>`;
}

function renderPlan() {
  const today = localDate();
  const schedule = currentSchedule(today);
  const next = PLAN[schedule.dayIndex];
  const todayDone = new Set(workouts.filter(workout => workout.date === today).map(workout => workout.date));
  const counts = Object.fromEntries(GROUPS.map(group => [group, 0]));
  for (const day of PLAN) {
    for (const lift of day.lifts) counts[BUILT_IN.get(lift.id).groups[0]] += lift.sets;
  }
  const lastBench = currentBench()?.entry;
  return `${heading("Training plan")}${storageBanner()}<div class="stack">
    <section class="panel" aria-labelledby="schedule-title"><div class="panel-heading"><div><h2 id="schedule-title">Next 7 days</h2><p class="dim small">Day ${next.day} is next on ${formatDate(schedule.nextDate, "short")}.</p></div></div>
      <ol class="plan-schedule" aria-label="Next seven training and rest days">${rotationTiles(today, 7, schedule, todayDone)}</ol>
      <p class="metric-note">Train A, rest, train B, rest, train C, rest, then repeat. The schedule uses your last logged training day.</p>
    </section>
    <section class="panel" aria-labelledby="priorities-title"><h2 id="priorities-title">Working sets per rotation</h2><div class="plan-priorities">${GROUPS.map(group => `<span>${group} <b>${counts[group]}</b></span>`).join("")}</div><p class="dim small">Sets are counted for each lift’s primary muscle group.</p></section>
    ${PLAN.map(day => `<section class="panel" aria-labelledby="plan-${day.day}-title">
      <div class="panel-heading"><div><p class="eyebrow accent">Day ${day.day}</p><h2 id="plan-${day.day}-title">${esc(day.name)}</h2></div><button class="button button-small" type="button" data-action="start-plan" data-day="${day.day}">Load Day ${day.day}</button></div>
      <ul class="plan-list">${day.lifts.map(lift => {
        const main = BUILT_IN.get(lift.id);
        const alternative = lift.alternative;
        return `<li class="plan-lift"><div><strong>${esc(main.name)}</strong><p class="prescription">${lift.sets} × ${lift.min}–${lift.max} reps</p><p class="dim">${main.groups[0]}</p></div>
          ${alternative ? `<div class="plan-alt"><p class="dim">Bodyweight option</p><strong>${esc(BUILT_IN.get(alternative.id).name)}</strong><p class="dim">${lift.sets} × ${alternative.min}–${alternative.max} reps${alternative.note ? ` · ${esc(alternative.note)}` : ""}</p></div>` : ""}</li>`;
      }).join("")}</ul></section>`).join("")}
    <section class="panel plan-guide" aria-labelledby="progression-title"><div class="panel-heading"><h2 id="progression-title">Progression</h2></div>
      <p><strong>Bench starting point</strong> · ${esc(displaySets(BENCH_REFERENCE))}. If 60 kg was close to your limit, begin with 55–57.5 kg.</p>
      <p><strong>Next Day A bench target</strong> · ${benchTargetText(lastBench)} if you can finish with at least two reps in reserve.</p>
      <p class="small dim">Build toward 3 × 5 before adding 2.5 kg and restarting at 3 × 3. On other lifts, reach the top of the rep range on every set with about two reps in reserve before taking the smallest load increase or a harder bodyweight variation.</p>
      <p class="small dim">Start the first rotation with 3–4 reps in reserve. Rest about 2–3 minutes for compound lifts and 1–2 minutes for isolation work.</p>
    </section>
  </div>`;
}

function drawChart(points, key) {
  const canvas = document.querySelector("#progress-chart");
  if (!canvas || !points.length) return;
  const tip = document.querySelector("#chart-tip");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  let positions = [];

  function paint() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const min = Math.min(...points.map(point => point.value));
    const max = Math.max(...points.map(point => point.value));
    const padding = Math.max((max - min) * .19, max * .035, 1);
    const low = Math.max(0, min - padding);
    const high = max + padding;
    const t0 = points[0].date;
    const totalDays = daysBetween(t0, points.at(-1).date);
    const top = 13;
    const bottom = height - 28;
    const right = width - 12;
    ctx.font = "11px system-ui";
    const left = Math.max(38, ctx.measureText(num(high)).width + 12);
    const xFor = date => totalDays ? left + (right - left) * daysBetween(t0, date) / totalDays : (left + right) / 2;
    const yFor = value => bottom - (bottom - top) * (value - low) / (high - low);
    positions = points.map(point => ({ ...point, x: xFor(point.date), y: yFor(point.value) }));

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const tick = low + (high - low) * i / 4;
      const y = yFor(tick);
      ctx.fillStyle = "#a4b1ab";
      ctx.fillText(num(Math.round(tick * 10) / 10), left - 7, y);
      ctx.strokeStyle = "#303b37";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }

    if (positions.length > 1) {
      const gradient = ctx.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, "rgba(213, 242, 133, 0.22)");
      gradient.addColorStop(1, "rgba(213, 242, 133, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(positions[0].x, bottom);
      for (const point of positions) ctx.lineTo(point.x, point.y);
      ctx.lineTo(positions.at(-1).x, bottom);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#d5f285";
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.moveTo(positions[0].x, positions[0].y);
      for (const point of positions.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    for (const point of positions) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.record ? 4.5 : 3.3, 0, Math.PI * 2);
      ctx.fillStyle = point.record ? "#f4ffd8" : "#d5f285";
      ctx.fill();
    }
    ctx.fillStyle = "#a4b1ab";
    const kind = totalDays >= 300 ? "stamp" : "axis";
    if (positions.length === 1) {
      ctx.textAlign = "center";
      ctx.fillText(formatDate(t0, kind), positions[0].x, bottom + 16);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(formatDate(t0, kind), left, bottom + 16);
      ctx.textAlign = "right";
      ctx.fillText(formatDate(points.at(-1).date, kind), right, bottom + 16);
    }
  }

  paint();
  chartObserver = new ResizeObserver(paint);
  chartObserver.observe(canvas);
  canvas.addEventListener("pointermove", event => {
    const x = event.clientX - canvas.getBoundingClientRect().left;
    const nearest = positions.reduce((best, point) => !best || Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best, null);
    if (!nearest || Math.abs(nearest.x - x) > 26) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = `<span>${formatDate(nearest.date)}</span><strong>${metricText(nearest.value, key)}${nearest.record ? " · PR" : ""}</strong>`;
    tip.hidden = false;
    tip.style.left = `${Math.max(0, Math.min(nearest.x - tip.offsetWidth / 2, canvas.clientWidth - tip.offsetWidth))}px`;
    tip.style.top = `${nearest.y < 54 ? nearest.y + 10 : nearest.y - 52}px`;
  });
  canvas.addEventListener("pointerleave", () => { tip.hidden = true; });
}

function render(focusSelector = "") {
  chartObserver?.disconnect();
  const pages = { overview: renderOverview, log: renderLog, progress: renderProgress, plan: renderPlan };
  app.innerHTML = pages[currentPage]();
  for (const link of document.querySelectorAll("[data-page]")) {
    if (link.dataset.page === currentPage) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.querySelector(".storage-label").hidden = Boolean(storageNotice);
  if (currentPage === "progress" && progressView === "history") {
    const { current } = progressExercise();
    drawChart(chartSeries(exerciseHistory(workouts, current.id, current.mode), selectedMetric), selectedMetric);
  }
  if (focusSelector) document.querySelector(focusSelector)?.focus({ preventScroll: true });
}

function go(page) {
  if (page === currentPage) render();
  else location.hash = page;
}

function showFormError(id, message) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = message;
    element.hidden = !message;
  }
}

function setWorkoutError(message, field) {
  workoutError = message;
  showFormError("workout-error", message);
  if (field) document.querySelector(field)?.focus();
}

function openExercisePicker() {
  pickerOpen = !pickerOpen;
  exerciseQuery = "";
  render(pickerOpen ? "#exercise-search" : '[data-action="toggle-picker"]');
}

function addExercise(item) {
  if (!item) return;
  const form = activeDraft();
  if (form.entries.some(entry => entry.exerciseId === item.id)) return;
  form.entries.push(newEntry(item, form.date));
  const index = form.entries.length - 1;
  const firstField = form.entries[index].mode === "weighted" ? "weightKg" : "reps";
  pickerOpen = false;
  exerciseQuery = "";
  workoutError = "";
  persistDraft();
  render();
  document.querySelector(`input[data-entry="${index}"][data-set="0"][data-field="${firstField}"]`)?.focus();
}

function addCustomExercise() {
  const name = exerciseQuery.trim().replace(/\s+/g, " ");
  const normalized = normalizeName(name);
  if (!normalized || name.length > 75) return;
  const known = [...catalog().values()].find(item => normalizeName(item.name) === normalized);
  addExercise(known ?? { id: `custom:${normalized}`, name, groups: [], mode: "weighted" });
}

function loadPlan(day) {
  const plan = PLAN.find(item => item.day === day);
  if (!plan) return;
  const form = activeDraft();
  const present = new Set(form.entries.map(entry => entry.exerciseId));
  form.planDay = day;
  for (const lift of plan.lifts) {
    if (!present.has(lift.id)) form.entries.push(newEntry(BUILT_IN.get(lift.id), form.date, { sets: lift.sets, reps: lift.min }));
  }
  pickerOpen = false;
  workoutError = "";
  persistDraft();
  go("log");
}

function editWorkout(id) {
  const workout = workouts.find(item => item.id === id);
  if (!workout) return;
  const defaults = new Set(workout.entries.flatMap(entry => entry.groups));
  const groupOverrides = Object.fromEntries(GROUPS.filter(group => defaults.has(group) !== workout.muscleGroups.includes(group))
    .map(group => [group, workout.muscleGroups.includes(group)]));
  editing = {
    original: workout,
    draft: { ...workout, groupOverrides, entries: workout.entries.map(entry => ({ ...entry, groups: [...entry.groups], sets: draftSets(entry.sets) })) },
  };
  pickerOpen = false;
  exerciseQuery = "";
  workoutError = "";
  go("log");
}

function saveWorkout() {
  const form = activeDraft();
  if (!isDate(form.date) || form.date > localDate()) {
    setWorkoutError("Choose today or a past workout date.", "#workout-date");
    return;
  }
  if (!form.entries.length) {
    setWorkoutError("Add at least one exercise before saving.", '[data-action="toggle-picker"]');
    return;
  }
  const muscleGroups = selectedGroups(form);
  if (!muscleGroups.length) {
    setWorkoutError("Select at least one muscle group.", '[data-field="group"]');
    return;
  }
  const invalid = document.querySelector('.log-form .set-grid input:invalid');
  if (invalid) {
    setWorkoutError("Check each set. Use positive whole reps and enter a weight for weighted exercises.");
    invalid.focus();
    return;
  }

  const key = `${WORKOUT_KEY}${form.id}`;
  const saved = readJson(key);
  if ((editing && saved?.updatedAt !== editing.original.updatedAt) || (!editing && saved)) {
    setWorkoutError("This workout changed in another tab. Open it again to edit the latest version.");
    return;
  }
  const now = new Date().toISOString();
  const record = {
    id: form.id, date: form.date, createdAt: editing?.original.createdAt ?? now, updatedAt: now,
    planDay: form.planDay || null, notes: form.notes.trim(), muscleGroups,
    entries: form.entries.map(entry => ({
      ...entry,
      groups: entry.groups.length ? entry.groups : !BUILT_IN.has(entry.exerciseId) && muscleGroups.length === 1 ? [...muscleGroups] : [],
      sets: entry.sets.map(set => ({ weightKg: Number(set.weightKg) || null, reps: Number(set.reps) })),
    })),
  };
  if (!writeJson(key, record)) {
    setWorkoutError("The workout is still open. Free some browser storage and try saving again.");
    return;
  }
  workouts = loadWorkouts();
  const recordCount = record.entries.reduce((sum, entry) => {
    const row = exerciseHistory(workouts, entry.exerciseId, entry.mode).find(item => item.workout.id === record.id);
    return sum + (row?.records.length ?? 0);
  }, 0);
  const wasEditing = Boolean(editing);
  if (!editing) {
    draft = null;
    persistDraft();
  }
  editing = null;
  workoutError = "";
  pickerOpen = false;
  go("overview");
  const message = wasEditing ? "Workout updated" : "Workout saved";
  notify(recordCount ? `${message} · ${plural(recordCount, "PR")}` : message);
}

function deleteWorkout(id) {
  const key = `${WORKOUT_KEY}${id}`;
  const workout = readJson(key);
  if (!workout || (editing && workout.updatedAt !== editing.original.updatedAt)) {
    setWorkoutError("This workout changed in another tab. Open it again to view the latest version.");
    return;
  }
  if (!window.confirm(`Delete the workout from ${formatDate(workout.date)}?`)) return;
  if (!writeJson(key, null)) {
    setWorkoutError("Browser storage is unavailable. Try deleting the workout again.");
    return;
  }
  workouts = loadWorkouts();
  editing = null;
  workoutError = "";
  go("overview");
  notify("Workout deleted");
}

function exportWorkouts() {
  if (!workouts.length) {
    notify("Save a workout to export its sets.");
    return;
  }
  const file = new Blob(["\ufeff", workoutCsv(workouts)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gym-workouts-${localDate()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  notify(`CSV exported · ${plural(workouts.length, "workout")}`);
}

function submitCompare(form) {
  const inputs = Object.fromEntries(new FormData(form));
  const valid = ["a", "b"].every(key => {
    const from = inputs[`${key}From`];
    const to = inputs[`${key}To`];
    return isDate(from) && (!to || (isDate(to) && to >= from));
  });
  if (!valid) {
    compareError = "Each end date must be on or after its start date.";
    showFormError("compare-error", compareError);
    return;
  }
  compareError = "";
  ranges = inputs;
  render('[data-form="compare"] button[type="submit"]');
}

function submitReturnDate(form) {
  const date = new FormData(form).get("returnDate");
  if (!isDate(date) || date > localDate()) {
    returnError = "Choose today or a past return date.";
    showFormError("return-error", returnError);
    return;
  }
  const updated = { ...settings, returnDate: date };
  if (!writeJson(`${STORAGE}settings`, updated)) return;
  settings = updated;
  returnError = "";
  render("#return-date");
  notify("Return date saved");
}

window.addEventListener("hashchange", () => {
  const next = pageInHash() ?? (location.hash ? null : "overview");
  if (!next || next === currentPage) return;
  currentPage = next;
  pickerOpen = false;
  exerciseQuery = "";
  render();
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
});

window.addEventListener("storage", event => {
  if (event.key && !event.key.startsWith(STORAGE)) return;
  if (event.key === `${STORAGE}draft`) return;
  workouts = loadWorkouts();
  const saved = readJson(`${STORAGE}settings`);
  if (isDate(saved?.returnDate)) settings = saved;
  if (currentPage !== "log") render();
});

document.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id, day, entry, set, view } = button.dataset;
  if (action === "export") exportWorkouts();
  if (action === "start-plan" || action === "add-plan") loadPlan(day);
  if (action === "edit") editWorkout(id);
  if (action === "cancel-edit") {
    editing = null;
    workoutError = "";
    render();
  }
  if (action === "delete") deleteWorkout(id);
  if (action === "toggle-picker") openExercisePicker();
  if (action === "add-exercise") addExercise(catalog().get(id));
  if (action === "custom-exercise") addCustomExercise();
  if (action === "add-set" || action === "remove-set" || action === "remove-exercise") {
    const form = activeDraft();
    const sets = form.entries[entry].sets;
    if (action === "add-set" && sets.length < 100) sets.push({ ...sets.at(-1) });
    if (action === "remove-set" && sets.length > 1) sets.splice(Number(set), 1);
    if (action === "remove-exercise") form.entries.splice(Number(entry), 1);
    workoutError = "";
    persistDraft();
    const focus = action === "remove-exercise" ? '[data-action="toggle-picker"]' : `[data-action="add-set"][data-entry="${entry}"]`;
    render(focus);
  }
  if (action === "bench-progress") {
    event.preventDefault();
    selectedExercise = progressId("bench-press", "weighted");
    progressView = "history";
    selectedMetric = "estimate";
    go("progress");
  }
  if (action === "progress-view") {
    progressView = view;
    render(`[data-view="${view}"]`);
  }
  if (action === "week-compare") {
    ranges = weekRanges();
    compareError = "";
    render('[data-action="week-compare"]');
  }
});

document.addEventListener("input", event => {
  const target = event.target;
  if (target.id === "exercise-search") {
    exerciseQuery = target.value;
    document.querySelector("#exercise-options").innerHTML = catalogOptions();
    return;
  }
  if (!target.closest(".log-form")) return;
  const { field, entry, set } = target.dataset;
  const form = activeDraft();
  if (field === "date" || field === "notes") form[field] = target.value;
  else if (field === "weightKg" || field === "reps") form.entries[entry].sets[set][field] = target.value;
  else return;
  setWorkoutError("");
  persistDraft();
});

document.addEventListener("change", event => {
  const target = event.target;
  if (target.id === "progress-exercise" || target.id === "chart-metric") {
    if (target.id === "progress-exercise") selectedExercise = target.value;
    else selectedMetric = target.value;
    render(`#${target.id}`);
    return;
  }
  if (!target.closest(".log-form")) return;
  const form = activeDraft();
  const { field, entry } = target.dataset;
  if (field === "group") form.groupOverrides[target.value] = target.checked;
  else if (field === "planDay") form.planDay = target.value;
  else if (field === "mode") {
    form.entries[entry].mode = target.value;
    form.entries[entry].sets = form.entries[entry].sets.map(set => ({ ...set, weightKg: "" }));
  } else if (field === "exercise-group") form.entries[entry].groups = target.value ? [target.value] : [];
  else return;
  setWorkoutError("");
  persistDraft();
  if (field !== "group") render(`#${target.id}`);
});

document.addEventListener("keydown", event => {
  if (event.target.id !== "exercise-search") return;
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#exercise-options button")?.click();
  } else if (event.key === "Escape") {
    event.preventDefault();
    openExercisePicker();
  }
});

document.addEventListener("submit", event => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  if (form.dataset.form === "workout") saveWorkout();
  if (form.dataset.form === "compare") submitCompare(form);
  if (form.dataset.form === "return-date") submitReturnDate(form);
});

render();
