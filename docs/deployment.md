> Legacy v1 / local exhibition reference. Requires explicit `ARENA_MODE=legacy`. For the current read-only v2 viewer, see [the v2 guide](protocol-v2.md).

# Deployment

## One host, two responsibilities

The house program uses a transaction-protected row to publish one next exhibition. Shutdown drains the worker and closes database connections; connection lock waits are bounded.

Run the web service and worker on an always-on Node host, container platform or VM. A static-only host cannot run authoritative combat. A request-only serverless function is not a substitute for the worker.

For a single instance, leave `ARENA_WORKER=true`. For independent processes, set `ARENA_WORKER=false` on the web service, and run `npm run worker` in a worker process with the same configuration/database. Multiple workers are supported: SQL row locks serialize exchanges, schedule reservations use advisory locks, and settlement uses the same idempotent result on retry.

```sh
npm ci
npm run build
npm run db:migrate
# Set NODE_ENV=production in the host's environment.
npm start
```

The Dockerfile performs the build and defaults to the combined web/worker service. Supply environment variables at runtime. Run the migration command once as a release job before starting new application instances. The included Docker Compose database is for local development.

## Configuration

- `ARENA_PUBLIC_URL`: the game's HTTPS origin, without a trailing slash. Choose your subdomain and point its DNS at the host.
- `BATTLEBOTS_URL`: platform origin.
- `DATABASE_URL`: game database connection. Only `arena_` tables are created/read/written by the game.
- `DATABASE_CA_PATH`: optional trusted CA certificate path for managed MySQL. Remote connections verify TLS; do not disable verification.
- `ARENA_GAME_ID`, `ARENA_PRIVATE_KEY`, `ARENA_INTERNAL_KEY`: registered game credentials. The private key is base64 PKCS8 DER Ed25519. The inbound key signs the platform's HMAC envelope.
- `ARENA_MANIFEST_VERSION`: the published platform manifest record version, distinct from the manifest format version and combat rules revision.
- `ARENA_DEMO=false`: disable house exhibitions on the hosted competitive show. Set true if you deliberately want a labeled demonstration channel.
- `ARENA_SLOT_SECONDS=300`, `ARENA_NOTICE_SECONDS=900`: five-minute slots, at least fifteen minutes between the entry cutoff and combat. The earliest slot also includes a full entry window.
- `ARENA_PREMATCH_SECONDS=120`, `ARENA_WRAPUP_SECONDS=60`: broadcast intermissions. Individual entrances use the final twelve seconds.
- `ARENA_REPLAY_DAYS=30`, `ARENA_PRACTICE_DAYS=7`: replay retention.
- `ARENA_TRUST_PROXY`: optional comma-separated Express trusted proxy IPs/subnets. Configure your actual proxy network so rate limits use the visitor address; do not trust arbitrary forwarded headers.

The committed example contains placeholders. `.env`, private credentials and provider media do not belong in the public repository.

## Voice and broadcast

Set `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and optionally `ELEVENLABS_MODEL_ID`. The voice is chosen by the operator and is separate from champion voices. The default model setting is `eleven_multilingual_v2`.

Narration is authored from public identity facts and recorded combat events. Generation runs outside the combat transaction. Audio is cached by text, voice, model, locale and settings revision, with measured duration and a two-megabyte clip cap. Failed or late generation leaves captions in place. Clips play only inside their cue window; the finish interrupts incidental speech.

Use [ElevenLabs' text-to-speech API documentation](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) for account and voice configuration. The MIT license covers this repository's code and original artwork, not a blanket license for provider-generated voices.

The permanent channel is `/`. A match is `/matches/{id}`. Append `?embed=1` for a browser source or `?replay=1` for recorded playback. Browser audio requires the viewer or broadcast operator to enable sound. Frame embedding is allowed from the configured BattleBots origin and the game itself.

## Operations

- `GET /api/health` checks MySQL connectivity and reports whether adapter credentials are present. It does not prove the platform has listed the game.
- `npm run replay:stats` reports event byte median/p95 and audio counts/bytes. Measure CDN/request bandwidth on your host; event budgets do not include audio or images.
- Game events are limited to 64 KiB per fight. Expiry removes the event/cue track while retaining identities and the result. Audio is retained for the show retention window plus a day.
- Monitor pending `arena_outbox` rows, `lastError` in active match payloads, and failed/pending audio assets. Do not rerun combat to repair settlement, HUD or voice.
- A platform outage pauses confirmation/live authorization checks and retries settlement. Already recorded exchanges survive restarts.
- Drain active matches before publishing a new manifest pin: the platform currently requires its listed pin on settlement. Combat rules revisions are separate; retained revision-1 fights can still resume after revision-2 deployment.
- Back up game tables. Retained events reproduce the visuals without executing the game again.
- To move a confirmed slot, cancel the old match through the signed platform contract, then prepare and authorize a new one. Published schedules are immutable. The worker converges cancellation and releases champion bookings.

## Before a public launch

Set the final HTTPS domain and chosen voice, register/pin the game, and run the listing gate in staging with a disposable champion. Keep the platform's regular listing requirement; the sample does not use the built-in Arena exemption. Deploy both the platform contract additions and this game, then verify a real owner entry/return and the configured champion's public Announcr channel. No messages are routed to private venue devices.
