import { useEffect, useState } from "react";
import {
  frameAt,
  packetSchema,
  PACKAGE_BYTES,
  verifyFreePacket,
  type FreeConfig,
  type FreePacket,
} from "../free/model.ts";
import { read } from "./http.ts";
import "./viewer.css";

export function FreeApp({ config }: { config: FreeConfig }) {
  const [id, setId] = useState(config.matches[0].id),
    [packet, setPacket] = useState<FreePacket | null>(null);
  const [error, setError] = useState(false),
    [retry, setRetry] = useState(0),
    [ms, setMs] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const pin = config.matches.find((m) => m.id === id)!;
  useEffect(() => {
    const controller = new AbortController();
    setPacket(null);
    setError(false);
    setMs(0);
    setPlaying(false);
    void read(
      `/api/viewer/matches/${id}/bundle`,
      packetSchema,
      PACKAGE_BYTES,
      controller.signal,
    )
      .then((raw) => {
        const value = verifyFreePacket(raw, pin);
        if (!controller.signal.aborted) setPacket(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [id, pin, retry]);
  const duration = packet?.opening.replay?.durationMs ?? 0;
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now(),
      handle: number;
    const tick = (now: number) => {
      const delta = now - previous;
      previous = now;
      setMs((value) => Math.min(duration, value + delta * speed));
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, speed, duration]);
  useEffect(() => {
    if (ms >= duration) setPlaying(false);
  }, [ms, duration]);
  const frame = packet ? frameAt(packet, ms) : null;
  const winnerIndex =
    packet?.manifest.roster.findIndex(
      (s) => s.championId === packet.opening.ranks[0],
    ) ?? -1;
  return (
    <div className="viewer">
      <header className="v-nav">
        <a className="v-brand" href="https://agentborn.gg/builders">
          <span>A</span> ARENA
        </a>
        <span className="v-mode">
          {config.provenance === "disposable-test"
            ? "DISPOSABLE TEST"
            : "PUBLISHED ARCHIVE"}
        </span>
      </header>
      <main>
        <section className="v-intro">
          <p className="v-kicker">WALLETLESS FREE MATCHES</p>
          <h1>The whole match. Ready to replay.</h1>
          <p>
            A complete match package, played locally. No wallet or event stream
            needed.
          </p>
        </section>
        <section className="v-program">
          <label>
            Match{" "}
            <select
              aria-label="Match"
              value={id}
              onChange={(e) => setId(e.target.value)}
            >
              {config.matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </section>
        {error ? (
          <section role="alert" className="v-status">
            <h2>Replay unavailable</h2>
            <p>
              The package is unavailable or does not match the reviewed archive.
            </p>
            <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
          </section>
        ) : !packet ? (
          <p role="status">Checking match package…</p>
        ) : (
          <>
            <section className="v-stage" aria-label="Match replay">
              <div className="v-stage-top">
                <span>
                  {packet.manifest.terms.mode === 1 ? "Ranked" : "Casual"} ·
                  free match
                </span>
                <span>
                  {packet.opening.kind === "walkover"
                    ? "Walkover"
                    : `${Math.floor(ms / packet.rules.roundMs)} / ${packet.opening.replay!.events.length} rounds`}
                </span>
              </div>
              {frame ? (
                <>
                  <div className="v-fighters">
                    {frame.fighters.map((f, i) => (
                      <article className={`v-fighter v-fighter-${i}`} key={i}>
                        <img
                          src={`/portraits/${i ? "nyx" : "rook"}.svg`}
                          alt=""
                        />
                        <h2 className="v-fighter-title">{pin.champions[i]}</h2>
                        <div className="v-stats">
                          <p>
                            Health {f.health} / {packet.rules.health}
                          </p>
                          <meter
                            aria-label={`${pin.champions[i]} health`}
                            min={0}
                            max={packet.rules.health}
                            value={f.health}
                          />
                          <p>
                            Stamina {f.stamina} / {packet.rules.stamina.max}
                          </p>
                        </div>
                        <p className="v-action">
                          {frame.event?.actions[i] ?? "Ready"}
                        </p>
                      </article>
                    ))}
                  </div>
                  <div className="v-controls">
                    <label className="v-timeline">
                      Replay position{" "}
                      <input
                        aria-label="Replay position"
                        type="range"
                        min={0}
                        max={duration}
                        step={1}
                        value={ms}
                        onChange={(e) => {
                          setPlaying(false);
                          setMs(Number(e.target.value));
                        }}
                      />
                    </label>
                    <div className="v-buttons">
                      <button
                        className="v-primary"
                        onClick={() => {
                          if (ms >= duration) setMs(0);
                          setPlaying((v) => !v);
                        }}
                      >
                        {playing ? "Pause" : "Play"}
                      </button>
                      <button
                        onClick={() => {
                          setMs(0);
                          setPlaying(false);
                        }}
                      >
                        Restart
                      </button>
                      <label>
                        Speed{" "}
                        <select
                          aria-label="Playback speed"
                          value={speed}
                          onChange={(e) => setSpeed(Number(e.target.value))}
                        >
                          {[0.5, 1, 2, 4].map((n) => (
                            <option key={n} value={n}>
                              {n}×
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <div className="v-no-combat">
                  <h2>Walkover</h2>
                  <p>
                    {pin.champions[winnerIndex]} qualified. No combat was
                    played.
                  </p>
                </div>
              )}
              {(!frame || ms >= duration) && (
                <p className="v-winner">Winner: {pin.champions[winnerIndex]}</p>
              )}
            </section>
            <section className="v-status">
              <h2>Archive record</h2>
              <p>
                Recorded state: {packet.state}.{" "}
                {packet.trainingCredited
                  ? "Source reports played-match training credit."
                  : "No training credit reported in this snapshot."}
              </p>
              <p>
                This is a fixed historical export, not a live status feed.
                Replay controls never change the result or award credit.
              </p>
              {config.provenance === "disposable-test" && (
                <p>Disposable local-chain test data. Not a production match.</p>
              )}
              <details>
                <summary>What the reader checks</summary>
                <p>
                  The configured package and profile hashes, match identity,
                  result commitment, replay progression and supplied
                  transaction/event/state evidence. The archive does not
                  independently check the live chain, certification signatures
                  or current training records.
                </p>
                <p>
                  Match: <code style={{ overflowWrap: "anywhere" }}>{id}</code>
                </p>
              </details>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
