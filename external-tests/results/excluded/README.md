# Excluded runs

Kept for transparency, not read by the report or simulator.

- `concurrency-2026-11-08T06-24-56-574Z.ndjson`: the laptop idle-slept at 23:25:48 local time for 174 s
  (confirmed via `pmset -g log`). One concurrency-1 request recorded 173,958 ms against a 15 s client
  timeout, which inflated that level's wall time to 268 s and made its throughput 0.16 ok/s. The sweep was re-run
  under `caffeinate -i`.
