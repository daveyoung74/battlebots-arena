import { useCallback, useEffect, useRef, useState } from "react";
import * as P from "@agentborn/protocol-v2";
import {
  BUNDLE_BYTES,
  applySignal,
  bundleSchema,
  frameAt,
  signalSchema,
  verifyBundle,
  type VerifiedView,
  type ViewerConfig,
} from "../protocol/model.ts";
import { accent, unlockSound } from "./sound.ts";
import "./viewer.css";
import { read } from "./http.ts";
function date(seconds: string) {
  return new Date(Number(seconds) * 1000).toLocaleString();
}
const seconds = (ms: number) => (ms / 1000).toFixed(1) + "s";
export function ProtocolApp({ config }: { config: ViewerConfig }) {
  const [selected, select] = useState(config.matches[0].id),
    [view, setView] = useState<VerifiedView | null>(null);
  const [error, setError] = useState(""),
    [signalError, setSignalError] = useState(""),
    [loading, setLoading] = useState(true);
  const [time, seek] = useState(0),
    [playing, play] = useState(false),
    [speed, setSpeed] = useState(1),
    [sound, setSound] = useState(false);
  const [refreshing, setRefreshing] = useState(false),
    [attempt, retry] = useState(0);
  const active = useRef<VerifiedView | null>(null),
    generation = useRef(0),
    signalBusy = useRef(false);
  useEffect(() => {
    const controller = new AbortController(),
      request = ++generation.current;
    active.current = null;
    setView(null);
    setLoading(true);
    setError("");
    setSignalError("");
    play(false);
    seek(0);
    void read(
      `/api/viewer/matches/${selected}/bundle`,
      bundleSchema,
      BUNDLE_BYTES,
      controller.signal,
    )
      .then((bundle) => verifyBundle(bundle, config.policy))
      .then((next) => {
        if (request === generation.current) {
          active.current = next;
          setView(next);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && request === generation.current)
          setError(
            e instanceof Error ? e.message : "Replay could not be checked",
          );
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
    return () => {
      controller.abort();
      generation.current++;
    };
  }, [selected, config.policy, attempt]);
  const refresh = useCallback(async () => {
    const previous = active.current,
      request = generation.current;
    if (!previous || signalBusy.current) return;
    signalBusy.current = true;
    setRefreshing(true);
    try {
      const signal = await read(
        `/api/viewer/matches/${previous.bundle.manifest.matchId}/signal`,
        signalSchema,
        P.LIMITS.documentBytes,
      );
      const next = await applySignal(previous.bundle, signal, config.policy);
      if (request === generation.current) {
        active.current = next;
        setView(next);
        setSignalError("");
      }
    } catch {
      if (request === generation.current)
        setSignalError(
          "Official status could not be refreshed. The downloaded replay remains available; the status shown is from the last successful check.",
        );
    } finally {
      signalBusy.current = false;
      setRefreshing(false);
    }
  }, [config.policy]);
  // One check at the reveal boundary, plus manual retries. Playback never makes a network request.
  useEffect(() => {
    if (config.mode === "fixture" || !view || view.bundle.kind !== "replay")
      return;
    const wait = view.bundle.opening
      ? 0
      : Math.max(
          0,
          Number(view.bundle.manifest.schedule.revealAt) * 1000 -
            Date.now() +
            250,
        );
    if (wait > 2147483647) return;
    const timer = setTimeout(() => void refresh(), wait);
    return () => clearTimeout(timer);
    // Each download schedules one refresh; subsequent signals cannot create polling.
  }, [selected, loading, refresh, config.mode]);
  const duration =
    view?.bundle.kind === "replay" ? view.bundle.replay.durationMs : 0;
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last = performance.now();
    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      seek((t) => Math.min(duration, t + elapsed * speed));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, speed]);
  useEffect(() => {
    if (time >= duration) play(false);
  }, [time, duration]);
  const exchange = view ? frameAt(view, time) : null,
    previousSeq = useRef(-1);
  useEffect(() => {
    if (exchange && exchange.seq !== previousSeq.current && playing && sound)
      accent(exchange.actions[0], 0.4);
    previousSeq.current = exchange?.seq ?? -1;
  }, [exchange?.seq, playing, sound]);
  const toggle = () => {
    if (time >= duration) seek(0);
    play((p) => !p);
  };
  const bundle = view?.bundle,
    replay = bundle?.kind === "replay" ? bundle.replay : null;
  const winner = view?.result?.placements[0],
    winnerName = replay?.visibleRoster.find(
      (f) => f.championId === winner,
    )?.name;
  const official =
    bundle?.kind === "cancelled"
      ? "Match cancelled"
      : view?.result
        ? view.result.kind === "walkover"
          ? "Official walkover"
          : "Official result published"
        : "Official result pending";
  return (
    <div className="viewer">
      <header className="v-nav">
        <a href="/" className="v-brand">
          <span aria-hidden="true">A</span> ARENA <small>by AgentBorn</small>
        </a>
        <span className="v-mode">
          {config.mode === "fixture"
            ? "LOCAL DEMO"
            : config.studioPreview
              ? "PRIVATE STUDIO PREVIEW"
              : "PROTOCOL V2"}
        </span>
      </header>
      <main>
        <div className="v-intro">
          <p className="v-kicker">THE REPLAY ROOM / 001</p>
          <h1>Every move tells a story.</h1>
          <p>
            Two autonomous champions. One complete match. Watch the strategy
            unfold.
          </p>
        </div>
        <section className="v-program" aria-label="Match selection">
          <label htmlFor="match">On the program</label>
          <select
            id="match"
            value={selected}
            onChange={(e) => select(e.target.value)}
          >
            {config.matches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span>
            {config.mode === "fixture"
              ? "Synthetic fixtures · no rewards or training credit"
              : "Complete replay · local playback"}
          </span>
        </section>
        {loading && (
          <div className="v-message" role="status">
            Downloading and checking the complete replay…
          </div>
        )}
        {error && (
          <div className="v-message" role="alert">
            <h2>Replay unavailable</h2>
            <p>{error}</p>
            <button onClick={() => retry((n) => n + 1)}>Retry download</button>
          </div>
        )}
        {view && bundle && (
          <>
            <section
              className="v-stage"
              aria-label="Replay arena"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || !duration) return;
                if (e.code === "Space") {
                  e.preventDefault();
                  toggle();
                }
                if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
                  e.preventDefault();
                  seek((t) =>
                    Math.max(
                      0,
                      Math.min(
                        duration,
                        t + (e.code === "ArrowRight" ? 1000 : -1000),
                      ),
                    ),
                  );
                }
              }}
            >
              <div className="v-stage-top">
                <span>
                  {bundle.kind === "cancelled"
                    ? "CANCELLED"
                    : replay?.kind === "walkover"
                      ? "WALKOVER"
                      : "DUEL / REPLAY"}
                </span>
                <span>
                  {replay?.kind === "played"
                    ? `EXCHANGE ${exchange ? exchange.seq + 1 : 0} / ${view.events.length}`
                    : "NO COMBAT"}
                </span>
              </div>
              {bundle.kind === "cancelled" ? (
                <div className="v-no-combat">
                  <span aria-hidden="true">—</span>
                  <h2>No contest. No invented ending.</h2>
                  <p>
                    The match was cancelled. No combat replay is available, and
                    cancelled matches do not earn training credit.
                  </p>
                  <p>
                    Reason: {bundle.cancellation.reason.replaceAll("_", " ")}.
                  </p>
                </div>
              ) : (
                <div
                  className={`v-fighters ${replay?.kind === "walkover" ? "v-solo" : ""}`}
                >
                  {replay?.visibleRoster.map((fighter, i) => {
                    const health =
                        exchange?.fighters[i].health ?? view.rules.health,
                      stamina =
                        exchange?.fighters[i].stamina ?? view.rules.stamina.max;
                    return (
                      <article
                        className={`v-fighter v-fighter-${i}`}
                        key={fighter.championId}
                      >
                        <div className="v-fighter-title">
                          <p className="v-kicker">
                            {i === 0
                              ? "01 / THE IRON RESOLVE"
                              : "02 / THE QUIET THREAT"}
                          </p>
                          <h2>{fighter.name}</h2>
                        </div>
                        <img
                          src={`/portraits/${i === 0 ? "rook" : "nyx"}.svg`}
                          alt=""
                          width="260"
                          height="310"
                        />
                        <div className="v-stats">
                          <label>
                            Health{" "}
                            <strong>
                              {health} / {view.rules.health}
                            </strong>
                          </label>
                          <meter
                            min={0}
                            max={view.rules.health}
                            value={health}
                            aria-label={`${fighter.name} health`}
                          />
                          <label>
                            Stamina{" "}
                            <strong>
                              {stamina} / {view.rules.stamina.max}
                            </strong>
                          </label>
                          <meter
                            min={0}
                            max={view.rules.stamina.max}
                            value={stamina}
                            aria-label={`${fighter.name} stamina`}
                          />
                        </div>
                        <p className="v-action">
                          {replay.kind === "walkover"
                            ? "Only qualified entrant"
                            : exchange
                              ? `${exchange.actions[i]}${exchange.forced[i] ? " · forced recovery" : ""}`
                              : "Ready for the opening move"}
                        </p>
                      </article>
                    );
                  })}
                  {replay?.kind === "played" && (
                    <span className="v-versus" aria-hidden="true">
                      VS
                    </span>
                  )}
                </div>
              )}
              {duration > 0 && (
                <div className="v-controls">
                  <label className="v-timeline">
                    Replay position
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={100}
                      value={time}
                      onChange={(e) => seek(Number(e.target.value))}
                      aria-valuetext={`${seconds(time)} of ${seconds(duration)}`}
                    />
                  </label>
                  <div className="v-buttons">
                    <button className="v-primary" onClick={toggle}>
                      {playing ? "Pause" : time >= duration ? "Replay" : "Play"}
                    </button>
                    <button
                      onClick={() => {
                        play(false);
                        seek(0);
                      }}
                    >
                      Restart
                    </button>
                    <output>
                      {seconds(time)} <span>/ {seconds(duration)}</span>
                    </output>
                    <label>
                      Speed{" "}
                      <select
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                      >
                        <option value={0.5}>0.5×</option>
                        <option value={1}>1×</option>
                        <option value={2}>2×</option>
                      </select>
                    </label>
                    <button
                      aria-pressed={sound}
                      onClick={() => {
                        if (!sound) unlockSound();
                        setSound(!sound);
                      }}
                    >
                      Sound {sound ? "on" : "off"}
                    </button>
                  </div>
                  <p className="v-keyboard">
                    Focus the arena: Space to play or pause · Arrow keys to seek
                  </p>
                </div>
              )}
            </section>
            <div className="v-details">
              <section className="v-status">
                <p className="v-kicker">THE OFFICIAL SIGNAL</p>
                <h2>{official}</h2>
                {winnerName && <p className="v-winner">{winnerName} wins.</p>}
                <p>
                  {config.mode === "fixture"
                    ? "Demonstration only. The receipt is synthetic, and no funds move."
                    : view.assurance === "studio_preview_unverified_outcome"
                      ? "This early studio replay can reveal the ending. It has not yet been checked against a published opening."
                      : view.assurance === "matches_supplied_receipt"
                        ? "The replay matches the published opening and supplied receipt. This viewer does not independently prove chain inclusion or finality."
                        : "Cancellation reported by the configured AgentBorn source. This viewer does not independently prove chain finality."}
                </p>
                <dl>
                  <div>
                    <dt>Public reveal</dt>
                    <dd>
                      {config.mode === "fixture"
                        ? "Synthetic fixture timeline"
                        : date(bundle.manifest.schedule.revealAt)}
                    </dd>
                  </div>
                  <div>
                    <dt>Source status</dt>
                    <dd>{bundle.status.lifecycle.replaceAll("_", " ")}</dd>
                  </div>
                </dl>
                {config.mode === "protocol" && (
                  <button onClick={() => void refresh()} disabled={refreshing}>
                    {refreshing ? "Checking…" : "Refresh official status"}
                  </button>
                )}
                {signalError && (
                  <p role="alert" className="v-warning">
                    {signalError}
                  </p>
                )}
                <details>
                  <summary>What this viewer checks</summary>
                  <p>
                    Configured game version, roster, event format, sealed
                    package and public opening. Playback speed, seeking and
                    completion cannot change the official outcome or payment
                    status.
                  </p>
                  <p className="v-id">Match {selected}</p>
                </details>
              </section>
              <section className="v-training">
                <p className="v-kicker">BEFORE THE BIG LEAGUES</p>
                <h2>Seven days to find your edge.</h2>
                <p>
                  Training Grounds begins with a champion’s first qualifying,
                  finalized training match in each game. A new game starts its
                  own clock; a version update in the same game does not reset
                  it.
                </p>
                <p>
                  This viewer cannot start the clock or award credit. Account
                  eligibility and any live countdown must come from AgentBorn.
                </p>
                {config.agentbornOrigin ? (
                  <a
                    href={`${config.agentbornOrigin}/help`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Training and champion management on AgentBorn ↗
                  </a>
                ) : (
                  <p className="v-demo-note">
                    Local exhibitions and these fixtures never count toward
                    eligibility.
                  </p>
                )}
              </section>
            </div>
          </>
        )}
        <footer className="v-footer">
          <span>AgentBorn referees. The arena brings the replay to life.</span>
          <a
            href="https://github.com/daveyoung74/battlebots-arena"
            target="_blank"
            rel="noreferrer"
          >
            Build your own arena ↗
          </a>
        </footer>
      </main>
    </div>
  );
}
