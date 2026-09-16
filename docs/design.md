> Legacy v1 / local exhibition reference. Requires explicit `ARENA_MODE=legacy`. For the current read-only v2 viewer, see [the v2 guide](protocol-v2.md).

# BattleBots Arena: standalone reference game design

Status: broader design, now accompanied by the v0.1 implementation. See [README](../README.md) for delivered scope and remaining extensions. [Rules revision 2](rules.md) supersedes the original combat numbers below. Production registration and deployment are separate.
Repository: **BattleBots-Arena**, public and MIT licensed.
Working game title: **Gladiators**, proposed slug `gladiators` (distinct from
the platform's existing `arena` fixture).

Build a short, watchable gladiator autobattler in the separate BattleBots-Arena
repository, hosted on a separately configured subdomain of battlebots.gg. An owner
chooses a champion, tunes three tactics, and enters a duel. The server resolves
the fight on a shared timeline; a public browser view shows the attacks, blocks, and turning point live, with replay afterward.
BattleBots records the result in the champion's Career.

The game has three modes: reward-free Practice for testing, Casual (unranked)
matches that award XP and may offer game-defined prizes, and scheduled Ranked
duels presented as a show throughout the day. Practice is the first engine
slice; Casual and the scheduled Ranked show are part of the intended game.
Paid entry and prediction-market integrations follow later. Unranked does not
mean unrewarded; Practice is an explicit testing mode with its own policy.

Every match runs on the game server: practice, headless simulations and visual
duels. Clients only render authoritative state, events and logs. They never
choose outcomes, advance match time or submit combat results. Replays render
recorded output and never count as another match.

## What exists today

- `src/server/arena.ts`: Arena opens and enters a single-champion match, then
  chooses win/loss with `Math.random()`. The average of five strategy values
  moves win probability between 45% and 55%. There is no simulated opponent,
  combat timeline, or replay. Held paid matches also reread current strategy at
  settlement instead of resolving from the stored entry snapshot.
- `src/server/games.ts`: Arena already demonstrates manifest-driven strategy
  controls and both XP and token rails, with special first-party shortcuts.
- `src/server/grounds.ts`: Training Grounds demonstrates signed adapter calls,
  owner-only settings, agent settings, and signed HUD state updates. Its match
  state uses an in-memory Map; it is a conformance fixture, not durable combat
  infrastructure.
- `src/server/matches.ts`: shared entry, frozen profile snapshots, settlement,
  cancellation, corrections, Career events, inventory updates, and money rails.
- `src/server/sdk/champions-adapter.ts`: a signed reference client that can
  dispatch locally while still verifying signatures.

Keep Arena and Training Grounds as platform test fixtures. Give Gladiators its own game
identity, manifest, state, and pages. Older platform briefs prohibit gladiator
theming in general platform copy; this requested game's theme belongs within
its game surfaces, without changing the BattleBots brand.

## Player experience

1. Choose an existing champion, enable Gladiators and tune its tactics.
2. An owner or authorized bot manager can run Practice immediately against a
   house preset, visually or as a fast server simulation with log output.
3. Compare results and adjust strategy. Practice awards no XP, prizes,
   inventory, rating or competitive titles.
4. Enter a Casual match to earn XP and any advertised game prizes without rating changes, or enroll for Ranked through BattleBots. Once selected and confirmed, see the
   opponent, scheduled time, strategy-lock deadline and public watch URL.
5. Tune in for introductions, statistics, countdown, combat and wrapup.
   Anyone can watch without signing in.
6. Watch a retained replay, return to practice or authorize another entry.

House opponents are visibly labeled game-owned NPCs, with no champion account,
wallet or fake owner. Practice history stays separate from competitive records
and broadcast statistics. Routine practice does not post to champion channels.

## Casual competition and rewards

Casual means an unranked competitive match, not a practice simulation. Owners
and authorized bot managers may enter through the same BattleBots authorization
rails. Casual awards configured XP and can award the prizes the game explicitly
offers. It does not change Ranked rating or Ranked standings. Its results count
in the champion's Casual Career record; Practice records remain separate.

| Mode | XP | Prizes | Ranked rating | Purpose |
| --- | --- | --- | --- | --- |
| Practice | None | None | No change | Repeatable strategy testing |
| Casual (unranked) | Configured XP | Game-defined, when offered | No change | Competition without rating pressure |
| Ranked | Configured XP | Game-defined, when offered | Updated by platform rules | Scheduled competitive show |

Arena initially uses the existing normal queue and XP rail for free Casual
competition. Publish normal and ranked support as each mode becomes available.
Keep fee, queue and reward policy separate: a free match can still award XP or
an explicitly funded/available prize, and an unranked match is not automatically
reward-free. Expose mode and expected reward rules before authorization.

Use shared settlement for Casual XP and the Casual win/loss record, with
idempotent prize awards and append-only corrections. Game-defined rewards need
a declared, validated reward rule and authoritative award path. The current
adapter settlement payload does not accept arbitrary prize awards; a manifest
SKU alone does not implement a reward. The current automatic winner mark also
needs an intentional mapping before being presented as an Arena prize. Use
supported platform rewards initially and specify a public contract extension
before introducing another prize type. Never promise a prize the game cannot
actually deliver, or let a client claim its own reward.

Product recommendation: distinguish eligible Casual competition from repeated
controlled simulations. Keep unlimited strategy tests in Practice, and define
transparent eligibility/rate limits for rewarded entries before enabling reward
volume. This avoids making repetitive bot farming the main progression path
without withholding XP from ordinary unranked competition. Reward tuning and
any limits should be visible; they are not yet specified numerical policies.

Casual is available outside the Ranked show schedule. All visual Casual matches
remain publicly watchable, and can have replays under the same retention policy.
Broadcast Ranked statistics as Ranked, Casual statistics as Casual, and never
include Practice in competitive form. Routine practice stays out of public
announcement feeds; Casual results can use existing result-event preferences.

## Practice authorization and reward policy

Practice is a free testing mode, separate from rewarded Casual, available within operational rate and
concurrency limits. It uses the same versioned server engine as Ranked, with
either visual viewing or fast headless execution. Return an inspectable log,
health, damage, action counts and outcome explanation. Proposed practice log
retention is seven days, configurable independently from show replay retention.

Owners and bot managers request practice through authenticated BattleBots
surfaces. Respect ownership, game enablement, bot scopes and strategy allowlists.
Use a frozen authorized profile; any ad-hoc strategy override must pass those
same rules and must not mutate the saved strategy. A house preset requires no
second owner authorization. Never fetch a real opponent's private strategy to
offer an unauthorized practice opponent.

Required public contract addition: an immutable Practice purpose/reward policy
validated at open and enforced through entry, settlement, correction, inventory,
ratings, XP, titles and event consumers. Exact wire shape/version is still to
be specified. Current normal settlement awards XP and a winner inventory mark;
zero fee and an empty inventory manifest do not prevent that. Do not settle
practice as Casual and later reverse rewards. Preserve existing Casual behavior
for other games. Practice history is separate from competitive records, streaks,
leaderboards and announcement feeds.

Document practice request/result endpoints for owners and bot managers. Every
visual practice run is publicly watchable while running; headless practice
has result/log output without a fake live visual. Public output never includes
raw private strategy configuration. Repeated practice cannot farm rewards.

## Scheduled Ranked show

Arena owns a durable schedule throughout the day and a continuous public show
URL, alongside individual match URLs. BattleBots owns entry authorization and
official results. Store UTC times and display the viewer's timezone. Operators
configure show windows, slot cadence, notice lead time and segment lengths.
Proposed starting timings:

| Segment | Duration | Content |
| --- | --- | --- |
| Pre-match | 2 minutes | Introductions, champion statistics, matchup context and countdown |
| Combat | Up to 24 seconds | Server-authoritative live duel |
| Wrapup | 1 minute | Decisive exchanges, outcome and confirmed progression changes |
| Intermission | Remainder of slot | Next pairing, later lineup, champion spotlights and relevant fan tokens |

Publish confirmed pairings ahead of pre-match coverage; initial target is at
least 15 minutes' notice. Schedule and show phase are separate from adapter
match status. With insufficient entrants, show the next real start time or a
clearly labeled archive replay. Do not fabricate bookings or results.

### Enrollment, selection and strategy lock

A champion joins the Ranked pool through an owner/bot-authorized request
covering availability, expiry, maximum matches and eventually the entry-fee
cap. Pool enrollment is not a confirmed match. The platform needs a documented
deferred-entry authorization, or explicit entry confirmation by the deadline;
the game cannot assume permission to enter a champion later. Never give the
game shared cookies or a broad owner bearer as a shortcut.

Select compatible champions by rating proximity and oldest eligible enrollment.
Token holdings or prices do not affect selection. Atomically reserve slots and
prevent overlapping competitive bookings; start with at most one confirmed
upcoming Ranked match per champion. Selection and retries use stable IDs.
Expose selected, awaiting authorization, confirmed, locked, live, settling,
completed, rescheduled and cancelled states.

The owner/bot can query the next scheduled match, opponent, start time,
confirmation state, strategy-lock/withdrawal deadline and watch URL. Only
confirmed schedules trigger tune-in announcements. Proposed lock is the start
of the two-minute pre-match segment. Final authorized entry freezes the profile
at that boundary. Selection must not accidentally freeze an old profile or
rewrite an existing entry snapshot; if entry must lock earlier, state that
actual deadline explicitly. Revalidate eligibility and authorization at entry.

Both entries must finalize before combat. Before lock, missing or revoked
authorization releases the slot with a schedule update. Do not silently replace
an opponent in a confirmed pairing; rebooking needs a new revision and applicable
consent. Keep distant schedule reservations separate from executable matches,
whose adapter timeouts are bounded. Cancellation/refund rules and any later
paid commitments must be shown before authorization.

### Show operation, statistics and tokens

The server advances the show clock with or without viewers. Late arrivals join
the current phase. Restart restores the same lineup and phase. Presentation
failure cannot change combat; interruptions are labeled honestly. A late fight
must not overlap another booking or silently remove its promised advance notice:
publish schedule revisions. Wrapup may say Settlement pending without stalling
the entire show, then update when BattleBots confirms the result.

Use timestamped public champion data: name, portrait, backstory excerpt, ranked
record, rating, recent competitive form, titles and head-to-head history where
available. Exclude practice. Never invent statistics or reveal private tactics.
The ElevenLabs house announcer describes verified facts and never runs combat; production details appear below.

Intermissions rotate the next confirmed match and later lineup. Show relevant
champion fan-token cards with verified mint identity, symbol and a link to the
champion token surface. Optional market metrics require a supported integration,
source and as-of time; display missing/stale states accurately. A champion with
no token receives the same lineup and combat treatment. Cards authorize no
trades or wallet actions. The sample reads only permitted public contract data.

### Announcr tune-in messages

Arena submits authenticated schedule events to BattleBots, which validates
game ownership and entrants and writes durable outboxes for each participating
champion's public Announcr channel. No platform Announcr key or owner OAuth token
is shared with the game. Scheduling events are not currently in the relevant
allowlists and require platform event and message-template additions.

Proposed events: match.scheduled, match.reminder, match.rescheduled and
match.schedule_cancelled. Include match/game IDs, champions, opponent, UTC start,
watch URL and monotonic schedule revision. At confirmation announce the booking
on each champion's channel; optionally send one configurable pre-match reminder.
Deduplicate by event kind, match, revision and champion. Suppress stale queued
messages after rescheduling/cancellation; correct an announcement already sent.
Channel delivery failures do not block combat. The schedule page/manager API
is authoritative. Respect existing channel enablement and provisioning rules.

### Future prediction-market integration

Advance lineup publication and pre-match coverage provide time for external
market creation and speculation. Initial scope includes no market creation,
trading, odds or funds handling. A later versioned event surface supplies stable
match/entrant IDs, confirmed schedule revisions, lock and combat-start timestamps,
official result revisions and cancellation/correction signals. Consumers must
deduplicate and reconcile missed events.

Do not precompute or disclose a Ranked result before a prediction window closes.
Combat begins on the server at its announced start; seeds and future events
remain private. A later explicitly market-enabled mode needs a market-cutoff
acknowledgment or a published failure policy disabling that integration before
combat starts. Schedule changes, replacements, cancellations and corrections
need explicit external resolution rules; a corrected Career result does not
automatically correct or void an external market. The show runs independently
while prediction integrations are absent.

## Broadcast identity and spectacle

Use React with SVG/CSS portrait tokens for the first renderer. Champion
portraits are the recognizable combatants; no independent 3D bodies, custom
rigs or Three.js dependency are needed. Build a deliberate broadcast style with
strong framing, typography, animation and sound. Spectacle must help viewers
understand the server's fight and care about its participants.

### Signature champion entrances

Each champion gets a repeatable 5–8 second entrance within the existing
pre-match segment: portrait reveal, champion colors/frame, name and title,
short musical or sound signature, and an introduction by the house announcer.
Pair the entrance with one interesting verified fact: a win streak, a previous
close result, a title defense or a head-to-head record. If history is sparse,
use a short approved identity introduction instead of inventing achievements.

Version and snapshot an entrance profile containing champion ID, portrait
reference, palette/frame preset, entrance animation preset, sound asset
reference, pronunciation hint where supplied, and approved introduction text.
Keep this game-owned initially, populated only from permitted public champion
fields and explicitly supported owner customization. Do not silently add fields
to the BattleBots manifest or scrape private data. Default presets must work
for every champion, and newcomers receive the same production quality.

Render entrances consistently across the show, individual match viewing and
retained show replays. Late viewers join the current phase; they should not
restart the entrance for everyone. Keep text and portraits legible on phones
and provide a reduced-motion equivalent. Use original or appropriately licensed
sounds; no per-champion custom animation or voice generation is required.

### ElevenLabs broadcast personality

Use one distinctive ElevenLabs voice as the house announcer: composed and
confident for introductions, sharp at a turning point, and clear in the recap.
The owner chooses the voice; the exact voice ID is still to be supplied or
selected. Make it server-configurable and separate from any champion's own
voice. Use licensed stock assets or a voice the operator is authorized to use.
The MIT sample includes placeholder configuration and replaceable audio assets,
not credentials or an assumption that provider-generated assets share its license.

Start with authored commentary templates filled from verified public facts and
server events. Text generation can be added later under the same fact checks.
Example: '[Name] enters on a three-match Ranked winning streak' only when that
statistic exists; 'That feint got through the guard' only after that exchange.
Never announce a winner before the final combat event, and distinguish the
game outcome from an officially settled reward or rating change.

Generate introduction and matchup audio ahead of confirmed show slots. Cache
by normalized text, voice/settings revision and locale, with duration and cue
metadata. Build a small reusable library for live reactions and use event-driven
selection; dynamic post-match recaps may synthesize asynchronously. No external
voice request sits in the combat execution path. Missing/late audio falls back
to captions and sound effects; a failed provider call cannot delay or reroll
combat. Invalidate queued personalized audio when its schedule/fact revision
changes, so a cancelled pairing is not introduced later.

The show has one authoritative commentary cue sequence, rather than generating
speech per spectator. Cues carry IDs, match/show revision, factual event refs,
text, audio asset ID, start time, expiry and duration. Suppress duplicates and
stale reactions. Allow one spoken line at a time, leave space for the fight,
and give the finish priority over incidental commentary. Late viewers skip
expired cues; reconnecting must not replay a pile of old announcements.

Provide captions/transcript, mute, volume and an explicit Enable sound control
when playback requires user interaction. Duck background music under speech
and reserve stronger impacts for actual meaningful events. Broadcast embeds
use the same audio timeline. Retain the cue track and referenced audio for the
advertised show-replay period; if audio expires earlier, offer a labeled silent
replay with its transcript. Track generation volume, cache reuse, audio bytes,
provider failures and serving bandwidth separately from the combat event budget.
Audio generation is configurable/optional for people running the public sample;
the intended hosted show uses ElevenLabs, while local setup remains usable
with captions and supplied licensed fixture sounds.

### Readable combat and a decisive replay

Use large portrait tokens, clear health/stamina meters, lunges, recoil, shield
flares, slash trails and impact flashes. Communicate Strike, Feint, Guard and
Recover with distinct motion, icons and labels. A shield effect represents the
actual Guard/damage event, not an invented armor system. Exhaustion is visible
only when stamina forces recovery. Portraits remain recognizable throughout.

Give the final exchange a stronger finish treatment after its authoritative
event arrives. Client animation never modifies simulation speed, damage or RNG.
Afterward, select a short turning-point replay from stored events: the final
exchange plus relevant preceding exchanges, or an observed lead change,
blocked attack sequence or forced recovery that set it up. Use explicit,
deterministic selection rules with event IDs and one factual explanation.
Do not assert a counterfactual such as 'would have won' without separately
running and labeling that analysis.

Include this replay in wrapup, clearly labeled Replay with its exchange/time
range. It neither creates another match nor awards anything. Let viewers open
the full replay or inspect the log. Announcer cues reference the same selected
events. If no standout moment is supported, show the finish without inventing
a dramatic turning point.

### Real rivalries and a recognizable show

Build matchup stories from confirmed competitive history: rematches, streaks,
previous narrow finishes, rating-gap upset attempts and title defenses. Show
the evidence behind a claim and keep Casual/Ranked records distinct. Describe
contrasting tactics only from permitted public information or already observed
actions, never from private frozen strategy. Newcomer introductions work with
no history. Corrections invalidate affected facts and queued commentary.

Narratives decorate eligible pairings; they do not secretly manipulate results,
handicap opponents or override fair selection. If featured rematches become an
explicit scheduling option later, publish that selection policy and honor the
same consent and availability constraints.

Provide one permanent Watch Arena page with the current show, a next-match
countdown, a compact later lineup and follow links to participating champions
and their public channels. Visitors can leave it running or learn exactly when
to return. Include a clear offline/next-show state and labeled archive playback
between show windows. Follow actions use supported platform/channel links and
existing authorization; the game does not subscribe a viewer automatically.

### Reusable entrance cues for future Announcr venues

Treat an entrance as structured presentation data that a later venue product
can render, not a browser-only animation command. Define a proposed versioned
cue envelope with cue ID, show/match/champion IDs, entrance-profile revision,
cue kind, intended start, expiry, ordered sequence, asset references, caption
and factual evidence references. Initial kinds include entrance.begin,
entrance.voice, entrance.accent and entrance.end. Keep adapters separate from
combat and from champion-channel tune-in announcements.

For now only Arena's browser/broadcast renderer consumes these cues. A future
Announcr venue adapter could map them to house audio, displays and configured
lighting effects after a public contract is agreed. This is a design seam,
not a claim that venue APIs exist. Any external delivery goes through an
explicit authenticated integration, with idempotency and expiry so reconnects
do not trigger a late entrance twice. Venue acknowledgments and device outages
cannot stall combat. Never expose platform Announcr credentials to the sample,
and do not automatically route public show audio into owners' private devices.

### First production prototype and pacing gate

Build one representative server-run duel with two memorable entrances, readable
portrait combat, sound design, the ElevenLabs house voice (or a caption/audio
fixture until configured), and a turning-point replay. Use it to judge whether
we want to watch another match even knowing the outcome. Check comprehension
with sound off as well as with the full broadcast mix.

The current 24-exchange limit and one-second exchange cadence are provisional.
Test whether the fight permits visible momentum changes and an intelligible
finish. Avoid spending minutes on buildup for combat that feels trivial or
rushed. Tune the rules/cadence and pre/post balance before fixing the schedule;
version gameplay changes and publish timing changes for future slots. Do not
fake suspense with invented events or silently stretch an already scheduled
live match. This prototype proves presentation and pacing before the larger
show automation is built.

## Small combat ruleset

One arena, two combatants, one shared sword-and-shield kit. No movement inputs,
gear economy, classes, loot chase, or LLM decisions during combat. Champion
identity and portrait come from BattleBots; kit and tactics determine combat.
Global XP and fan coins provide no combat-stat advantage.

Initial tuning proposal:

- Both combatants start at 100 health and 6 stamina; maximum stamina is 6.
- At most 24 simultaneous exchanges. Each combatant chooses from the previous
  exchange's state, so processing order confers no advantage.
- **Strike:** costs 2 stamina and deals 12 damage.
- **Feint:** costs 3 stamina; deals 6 damage normally and 10 through Guard.
- **Guard:** restores 1 stamina and reduces an incoming Strike to 3 damage.
- **Recover:** restores 3 stamina and takes full incoming damage.
- Stamina gains cap at 6. Insufficient stamina replaces an attack with Recover.
- Resolve both actions, resource changes, and damage together. Clamp health at
  zero. Stop after an exchange leaves either combatant at zero health.
- A surviving combatant wins. For simultaneous knockouts or the exchange cap,
  compare remaining health, then cumulative damage dealt, then a seeded coin
  flip. Show “decision” and the tie-break reason when applicable. Adapter v1
  only accepts `win` and `loss`, so do not emit a draw.

Strategy is a small behavior policy, not a direct win-probability bonus:

| Control | Manifest field | Effect |
| --- | --- | --- |
| Aggression | `aggression`, integer 0–100, default 50 | When able to attack, attack probability is `0.25 + 0.005 × aggression`; otherwise Guard. |
| Feint frequency | `feint_rate`, integer 0–100, default 25 | When attacking with at least 3 stamina, choose Feint with probability `feint_rate / 100`; otherwise Strike. |
| Recovery threshold | `recover_below`, integer 0–4, default 2 | Recover first when stamina is below this threshold; zero disables proactive recovery. |

All three fields live in `champion_input.grokbot`, with labels and presentation
hints, and are listed in `grokbot.mutable`. The owner can edit all three;
GrokBot remains limited by the owner's allowed keys and grant. No owner-only
field is needed for v1: do not invent an extra setting just to exercise it.

Initial house presets are Charger (85/10/1), Sentinel (25/20/3), and Trickster
(55/80/2), in aggression/feint/recovery order. Publish their tendencies before
entry. Treat these numbers as starting values: simulation should establish
whether attacking, guarding, feinting, and recovery have meaningful tradeoffs.
They are not a claim of balanced play.

Generate a cryptographically random seed once on the server and persist it
before simulation. A versioned deterministic PRNG drives policy choices and
tie-breaks. The same seed, ordered entrant snapshots, opponent definition, and
rules version must reproduce the same timeline and result. Allocate random
draws consistently per exchange and combatant. Never reroll on a retry.

## Visual scope

Use a compact React/CSS or SVG stage with a sand floor, two champion portrait
tokens, sword/shield markers, names, and health/stamina bars. A token advances
on Strike, shows a shield on Guard, flashes a feint marker, and rests on Recover.
Small damage numbers and an exchange caption make the mechanics readable.
No skeletal animation, sprite pipeline, physics engine, or 3D renderer is
necessary. Violence is stylized and non-graphic.

For replay, provide play/pause, restart, 2× speed, skip to result, and a text combat log. Live viewing follows the server timeline; pausing enters a labeled delayed view with a Go live control. Future exchanges cannot be skipped to.
Respect reduced motion. Keep the stage usable at phone widths and distinguish
actions by labels/icons as well as color. Playback consumes stored events;
animation timing, background tabs, and skipping cannot affect results.

Label running combat Live, paused historical viewing Delayed, and completed
playback Replay. An instant simulation shown afterward is always a replay.
Public viewing data includes identity, actions, and combat state, but never
owner credentials, grants, wallet balances, unreleased random seeds, future
actions, or raw private configuration blobs. Store the original identity
display snapshot so old replays remain intelligible after a champion is renamed.

## Public spectating and optional replay

Public viewing is a game capability, independent of Practice/Casual/Ranked and free/paid
entry. Every visual Arena duel is watchable by anyone while running, including
signed-out visitors and people who do not own a champion. Viewing never grants
entry rights or affects the simulation. Other games can run outcome-only
simulations with no visual surface; BattleBots should show their status and
result without a broken or misleading Watch button.

| Match presentation | While running | After completion |
| --- | --- | --- |
| Visual with replay | Watch live | Watch replay while retained |
| Visual without replay | Watch live | Result; replay unavailable |
| Outcome-only | Running status | Result; optional replay only if the game provides one |

BattleBots should expose Watch live from active match listings, game pages,
and champion pages. Completed Career results link to Watch replay when one is
available. The game serves a stable public match URL that transitions from
waiting to live to settling to result/replay, and retains a result page after
replay expiry. Arena also provides a public list of currently running duels.

### Shared live timeline

For Arena, advance authoritative combat at one exchange per second after a
short public countdown. Persist each exchange before publishing it. The worker
owns the clock; having zero viewers, closing a tab, pausing, or opening several
tabs does not stop, speed up, restart, or multiply the match. Persist start
time, event sequence, simulation state and PRNG position so recovery resumes
the same fight. A worker outage shows an interrupted state and resumes with
an explicit timeline adjustment; never label stale animation as live.

A spectator who joins midway receives a public state snapshot and the current
event cursor, then incremental events. Start with cursor-based short polling
(about once per second for this small sample), with bounded responses, shared
caching and reconnect backoff. SSE is an optional later transport, not a
requirement of the BattleBots contract. Deduplicate by sequence; recover gaps
from a snapshot and catch-up events. Include server time and timestamps so
clients can align animation despite differing arrival times. Never send future
events or the seed to the browser during the match.

At combat completion, show the game outcome as pending settlement until
BattleBots confirms it. A settlement delay must not keep a finished fight
labeled Live. Instant headless simulations may settle immediately and expose
only the result, or a clearly labeled replay if they produce renderable data.

### Website and broadcast viewing

Provide a read-only embed layout for a single match, suitable for a BattleBots
page or a livestream browser source: stage, names, bars, match identity and
Live/Replay indicator, with no account controls. A normal browser can open it
without login. Permit framing from configured BattleBots origins and publish
the embed URL separately from the full page URL. Cross-origin embedding uses
an iframe and explicit framing policy, not shared cookies. Validate any
postMessage origin and payload if host integration is later added.

This allows a broadcaster to capture the game view. Encoding video and sending
it to a streaming service are separate broadcaster infrastructure, not part
of the initial sample. The show has a stable continuous channel URL that advances through matches,
wrapups and intermissions without replacing the broadcaster's source URL.

### Proposed public contract extension

The current manifest has no spectating/replay capability declaration. Define
and version an optional presentation contract alongside adapter v1; these are
proposed fields, not fields that already work in the frozen manifest:

- Game capabilities: public live viewing supported, replay supported, and a
  presentation descriptor endpoint on the registered game origin.
- Match descriptor: schema version, platform and external match IDs,
  presentation mode, live state (unavailable/waiting/live/interrupted/ended),
  public watch URL, optional embed URL, start/end timestamps, replay state
  (unsupported/pending/available/expired/failed), optional replay URL and expiry,
  and a monotonic descriptor revision.
- Fetch the descriptor over HTTPS from the registered origin. If updates are
  pushed into BattleBots, authenticate them with adapter credentials. Validate
  returned URLs against approved origins; descriptors carry data, never HTML.
- BattleBots stores or caches small descriptors and links. Arena serves public
  snapshots, events and replay artifacts from its own infrastructure. A stale
  or unavailable descriptor must not block entry accounting or settlement.
- Older games without this extension default to no public viewing. Capability
  support does not imply every match has a replay. Platform match status alone
  is insufficient: its current live status starts at first entry, before a
  game necessarily begins combat.

### Replay data and retention

Use the same public combat events for live rendering and replay. Retain an
initial public state, timestamped ordered events, final state, event schema
version, rules version, renderer compatibility version, identity/asset
references and an integrity hash. Keep private reproducibility inputs separate.
Retaining events avoids making future playback depend on reproducing old RNG
or exposing private strategy snapshots. Preserve support for old event schemas
and retain any game-owned assets needed for the advertised replay period.

Proposed default: retain public replay artifacts for 30 days, configurable by
the operator, while retaining the authoritative result and small metadata
according to the game's result policy. Expiry removes the replay artifact and
updates its descriptor; the public URL continues to show the result and
Replay expired. Never delete the only copy needed for pending settlement or
an active correction. Retain private audit inputs under a separate explicit
policy; public replay expiry is not a promise that all match data was deleted.

Budget target for this 24-exchange game: at most 64 KiB of serialized event
replay data per duel before compression, excluding voice/audio, portraits and other shared
assets. This is a design budget, not a measured size. At 10,000 duels/day and
30 days, that cap is approximately 18.3 GiB of replay payload, excluding indexes,
replicas, backups and assets. Bandwidth depends on views: 100 full replay
views at the cap transfer about 6.25 MiB of payload per match, before protocol
and asset costs. Measure actual artifacts and serving traffic during the
prototype; report median/p95 size, daily volume and replay cache hit rate.
A configurable byte limit should prevent oversized artifacts from exhausting
storage. If replay creation fails, retain the result and expose replay state
failed; do not rerun combat. No video recording is required.

## BattleBots integration

| Rail | Use in Gladiators |
| --- | --- |
| Identity and game enablement | Existing champion and owner authorization; no second account or champion creator. |
| Manifest and profiles | Immutable published manifest, pinned version, existing strategy form and frozen entry snapshot. |
| Match lifecycle | Signed open → owner/GrokBot entry → signed settle; signed cancel on unrecoverable failure. |
| Career and progression | Shared settlement owns XP, record, configured rewards, events, and standings. |
| GrokBot | Existing discovery, dry-run, strategy permissions, and generic match entry. Avoid a special gladiator-only grant. |
| Game state / HUD | Signed `last_outcome` and `last_opponent` updates from settled results. Keep per-exchange state in the game. |
| Announcr and sharing | Reuse settlement event consumers and add a replay link in relevant game/Career UI. No per-strike announcements. |
| SOL / paid entry | Later: use existing Play balance debit, pot settlement, refunds, and spending caps. |

Initial practice registration requires the explicit reward-free contract described above. No inventory SKU,
three strategy fields, and HUD fields `last_outcome` (none/win/loss) and
`last_opponent` (string, max 64). The shared settlement code currently owns
reward behavior; declaring a SKU does not by itself implement a new reward
rule. Practice must suppress automatic winner marks as well as XP. Defer competitive cosmetic rewards until their mapping is specified.

Implement a standalone HTTP client for game-to-platform operations using the
documented signing format, and verify the full signed HMAC envelope for
platform-to-game entry. No imports from BattleBots server code, local dispatch,
platform-table access, or shared runtime state. A database host/schema may be shared as described below, but Arena owns only its prefixed tables. Pass the stored match manifest
version on settlement; never silently substitute the latest version. Verify
current platform pin behavior and resolve version-change handling before
publishing upgrades with outstanding matches.

Register the game with an absolute HTTPS base URL on its separate subdomain.
This uses the existing external HTTP adapter path and avoids the platform's
Arena and Training Grounds local routing. The sample must exercise exactly the
contract available to another game developer.

Run the existing conformance listing gate for this game. Do not use Arena's
listing exemption or treat first-party code as exempt from the contract.

## Durable execution and recovery

### Database configuration and table naming

Use the database credentials already supplied in the local .env configuration;
do not request replacement credentials or print their values. The current task
workspace has .env in the BattleBots checkout; the Arena checkout does not yet
have its own .env. During setup, load the existing local configuration through
an explicit server-only path or configure Arena's ignored .env with the needed
settings. Do not copy unrelated platform secrets into the public sample.
Production supplies configuration independently through the deployment host.

Prefix every table owned by this game with arena_. This is the stable database
namespace for BattleBots-Arena, independent of its public display name or the
proposed gladiators manifest slug. Examples: arena_matches, arena_match_entries,
arena_show_slots, arena_show_events, arena_replays, arena_entrance_profiles,
arena_audio_assets and arena_adapter_nonces. Create only tables implementation
actually needs; this list is illustrative, not a migration to run now. Use the
same prefix for any migration-history, outbox, job or join tables created by
Arena tooling. Namespace indexes/constraints where the database requires it.

A shared database instance or schema is acceptable with the provided connection.
Arena migrations must create/alter only arena_ tables and never modify or read
BattleBots platform tables. Champion identity, authorization and official
results still come over the public contract. Treat platform IDs as external
references rather than cross-application SQL foreign keys. Audit the migration
tool's metadata table configuration before running its first migration.

Keep .env files ignored; .env.example contains placeholders only. Migration
files contain schema definitions, never connection credentials. No database
connection or schema change is required merely to record this convention.

Suggested code ownership inside BattleBots-Arena:

- `src/game/`: pure engine, rules, manifest, replay types.
- `src/battlebots/`: standalone HTTP client, signing, request validation.
- `src/server/`: game persistence and orchestration.
- `src/app/api/`: manifest, ready, public match/replay, signed enter.
- `src/app/matches/[externalId]/`: replay page.
- `src/components/`: stage, playback controls, result panel.
- `worker/`: game-owned durable simulation and settlement retries.

Add game-owned SQL records for matches (external/platform IDs, manifest and
rules versions, seed, NPC definition snapshot, phase, replay, result) and
entrants (unique match/champion, frozen profile, display snapshot, acceptance).
Persist pending work durably; a worker sweep can recover jobs missed between
SQL commit and queue submission. An in-memory Map is insufficient.

The signed entry handler validates game, match, version, proof, capacity, and
profile, and stores an idempotent acceptance before acknowledging. It must
not simulate or settle while entry is still in progress. Platform entry may
roll back if the response times out; reconcile game acceptance against the
platform's finalized entry through the contract before starting. The current lifecycle has no
explicit finalize callback, so integration must establish a durable entry
completion boundary or equivalent reconciliation guarantee; a sleep or mere
presence of a preliminary entry in a GET response is insufficient. Any missing
capability must be documented and implemented as a public contract improvement
in BattleBots, not worked around with database access from the sample.

Workers claim matches atomically. Persist each live exchange once, then persist
one final simulation result and timeline. Submit the same ordered results with
`settle_seq: 1` until confirmed.
After confirmation, project HUD state through signed state updates. Serialize
HUD writes per champion and rederive the latest settled result when retrying,
so an older job cannot overwrite a newer result. A HUD failure must not rerun
combat. Publish the official result only after platform settlement confirmation.

Cancellation and timeout must converge both game and platform state. A late
worker must not settle a cancelled match. Corrections go through the existing
append-only correction contract and retain the prior replay/result revision.
Store combat locally; do not add timeline fields to frozen adapter v1 payloads.

## Subsequent modes

**Scheduled free Ranked PvP (core show):** two champions, independently authorized, with identical
base stats. Add `ranked` in a new manifest version. Reserve exactly two slots
atomically, reject duplicate/same-owner opponents, and wait for both finalized
entries before resolution. Add a ready/join flow usable by the owner UI and
generic GrokBot match discovery. Platform `live` currently starts with the
first entry, so game-level readiness must track the complete roster. Cancel an
unfilled duel at its advertised timeout. Use existing ranked rating behavior;
do not describe it as Elo without implementing that system.

**Paid PvP:** publish token support only once free PvP and failure recovery
work. Both owners authorize the advertised equal entry fee through the
existing SOL proof and cap checks. The platform handles prize distribution
and refunds. No paid house sparring or game-owned wallet logic. Validate
timeout refunds, rejected second entry, duplicate settlement, and cancellation
races before enabling the mode.

## Public sample and deployment boundary

The repository already has an MIT license; preserve it. Provide a README,
`.env.example` with placeholders, reproducible local setup, migration commands,
engine tests, HTTP contract tests, and a deployment guide. Use original simple
visuals and document any third-party asset licenses. Do not copy platform
implementation modules or production configuration into the public sample.

Configuration includes the public game URL, BattleBots API origin, assigned
game ID, adapter Ed25519 private key, inbound HMAC key, and the game's own
database connection. Secrets are server-only and injected by the host. The
domain is configurable; the precise subdomain has not been chosen. A developer
can point the sample at a local or staging BattleBots installation with their
own registered game credentials.

The separate hostname must not depend on BattleBots session cookies. In the
first release, owner enablement, strategy editing, and authorized entry stay
on BattleBots; the game links there and supplies its ready/replay surfaces.
The game-hosted public ready endpoint only prepares an opportunity to play;
it never authorizes an owner or debits funds. Apply rate limits and expiration
to abandoned ready matches. The platform Games/dashboard UI needs a supported
launch-and-return integration so entry can lead to the game's replay. Verify
that flow against existing endpoints and document any required public contract
addition before implementing it. Do not invent cross-domain login tokens or
ask users to paste a GrokBot bearer into the game.

Document exact request/response fixtures for open, enter, settle, cancel,
correct, state, and public match status. Include raw-byte signing tests,
timestamp skew, a durable expiring nonce store, key rotation, and duplicate
requests. The existing reference SDK imports platform internals and cannot
be used unchanged as a standalone dependency. The sample's HTTP client should
be small enough for another developer to copy and understand.

Keep contract gaps explicit: entry finalization, outstanding manifest upgrades,
and platform launch/replay navigation need agreement at the public boundary.
The standalone game can build its engine and playback independently while
those integration details are resolved. BattleBots remains the authoritative
source for entry authorization and settled Career results.

## Delivery and acceptance

1. Build the production prototype above with the pure engine, portrait entrances,
   house voice/captions, readable combat and turning-point replay. Evaluate pace,
   mobile/reduced-motion presentation and sound-off comprehension. Verify exact
   replay reproducibility, simultaneous damage, stamina limits, termination,
   and tie-breaks. Sweep strategy combinations to find dominant settings and
   adjust the explicitly versioned rules before treating them as balanced.
2. Add durable NPC Practice and its signed adapter path. Verify one practice
   record and zero change to XP, prizes, inventory, rating or competitive records. Edit strategy after entry and prove it does not
   change that fight. Restart the worker between simulation and settlement
   and prove it resumes without rerolling or duplicating awards.
3. Verify rejected/timed-out entry leaves no playable orphan, cancellation
   wins against late work, signature/nonce/version checks run locally and via
   HTTP, and conformance passes. Check keyboard, reduced motion, mobile
   layout, and replay/result agreement. Verify signed-out live access, two
   viewers observing the same sequence, late joins, reconnect gap recovery,
   zero-viewer completion, worker interruption, no future-event leakage, website
   embedding and a broadcast browser source. Verify outcome-only games show no
   live link, replay expiry preserves results, and artifacts meet the byte budget.
4. Add rewarded Casual entries. Verify exactly-once configured XP and supported
   prizes, Casual record updates, zero Ranked rating/title effects, and reward
   correction behavior. Verify Practice still awards nothing and bot permissions
   apply to both modes.
5. Add the scheduled Ranked show and continuous channel. Verify atomic slot
   selection, independent authorization, strategy locks, no overlapping bookings,
   schedule notification retries/cancellations, intermission cards and restart
   recovery. Verify authoritative audio cue synchronization, stale-cue suppression,
   provider failure fallback, factual rivalry copy, replay audio retention and
   absence of venue/private-device side effects. Then add paid PvP and the ledger
   failure cases above.

The first release is complete when the owner can understand a duel, see their
strategy affect actual combat, and find its authoritative result in BattleBots
without learning another account, wallet, or settings system.
