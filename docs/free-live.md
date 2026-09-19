# Approved public free-match reader

`ARENA_MODE=free-live` fetches complete walletless replay packages from an explicitly approved AgentBorn source. It is separate from the [fixed archive mode](free-matches.md) and the older v2 `protocol` mode. This code is available for local rehearsal; no public service activation or game admission is implied.

## Configure the source

Create a protected local JSON file and set `ARENA_FREE_CONFIG` to its absolute path:

```json
{
  "origin": "https://approved-agentborn-service.example",
  "viewer": {
    "mode": "free-live",
    "provenance": "approved-source",
    "matches": [
      {
        "id": "<approved match ID>",
        "profileHash": "<approved free-authority profile hash>",
        "commitment": "<approved result commitment>",
        "label": "Pilot match",
        "champions": ["First champion", "Second champion"]
      }
    ]
  }
}
```

This illustrates the shape; obtain real pins through an approved operator handoff. Never derive approval solely from the same untrusted response being checked. `provenance: disposable-test` labels test material. Display names are presentation labels, not verified identity claims. Up to 32 unique matches are supported. `origin` must be HTTPS with no credentials, path, query or fragment; literal loopback HTTP is allowed for disposable tests.

```powershell
$env:ARENA_MODE = 'free-live'
$env:ARENA_FREE_CONFIG = 'C:/path/to/approved-live.json'
npm run dev
```

The sample binds to loopback. Its server fetches only `GET /api/free-matches/{approvedId}/replay` with `X-AgentBorn-Revision: free.match.public-read.1`. It sends no session, bearer token, studio grant or wallet credential, and rejects redirects. The upstream path is not the handler queue API. No credentials belong in this config or the browser.

## Playback and refresh

A single download contains the entire replay. Play, pause, seek, restart and speed changes need no upstream requests. Use **Refresh result status** to check for release or recorded training credit. That downloads another complete bounded package; it does not stream events or poll in the background. Attempts are spaced at least five seconds apart, concurrent reads for one match are coalesced and no more than two matches fetch at once.

The page says **Result at last refresh**, not continuously current status. An unavailable, revoked, malformed or regressed source causes an unavailable response; the server never substitutes its last success. After a failed refresh the browser removes the previous replay from view. Fetches are bounded to 2 MiB and 35 seconds upstream; private upstream errors are not displayed.

## What the reader trusts

The profile and result commitment remain fixed across finalized → released → recorded. The reader independently checks the manifest, opening and replay hashes, seed/outcome/result commitments and supplied receipt/call/event/state/finality evidence using the same checks as archive mode. Altering an opening cannot be excused by a new package digest. Within a reader session, prior receipts cannot change, released cannot regress to finalized and recorded completion cannot disappear or change. Across restarts, fixed configuration still binds the result; current completion freshness comes from the approved source, not a durable sample ledger.

AgentBorn's native service verifies chain ancestry, historical runtime, certified execution and current completion records on each read. The sample relies on that service for freshness and does not independently contact an RPC or verify certificate signatures. A renderer cannot award training credit or initiate, settle or cancel matches. Viewing the replay does not create credit.

Only **finalized/released** packages are accepted. Earlier committed openings still need additional publication evidence. Canceled/unsubmitted matches have no replay and no public terminal-record adapter in this milestone; use the handler's own AgentBorn view for those states. Walkovers display the qualified winner with no fake combat or played-match credit.

## Validation

`npm test` covers live progression, restart pins, regressions, changed evidence, fixed origins, credential/redirect isolation, coalescing, request budgets and source failure without stale fallback. The paired application suite runs its native disposable contracts, database and certified worker through a real HTTP adapter into this reader. Its handoff is `docs/FREE_MATCH_PUBLIC_DELIVERY.md`. Production activation, real-provider staging and the full two-handler browser journey remain separate release requirements.
