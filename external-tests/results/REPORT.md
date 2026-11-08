# Fake Users API: measurement report

Generated 2026-11-08T06:37:10.135Z against `https://fake-users-api.vercel.app`.
Sources: `sample-2026-11-08T06-19-09-235Z.ndjson`, `concurrency-2026-11-08T06-34-12-948Z.ndjson`, `scan-2026-11-08T06-30-18-268Z.ndjson`.

> Latencies are measured from this client, so they include network round-trip time to the Vercel region.
> They describe what *this* app will experience from here, not pure server time.

## 1. Baseline: sequential, no retries

### GET /users

- Requests: **100** · failed: **21** → 21.0% (95% CI 14.2%–30.0%)
- Failure types: `http-500` ×21
- Clustering: P(fail) 21.0% · P(fail | prev failed) 0.0% (n=21) · P(fail | prev ok) 26.9% (n=78) → a failure makes the next request *less* likely to fail (z = -2.68; unusual, worth a closer look)

| Latency | n | min | p50 | p90 | p95 | p99 | max | mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Success (last byte) | 79 | 160 ms | 1.82 s | 2.90 s | 3.03 s | 3.17 s | 3.21 s | 1.78 s |
| Success (headers) | 79 | 153 ms | 1.79 s | 2.85 s | 2.97 s | 3.07 s | 3.09 s | 1.73 s |
| Failure (last byte) | 21 | 224 ms | 1.89 s | 2.86 s | 3.07 s | 3.14 s | 3.15 s | 1.75 s |

| Bucket (ms) | Success | Failure |
| --- | --- | --- |
| 100–250 | 1 | 1 |
| 250–500 | 4 | 1 |
| 500–1000 | 14 | 3 |
| 1000–1500 | 13 | 4 |
| 1500–2000 | 12 | 2 |
| 2000–2500 | 14 | 6 |
| 2500–3000 | 16 | 2 |
| 3000–4000 | 5 | 2 |

### GET /users/:id/relationships/logins

- Requests: **100** · failed: **25** → 25.0% (95% CI 17.5%–34.3%)
- Failure types: `http-500` ×25
- Clustering: P(fail) 25.0% · P(fail | prev failed) 36.0% (n=25) · P(fail | prev ok) 21.6% (n=74) → no significant clustering (z = 1.43): consistent with independent failures

| Latency | n | min | p50 | p90 | p95 | p99 | max | mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Success (last byte) | 75 | 180 ms | 1.67 s | 2.76 s | 2.86 s | 2.95 s | 3.07 s | 1.63 s |
| Success (headers) | 75 | 179 ms | 1.67 s | 2.76 s | 2.86 s | 2.95 s | 3.07 s | 1.63 s |
| Failure (last byte) | 25 | 310 ms | 1.82 s | 2.91 s | 2.95 s | 3.00 s | 3.02 s | 1.85 s |

| Bucket (ms) | Success | Failure |
| --- | --- | --- |
| 100–250 | 3 | 0 |
| 250–500 | 4 | 2 |
| 500–1000 | 14 | 3 |
| 1000–1500 | 11 | 4 |
| 1500–2000 | 16 | 4 |
| 2000–2500 | 13 | 4 |
| 2500–3000 | 13 | 7 |
| 3000–4000 | 1 | 1 |

## 2. Concurrency sweep: logins endpoint, no retries

| Run | Concurrency | n | Failure rate | p50 (ok) | p95 (ok) | max (ok) | Wall | OK / s | 429s | Timeouts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-08T06-34-12 | 1 | 60 | 21.7% (95% CI 13.1%–33.6%) | 1.80 s | 2.94 s | 3.05 s | 101.34 s | 0.46 | 0 | 0 |
| 2026-11-08T06-34-12 | 5 | 60 | 18.3% (95% CI 10.6%–29.9%) | 1.71 s | 2.95 s | 3.23 s | 21.13 s | 2.32 | 0 | 0 |
| 2026-11-08T06-34-12 | 10 | 60 | 28.3% (95% CI 18.5%–40.8%) | 1.68 s | 2.87 s | 3.07 s | 12.55 s | 3.43 | 0 | 0 |
| 2026-11-08T06-34-12 | 20 | 60 | 28.3% (95% CI 18.5%–40.8%) | 1.63 s | 2.87 s | 3.14 s | 6.50 s | 6.61 | 0 | 0 |
| 2026-11-08T06-34-12 | 40 | 60 | 23.3% (95% CI 14.4%–35.4%) | 1.50 s | 3.00 s | 3.16 s | 4.17 s | 11.04 | 0 | 0 |

## 3. Full scan: bounded concurrency + retries (baseline strategy)

- Run `2026-11-08T06-30-18-268Z` at concurrency **10**
- Wall time: **218.16 s** for 1000 users (1311 requests, 1 of them to /users)
- Resolved: **1000/1000** · per-attempt failure rate 23.7% (95% CI 21.4%–26.0%)

| Attempts used | Users |
| --- | --- |
| 1 | 758 |
| 2 | 192 |
| 3 | 36 |
| 4 | 10 |
| 5 | 4 |

## 4. Data quality

- Snapshot taken 2026-11-08T06:33:56.433Z: **1000** users
- Logins per user: min 1, median 3, max 5
- Login times span 2025-11-07T05:56:56.000Z → 2026-11-08T00:00:00.000Z

| Check | Users affected | Example ids | Implication |
| --- | --- | --- | --- |
| Duplicate user ids | 0 | — | Rows keyed by id would collide. |
| Non-integer user id | 0 | — | Would break the logins URL. |
| Missing/blank first name, last name or email | 0 | — | Name/email cells need a fallback. |
| Email fails a basic format check | 0 | — | Display as-is; do not make it a mailto: link blindly. |
| Shared email address | 0 | — | Email is not a unique key. |
| Logins never fetched (unresolved after retries) | 0 | — | Excluded from the login checks below. |
| user_id in response ≠ requested id | 0 | — | Would attach logins to the wrong row. |
| logins is not an array | 0 | — | Must be treated as an error state, not "no logins". |
| Zero logins | 0 | — | Needs a "Never logged in" state; not an error. |
| Unparseable / non-ISO login_time | 0 | — | Skip bad entries when choosing the most recent. |
| Last item is NOT the most recent login | **536** | 1, 5, 10, 11, 12 | Using logins.at(-1) would show the wrong login. |
| Logins sorted neither ascending nor descending | **523** | 1, 2, 3, 5, 10 | No ordering can be assumed; compute the max. |
| Most recent time shared by 2+ logins | 0 | — | Which IP to show is ambiguous; pick a stable rule. |
| Has a login dated after the scan time | 0 | — | Humanizer must handle "in N days"; decide if these count. |
| Invalid ip_v4 | 0 | — | Display raw; skip country lookup. |
| Most recent IP is private/reserved | **154** | 6, 11, 12, 14, 15 | Country lookup (bonus) will have no answer. |
| Inactive ≥ 30 days (by most recent login) | **787** | 1, 3, 4, 5, 6 | Bonus highlight; 30 days approximates "one month". |

## 5. Suggested client parameters

Based on 100 sequential logins samples and 1000 users. These are starting points to justify in the app's README, not decisions.

- **Retry budget:** per-attempt failure rate 25.0% (95% CI 17.5%–34.3%). Using the upper bound, **8 attempts** keeps the expected number of users still failing ≤ 0.5 across 1000. Retry 5xx/timeouts only, never 4xx.
- **Timeout:** lowest expected time per resolved request is at **4.00 s** (2.25 s per success; 6 attempts needed at that timeout). Model assumes attempts are independent and ignores backoff.
- **Concurrency:** peak throughput 11.04 ok/s at 40; **40** already reaches ≥ 90% of that, so higher adds load for little gain.
- **Predicted time to load every user:** ≈ **56.30 s** (users × expected time per success ÷ concurrency). Compare against the scan and against the app's own metrics.

| Timeout | P(success per attempt) | Mean attempt cost | Expected time per success | Attempts needed |
| --- | --- | --- | --- | --- |
| 250 ms | 3.0% | 249 ms | 8.29 s | 250 |
| 500 ms | 7.0% | 484 ms | 6.92 s | 105 |
| 750 ms | 10.0% | 706 ms | 7.06 s | 73 |
| 1.00 s | 21.0% | 904 ms | 4.31 s | 33 |
| 1.50 s | 32.0% | 1.23 s | 3.84 s | 20 |
| 2.00 s | 48.0% | 1.47 s | 3.07 s | 12 |
| 2.50 s | 61.0% | 1.62 s | 2.66 s | 9 |
| 3.00 s | 74.0% | 1.69 s | 2.28 s | 6 |
| 4.00 s | 75.0% | 1.69 s | 2.25 s | 6 |
| ∞ | 75.0% | 1.69 s | 2.25 s | 6 |
