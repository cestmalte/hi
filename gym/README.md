# Gym Log

Gym Log runs as a static single-page app at [cestmalte.eu/gym/](https://cestmalte.eu/gym/). HTML provides the shell, CSS adapts the layout to phones, and native JavaScript modules handle the form, storage, schedule, calculations, and Canvas chart. It uses hash navigation and relative asset paths so every screen works beneath `/gym/` on GitHub Pages. There are zero runtime dependencies and no build step.

| File | Responsibility |
| --- | --- |
| `index.html` | Navigation and page shell |
| `styles.css` | Responsive panels, mobile navigation, forms, and tables |
| `app.js` | Screens, draft persistence, workout editing, chart rendering, and CSV download |
| `training.js` | Exercise catalog, plan, calendar and progress calculations, and CSV formatting |

## Screen wireframes

| Screen | Top to bottom |
| --- | --- |
| Overview | Next rotation day and date → upcoming training and rest days → this week's training days → days since the last workout → bench summary and target → recent workouts |
| Log workout | Date, rotation tag, muscle group chips → exercise search or template → per-set weight and reps → optional session notes → Save workout |
| Progress | Exercise picker → History, Compare, or Returning lifter → metric chart and session table, two inclusive ranges, or latest and prior bests |
| Training plan | Seven-day calendar → working sets by muscle group → Day A, B, and C prescriptions → progression |

## Data model

| Record | Fields |
| --- | --- |
| Workout | `id`, local `date` (`YYYY-MM-DD`), `createdAt`, `updatedAt`, optional `planDay`, `muscleGroups[]`, `notes`, `entries[]` |
| Exercise entry | `exerciseId`, `name`, `groups[]`, `mode` (`weighted` or `bodyweight`), `sets[]` |
| Set | `weightKg` (positive external load or `null`), `reps` (positive integer) |
| Settings | `returnDate` (defaults to the first visit's local date) |
| Draft | Workout date, rotation tag, group selections, notes, and current exercise and set inputs |

Exercise IDs group sessions across dates. The built-in catalog lives in `training.js`. Saved custom exercise entries provide their names and defaults for future logs. Adding an exercise reuses its most recent set count, weights, reps, and load type as of the selected workout date. For bench during the return period, defaults use post-return bench logs or the starting reference. Templates provide defaults for exercises without history. Use the same weight convention for every dumbbell session, such as kg per hand.

Each workout has its own `cestmalte.gym.v1.workout.<id>` browser `localStorage` key. Settings and the new-workout draft use separate keys. Workouts stay in the browser profile on the same origin. Export CSV produces one row per set with the session date, rotation, groups, exercise, load, reps, calculated values, and notes.

## Calculations and comparisons

- **Estimated 1RM** uses `weightKg × (1 + reps / 30)` per weighted set and takes the highest value for the exercise in that session. It is an estimate based on the entered set. [Epley formula reference](https://www.rcp.ac.uk/media/j1llw4ul/pr_faqs_v51_aug_2025.pdf)
- **External volume** sums `weightKg × reps` across sets. The bench starting point of 60 kg × 3 reps × 3 sets gives a 66 kg estimated 1RM and 540 kg volume.
- **Bodyweight progress** uses total reps and best-set reps. Enter optional added load to record external volume. The app tracks weighted and bodyweight versions of the same exercise separately.
- **PRs** mark improvements over an earlier best. The bench starting reference provides a mark for the first bench session. The reference has no workout date and stays outside charts, range comparisons, consistency, and exports.
- **Compare** takes the strongest set for strength or best-set reps and sums reps or volume across each period. For a single date, enter the start date alone. The week preset compares Monday through today with the same weekdays four weeks earlier.
- **Returning lifter** shows the latest result and best since the return date, alongside the best before the return date and all-time best. Backdate old workouts to include them. The bench starting reference fills an empty pre-return comparison and is included in the bench all-time best.
- **Schedule** advances once per distinct training date in the return period. An explicit A/B/C tag sets the rotation position. The app suggests the next session two days after your latest workout, or today if that date has passed. You can log on any date through today, including consecutive days.

## Three-day rotation

Repeat A, rest, B, rest, C, rest. This gives three or four training days in a full calendar week. Across one rotation the primary-lift working sets are **14 arms, 8 chest, 7 shoulders, 5 back, and 4 abs**. The alternative replaces its corresponding exercise.

| Day | Exercise | Sets × reps | Bodyweight alternative |
| --- | --- | --- | --- |
| A | Bench press | 3 × 3–5 | Push-up, 3 × 6–12 |
| A | Incline dumbbell press | 2 × 8–12 | Feet-elevated push-up, 2 × 6–12 |
| A | Cable triceps pressdown | 3 × 10–15 | Close-grip push-up, 3 × 6–12 |
| A | Dumbbell curl | 2 × 8–12 | Assisted chin-up as needed, 2 × 4–8 |
| A | Dumbbell lateral raise | 2 × 12–20 | |
| B | Lat pulldown | 3 × 8–12 | Assisted pull-up as needed, 3 × 4–8 |
| B | Chest-supported dumbbell row | 2 × 8–12 | Inverted row, 2 × 6–12 |
| B | Dumbbell hammer curl | 3 × 8–12 | Assisted chin-up as needed, 3 × 4–8 |
| B | Overhead cable triceps extension | 2 × 10–15 | Bodyweight triceps extension, 2 × 6–12 |
| B | Reverse crunch | 2 × 10–15 | Dead bug, 2 × 8–12 per side |
| C | Seated dumbbell shoulder press | 3 × 6–10 | Pike push-up, 3 × 6–12 |
| C | Flat dumbbell press | 3 × 8–12 | Parallel-bar dip, 3 × 5–10, assisted as needed |
| C | Dumbbell lateral raise | 2 × 12–20 | |
| C | Preacher curl | 2 × 10–15 | Assisted chin-up as needed, 2 × 4–8 |
| C | Cable triceps pressdown | 2 × 10–15 | Close-grip push-up, 2 × 6–12 |
| C | Cable crunch | 2 × 10–15 | Reverse crunch, 2 × 10–15 |

For bench, repeat the 60 kg starting sets or use 55–57.5 kg if they were close to your limit. When you can finish with at least two reps in reserve, aim for 4/3/3 at the same load on the next Day A. Add one rep across the three sets at a time. After 5/5/5, try a 2.5 kg increase and return to 3/3/3. For other lifts, reach the upper end of the rep range on all sets before increasing load or using a harder bodyweight variation. Leave 3–4 reps in reserve during the first rotation and about two on subsequent working sets. [ACSM resistance training position stand](https://doi.org/10.1249/MSS.0000000000003897)

## Run locally

From the repository root, run a static server and open [localhost:8000/gym/](http://localhost:8000/gym/).

```sh
python3 -m http.server 8000
```

## Deploy to cestmalte.eu

1. Put the `gym/` directory at the root of `cestmalte/hi`.
2. Commit the directory and merge it into `main`, the branch used by GitHub Pages for `cestmalte.eu`. The existing root `CNAME` points to `cestmalte.eu`.
3. Check the Pages deployment in the repository's Actions tab. Open [cestmalte.eu/gym/](https://cestmalte.eu/gym/) after deployment completes.
4. For future updates, commit changes under `gym/` and let the same Pages deployment publish them. [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
