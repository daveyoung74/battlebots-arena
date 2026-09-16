> Legacy v1 / local exhibition reference. Requires explicit `ARENA_MODE=legacy`. For the current read-only v2 viewer, see [the v2 guide](protocol-v2.md).

# BattleBots contract surface

Arena is an external HTTP game. It uses the same registration and signature mechanisms available to another developer. It does not import the platform SDK that depends on private implementation modules, read platform tables, or create a second account system.

All examples use placeholders. `ARENA_PUBLIC_URL` is the game origin; the registered `base_url` includes `/api`.

## Register and discover

`GET /api/manifest` returns the manifest. The slug is `gladiators`; the platform's historical built-in `arena` slug is unrelated.

```json
{
  "version": 1,
  "slug": "gladiators",
  "name": "Arena",
  "endpoints": {
    "base_url": "https://your-arena.example/api",
    "ready": "/matches/ready",
    "ready_contract": 1
  },
  "queues": ["normal", "ranked"],
  "rails": ["xp"]
}
```

The full manifest declares three integer agent fields, their bounds/defaults/widgets, two HUD fields, and the permitted mutable keys. Publishing a manifest and passing conformance/listing remain platform operations. Manifest format version 1, the platform's manifest record version, and Arena's combat rules version are separate concepts.

`ready_contract: 1` is an additive opt-in. Older games retain their existing entry controls. Version 1 preparation accepts `practice`, `casual`, or `ranked`, with `headless` supported for Practice.

## Signing

Game → platform requests use these headers:

- `x-champions-timestamp`: Unix milliseconds as a decimal string.
- `x-champions-nonce`: fresh 16-byte random nonce encoded as hex.
- `x-champions-signature`: base64 Ed25519 signature.

The exact signed message is:

```text
timestamp + "." + nonce + "." + lowercase_hex_sha256(raw_utf8_body)
```

The private key is base64 PKCS8 DER. The platform registers its matching base64 SPKI DER public key. Sign the exact JSON bytes sent, not a reserialized object. Retries use a fresh envelope but identical semantic operation/body.

Platform → game uses the same message construction with HMAC-SHA256 and the assigned internal key, carried as hex in `x-champions-hmac`. Arena verifies the signature in constant time, enforces a five-minute clock window, and atomically consumes the nonce in `arena_adapter_nonces`. Reusing a valid nonce returns 409. Invalid signatures return 401. Validation failures return 400; closed/full entries return 409.

See `src/battlebots/crypto.ts` for the standalone implementation. Rotate keys using the platform's registered-key mechanism and update the host's secrets; old keys fail validation. A single active key pair is supported.

## Prepare, authorize, finalize

1. Arena's public `POST /api/matches/ready` accepts `{"mode":"practice","headless":false}`. It prepares an opportunity and returns the platform `match_id`, `external_match_id`, schedule and entry link.
2. Arena opens that match through signed `POST /api/v1/games/{gameId}/matches`.
3. Owner authorization happens on BattleBots through its existing `POST /api/v1/matches/{matchId}/enter`. Owners can also prepare through `POST /api/v1/games/{gameId}/ready`. GrokBot uses `prepare_match` or `POST /api/v1/bot/games/{gameId}/ready`, then the existing inspect/dry-run/enter flow.
4. BattleBots sends the frozen entry snapshot to Arena. Arena validates and persists acceptance, then responds.
5. Arena polls the signed entry receipt. A provisional platform row is not enough: the receipt marks an entry confirmed only after outbound acceptance and its durable entry-completion event.

Example opening a ranked slot:

```json
{
  "external_match_id": "game-generated-uuid",
  "queue": "ranked",
  "fee_mint": "xp",
  "fee_amount": 0,
  "prize_rule": {
    "kind": "xp",
    "presentation": {
      "version": 1,
      "watch_url": "https://your-arena.example/matches/game-generated-uuid",
      "starts_at": 1800001200000,
      "entry_deadline": 1800000300000
    }
  },
  "timeout_sec": 1800,
  "manifest_version": 1
}
```

Practice uses `queue:"normal"`, zero fee, XP proof and `prize_rule.kind:"practice"`. That immutable kind suppresses XP, automatic winner marks, competitive stats, Ranked effects and competitive Career events. Casual uses `normal` plus `kind:"xp"` and earns configured rewards. No paid rail is advertised.

Entry at `POST /api/matches/{externalId}/enter`:

```json
{
  "champion_id": "champion-id",
  "owner_ref": "64-character-game-scoped-owner-hmac",
  "manifest_version": 1,
  "profile": {
    "owner_config": {},
    "agent_config": { "aggression": 50, "feint_rate": 25, "recover_below": 2 }
  },
  "proof": { "kind": "xp" }
}
```

`owner_ref` is an additive game-scoped opaque value; it lets PvP reject two champions with the same owner without exposing the owner ID. Entry is idempotent for an identical frozen strategy. Changing the profile later does not alter this match.

The signed receipt endpoint is:

`POST /api/v1/games/{gameId}/matches/{externalId}/receipt` with `{}`.

```json
{
  "match_id": "platform-match-id",
  "external_match_id": "game-generated-uuid",
  "status": "live",
  "manifest_version": 1,
  "entries": [
    {
      "champion_id": "champion-id",
      "confirmed": true,
      "owner_ref": "64-character-game-scoped-owner-hmac",
      "identity": {
        "id": "champion-id",
        "name": "Champion",
        "handle": "champion",
        "portrait": "https://platform.example/portrait.png",
        "title": "BATTLEBOTS CHAMPION",
        "fact": "2 Ranked wins. 1 Ranked losses."
      }
    }
  ]
}
```

Optional identity metadata includes live token references and recent competitive rematch evidence with settlement revisions. No profile settings, bearer tokens, private owner data, balances or unreleased randomness are returned to spectators.

The platform may mark a match live after its first entry. Arena independently requires its complete roster and finalized receipts before running. Stale unconfirmed local acceptances are reconciled, and unfilled opportunities expire.

## Settlement, cancellation, correction and HUD

Signed `POST /api/v1/games/{gameId}/matches/{externalId}/settle`:

```json
{
  "settle_seq": 1,
  "manifest_version": 1,
  "results": [
    { "champion_id": "champion-a", "outcome": "win" },
    { "champion_id": "champion-b", "outcome": "loss" }
  ]
}
```

Only real entrants are submitted. Practice's house opponent is local and never becomes a fake platform champion. Persist the final result before sending; retry the same ordered array and sequence. Arena exposes the game outcome immediately but marks it official only after platform acknowledgment.

Signed `POST .../cancel` with `{}` cancels and releases bookings through worker reconciliation. The server cannot advance a locally cancelled match.

The platform also provides signed `POST .../correct` with an incremented `settle_seq` and complete result array. Corrections reverse previous rewards and apply the replacement once. Arena's first release does not expose an administrative correction UI or replace stored replay revisions; build that projection before using corrections operationally.

Signed `POST /api/v1/games/{gameId}/champions/{championId}/state` writes:

```json
{ "last_outcome": "win", "last_opponent": "Opponent" }
```

HUD projection runs after competitive settlement. Per-champion locks and rederiving the latest settled match keep a delayed old job from overwriting newer state. Practice does not overwrite competitive HUD.

## Schedule notifications

Signed `POST /api/v1/games/{gameId}/matches/{externalId}/schedule`:

```json
{
  "kind": "scheduled",
  "starts_at": 1800001200000,
  "revision": 1,
  "watch_url": "https://your-arena.example/matches/game-generated-uuid"
}
```

Kinds are `scheduled`, `reminder`, `rescheduled`, and `schedule_cancelled`. They become public champion events handled by the platform's existing Announcr outbox. Arena holds no Announcr credentials and does not send owner/device messages.

The start and watch URL must match the immutable opened match. Duplicate kind/revision is idempotent; stale revisions and closed/past-start notifications are rejected. A changed time or pairing requires cancel-and-rebook with fresh authorization. A show announcement requires two finalized entries.

## Public presentation and replay

- `GET /api/show`: current broadcast, confirmed upcoming slots, recent results, server clock.
- `GET /api/matches/{externalId}`: released public events/cues, entrants, phase and result.
- `GET /api/matches/{externalId}/presentation`: versioned capability descriptor with visual/outcome mode, nullable watch/embed/replay URLs, replay state/expiry, and revision.
- `GET /api/audio/{contentHash}`: cached narration, immutable response, measured duration header.

The browser polls with backoff and aligns to the server clock. It never submits attacks or results. Future exchanges and unreleased cues remain server-only. Headless matches have no visual watch/replay capability, but their match page can show results and logs.

Replays store events and cue metadata, not video. The browser replays the same timeline, including entrances, and never invokes the simulator. Expiry keeps the final result. The proposed entrance envelope includes version, stable cue ID, match/champion identity, profile revision, sequence, time window, caption and evidence. It currently has no external venue-delivery adapter.
