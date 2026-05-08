# LGTM Security Watchdog Action

A GitHub Action that halts CI runs which [LGTM Security](https://looksgoodtomeow.in/dashboard/security) has flagged for blocking issues — at the start of the job, before any other step runs.

## Usage

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: LGTM Security gate
        uses: tarin-lgtm/security-watchdog-action@v1
        with:
          api-token: ${{ secrets.LGTM_TOKEN }}

      - uses: actions/checkout@v4
      # … rest of your job
```

Generate `LGTM_TOKEN` at https://looksgoodtomeow.in/dashboard/security/tokens (scope: `pipeline:read`) and add it to your repo's GitHub Actions secrets.

## How it works

1. The Action runs as the first step of your job.
2. It calls `GET /pipeline/decision?repo=<owner/repo>&sha=<head_sha>` against the LGTM API with your token.
3. If LGTM has a `halt: true` decision for this commit, the Action calls `core.setFailed(reasons)` and the job exits non-zero — before any subsequent step runs.
4. If LGTM hasn't computed a decision yet (push-triggered scan still running), the Action polls for up to 90 seconds before giving up.

## Soft-fail behavior

If LGTM is unreachable, the Action **does not** fail your job by default. We never want to break customer CI on an LGTM outage. Set `fail-on-network-error: true` to flip that behavior if you'd rather fail closed.

| Situation | Default behavior |
|---|---|
| `halt: true` from LGTM | Fail the job |
| `halt: false` | Pass |
| No decision after 90s | Pass with warning |
| 401 / bad token | Fail (customer misconfig) |
| 5xx / network error | Pass with warning |

## Inputs

| Name | Required | Default | Description |
|---|---|---|---|
| `api-token` | yes | — | LGTM API token with `pipeline:read` scope |
| `api-url` | no | `https://api.looksgoodtomeow.in` | Override for self-hosted deployments |
| `fail-on-network-error` | no | `false` | Fail the job on transient API errors |
| `poll-timeout-seconds` | no | `90` | Max wait for a pending decision |

## Outputs

| Name | Description |
|---|---|
| `halt` | `"true"` / `"false"` |
| `reasons` | Newline-separated reasons when `halt=true` |
