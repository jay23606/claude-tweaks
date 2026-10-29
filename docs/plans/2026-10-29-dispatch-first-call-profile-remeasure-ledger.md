# Open Items — 4030: Re-measure and move build,test dispatch agents to the Standard profile once ceremony is deterministic

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Run the Sonnet arm of the #3212 re-measure: at least 10 live `/claude-tweaks:dispatch` first-call (build,test) firings on the Standard profile (for example under a temporary `model-ceiling: standard` policy), counting /flow bypasses and gate failures per firing. Run archives hold 347 first-call resolutions, all `opus (source: default)`, so there is no Sonnet-arm data on the slimmed procedure (#4026, #4027) (reason-not-auto: live-verification — each firing claims a real backlog record, builds it and opens a PR on the shared queue) | open | — |
