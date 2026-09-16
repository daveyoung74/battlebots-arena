# Build a v2 replay arena

AgentBorn is the referee. A game supplies bounded rules data and strategy/event schemas for admission; AgentBorn executes those rules in its own TypeScript engine. A studio can build its renderer in any engine. This React sample only consumes the resulting complete replay. Its historical local engine is isolated in explicit legacy mode.

## Protocol and renderer pins

- Public package: `@agentborn/protocol-v2` **2.0.0-alpha.4**, vendored under its MIT license.
- Match wire revision: `agentborn/2` / `2.0.0-alpha.1`.
- Renderer: `agentborn/duel-replay/1`; event type `duel_exchange`.
- Support: free, two-player matches with no prize sources, door fee or holding tier. Played replays require two qualifiers; walkovers require exactly one and contain no combat; cancellations never invent a replay.
- The included walkover uses `a3.duel_walkover.1` as its empty initial state. It is a synthetic renderer fixture; automatic application walkover production remains a separate path.

Policy pins the game ID, game-version hash, complete registry hash, chain/board and exact rules. Treat that file as reviewed configuration. Never learn approval by trusting the same untrusted response being verified. Changing a game version requires an explicit policy update. Legacy seeds, records and rule versions are never reinterpreted as v2.

## Connect to an explicitly configured test service

1. Obtain the approved policy, match IDs and HTTPS origin from the AgentBorn test deployment. It must expose the public GET routes in the vendored [specification](../vendor/protocol-v2/SPEC.md). Loopback HTTP is supported for local tests. Origin paths, embedded credentials, redirects and other insecure HTTP origins are rejected.
2. Put a JSON file **outside `public`, `dist` and the repository** with exactly these fields:

```json
{
  "origin": "https://your-agentborn-test.example",
  "policy": {
    "gameId": "<approved bytes32>",
    "gameVersionHash": "<approved bytes32>",
    "registryHash": "<approved bytes32>",
    "chainId": "4663",
    "board": "<approved lowercase address>",
    "rules": "<replace with the full approved rules object>"
  },
  "matches": [{ "id": "<approved bytes32>", "label": "Friday duel" }]
}
```

This is a shape illustration, not runnable production configuration. `fixtures/viewer.json` contains a complete synthetic policy and rules object for inspection. There are at most 32 explicitly listed matches; a browser cannot cause arbitrary match downloads. Retire old cache directories through the deployment's ordinary retention process.

3. Set `ARENA_MODE=protocol`, `ARENA_PROTOCOL_CONFIG=/absolute/path/config.json`, and optionally `ARENA_CACHE_DIR=/private/writable/cache`. Run `npm run build`, set `NODE_ENV=production`, then `npm start`. PowerShell: `$env:ARENA_MODE='protocol'`; set the other variables in the same way.
4. Default binding is `127.0.0.1`. A public viewer can explicitly set `ARENA_BIND_HOST=0.0.0.0` behind its HTTPS proxy. Do not expose the Vite development server as a release deployment. The container defaults to a fixture viewer; mount configuration/cache separately for a configured release.

The browser receives only the public policy, labels, allowed match IDs, complete replay bundle and small official signals. It never receives a studio private key, handler session, wallet authority or GrokBot token. Owner authentication and champion management remain on AgentBorn.

## Download and verify

The server fetches status, manifest and registry, then qualification, commitment receipt and the sealed package. After publication it fetches the opening and decrypts the complete replay. It does not request individual events. The browser checks the bundle again before rendering.

The checks bind the configured game/rules/runtime, identity and roster, event type/count/timing/resources, result commitment, encryption envelope and published opening. The displayed assurance is **matches the supplied receipt**. Independent chain inclusion, finality, registry approval and seed ordering are the AgentBorn source's responsibility; the UI does not call this independent chain verification.

Before public opening, an ordinary viewer returns “not released” and offers retry. Once downloaded, playback is entirely local. It makes one automatic small status/opening check at the reveal boundary (or after loading an already-opened cached replay), with manual retries afterward. There is no event stream, long-lived upstream connection or periodic polling loop. Concurrent browsers share short status refreshes. A failed check leaves playback available and marks the status as stale.

The initial bundle is written to a private cache using atomic create-only publication. Retries and concurrent requests reuse it. A restart can recover the complete replay without its original source. Corrupt or conflicting stored content fails closed; it is not silently replaced. Public mode rechecks publication before serving an unopened bundle from any previously used studio cache. Status/opening refreshes do not redistribute, mutate or authorize money.

## Optional private studio preview

A complete early replay necessarily reveals its ending. Only use this for an approved studio in a private development environment. The public viewer works without it.

Set `ARENA_STUDIO_KEY_FILE` to a protected JSON file outside the repository/public directories containing `keyId`, `gameId` and `privateKeyPem` (PKCS8 Ed25519 PEM). This must be an already-approved, game-scoped AgentBorn studio credential. Provisioning or production approval is not performed by this sample.

The server signs only `GET /api/v2/matches/<id>/studio-package`, using a fresh nonce, timestamp and empty-body hash. These headers are not used for public requests. Preview mode forces binding to **127.0.0.1**, rejects foreign Host/cross-site requests, and is not a multi-user access-control service. Do not place it behind a publicly reachable proxy. An authorized local user can inspect all of its replay bytes.

The screen labels the result as pending until the matching public opening is available. It never treats the local end of playback as finality or payment authorization. Revealed openings cannot be rolled back or replaced by a later signal.

## Training Grounds

Training starts at the first qualifying, finalized, actually played free match for a champion in each game. The initial duration is 604800 seconds. Local playback, exhibitions, no-shows, walkovers and cancellations do not create credit.

| Example                                         | Expected behavior                                      |
| ----------------------------------------------- | ------------------------------------------------------ |
| First qualifying completion in game A           | Starts A's seven-day clock                             |
| First time entering game B                      | Independent B history and clock; A does not carry over |
| New approved version of game A                  | Preserves A's original start time                      |
| Unknown or unavailable history                  | Unavailable, never assumed eligible                    |
| Many matches or an offered early-access payment | No bypass in the initial policy                        |

The included public training tests exercise these cases. The viewer shows policy and links to AgentBorn; **a live authenticated eligibility/countdown surface is not mounted in this milestone**. Do not invent a countdown from replay timestamps or pass owner/GrokBot credentials to the studio. Follow-on integration must read the approved AgentBorn human-session status surface with current, scoped evidence.

## Authority and errors

The v2 service offers GET-only health/config/bundle/signal routes. It cannot prepare seats, post results, settle, refund or cancel. Legacy database access, worker execution and outbound platform writes require `ARENA_MODE=legacy`. Configured tokens in a legacy environment file do not enable that authority in v2 mode.

Unknown match IDs return 404; mutation routes are absent or return 405. Unreleased public replays return 425. Invalid/unsupported data and unavailable sources return a generic failure without exposing documents, key paths or credentials. Fix configuration/source issues explicitly, then retry. No fallback to a legacy result is attempted.
