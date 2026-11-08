# External tests: measuring the Fake Users API

Black-box tooling for the API at `https://fake-users-api.vercel.app`. This folder is separate from the app: it has its own `package.json` and shares no code with it.

**Measure first, optimize second.** The README says the API fails about 25% of the time and takes anywhere from about 10 ms to 3 s. The app's retry budget, timeout and concurrency limit are engineering decisions, and they should rest on measured numbers, not on that description. Everything here exists to produce those numbers and to keep them reproducible.

| Part | Question it answers | Output |
|---|---|---|
| **Probes** (`src/probes/`) | What does the API actually do: failure rate, latency, behavior under load, data shape? | Raw NDJSON in `results/`, one line per request |
| **Report** (`src/report.ts`) | What should the client's parameters be, and why? | `results/REPORT.md` |
| **Live contract tests** (`tests/live/`) | Which documented and undocumented behaviors does the app depend on? Do they still hold? | Pass/fail |
| **Simulator** (`sim/`) | How does the app behave in each state, on demand and offline? | Local server on `:4000` |
| **Unit tests** (`tests/unit/`) | Are the statistics and the simulator themselves correct? | Pass/fail, no network |

## Quick start

```sh
cd external-tests
npm install

npm test                 # unit tests: statistics, data-quality checks, simulator fidelity (offline, <1 s)
npm run test:live        # contract tests against the real API (~80 requests, ~30 s)
npm run probe:all        # sample → concurrency → scan → report (~1,800 requests, several minutes)
npm run sim              # simulator on http://localhost:4000, calibrated from results/
```

Requires Node ≥ 22. Developed on Node 26.

## Probes

None of the probes retry except the scan. Retry policy is something we measure, not something we assume. Each probe uses a 15 s timeout (`REQUEST_TIMEOUT_MS`) so the true latency tail isn't cut off. Picking the app's timeout is an *output* of the report.

| Script | What it does | Default budget |
|---|---|---|
| `probe:sample -- --n 100 --endpoint both` | Strictly sequential requests to each endpoint. Gives the failure rate with a 95% Wilson interval, latency percentiles for successes vs failures (to last byte and to headers), a histogram, and a failure-clustering check (P(fail \| previous failed) vs P(fail \| previous ok)). | 200 requests |
| `probe:concurrency -- --levels 1,5,10,20,40 --per-level 60` | The logins endpoint at increasing parallelism. Gives throughput, latency under load, failure rate under load, and any 429s. | 300 requests |
| `probe:scan -- --concurrency 10 --max-attempts 8` | Every user's logins, with backoff and retries. Doubles as an end-to-end benchmark of a simple, correct strategy, and writes `results/dataset.json`. | ~1,350 requests |
| `report` | Rebuilds `results/REPORT.md` from every recorded run. | 0 requests |

Set `API_BASE_URL=http://localhost:4000` to run any probe against the simulator instead.

### What the report derives

- **Retry budget:** the smallest *k* such that 1000 · p<sup>k</sup> ≤ 0.5, where *p* is the upper end of the measured failure-rate interval.
- **Timeout:** an empirical cost curve. For each candidate timeout *T*, the expected time per resolved request is E[min(latency, T)] ÷ P(success within T). A tight timeout gives up on slow successes, but it also stops paying for slow failures. The measured distribution decides which effect wins.
- **Concurrency:** the smallest level within 90% of peak throughput. Beyond that you add load to a server you don't own for little gain. `MAX_CONCURRENCY = 50` is a hard politeness cap.
- **Predicted load time:** users × expected time per success ÷ concurrency. Check it against the scan and against the app's own metrics.

### Data-quality checks (from the full scan)

These are assumptions the UI would otherwise make silently. Each one has a unit test in `tests/unit/data-quality.test.ts`:

- The last array item is **not** the most recent login, and arrays are sorted neither way
- Users with zero logins, as opposed to users whose logins could not be fetched
- Ties for the most recent time (which IP do you show?)
- Login times later than now (the humanizer has to handle "in 3 days")
- Invalid or non-routable IPs (the country lookup bonus has no answer for these)
- Duplicate IDs or emails, blank fields, `user_id` mismatches
- Users inactive for 30 days or more (for the highlight bonus)

## Live contract tests

These pin down the behaviors the app depends on. If one fails, the API has changed and the app's assumptions need a second look:

- `/users` is a single unpaginated array with unique integer IDs
- Logins responses are deterministic, which makes them safe to cache and retry
- Logins are **not** ordered by time
- Random failures are `500 {"message": ...}`
- An unknown ID returns `404` with a message (don't retry it)
- **Quirk:** IDs `0` and `abc` return `200` with an **empty body**, so `res.json()` would throw on a success status
- CORS allows any origin

Random 500s are retried inside these tests to avoid flakes, except in the test that checks 500s themselves.

## Simulator

The simulator reproduces every behavior above. By default it serves the real `results/dataset.json` and **resamples latencies from the recorded runs**, separately per endpoint and for successes vs failures. Use it to develop and demo every app state without depending on the real API's luck:

```sh
npm run sim                                    # calibrated: measured failure rate and latencies
FAIL_RATE=0 LATENCY=fixed:20 npm run sim       # happy path, fast
USERS_FAIL_RATE=1 npm run sim                  # page-level error: /users never succeeds
FAIL_RATE=1 USERS_FAIL_RATE=0 npm run sim      # every row fails
LATENCY=uniform:2500:3000 npm run sim          # everything slow (loading states)
SEED=42 npm run sim                            # reproducible sequence of failures
SIM_LOG=1 npm run sim                          # log each request
```

Then start the app with `API_BASE_URL=http://localhost:4000`.

## Caveats

- Latency is measured from the client, so it includes the network round trip to the Vercel region. It describes what the app experiences from this machine, not server time alone.
- About 100 samples per endpoint gives a failure-rate interval of roughly ±8 percentage points. Add more with `--n`.
- The failure model assumes each attempt is independent. The clustering check in the report tests that assumption.
- The timeout model ignores backoff delay and assumes latency doesn't depend on concurrency. The sweep shows how far that holds.

## Layout

```
src/
  config.ts            base URL, timeouts, politeness cap, paths
  lib/http.ts          timedFetch: one request → one Sample (no retry)
  lib/retry.ts         harness retry (scan + contract tests only)
  lib/stats.ts         percentiles, Wilson interval, clustering, retry/timeout models
  analysis.ts          samples/dataset → analyses + suggested parameters
  render.ts            analyses → Markdown
  probes/*.ts          sample, concurrency, scan
  report.ts            results/*.ndjson → results/REPORT.md
sim/                   simulator (server, latency models, data)
tests/unit/            offline tests of the tooling itself
tests/live/            contract tests against the real API
results/               raw runs, dataset snapshot, REPORT.md (committed as evidence)
```
