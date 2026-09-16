import { replayBounds } from "../game/broadcast";
import { accent, unlockSound } from "./sound";
import { useEffect, useRef, useState } from "react";
import type {
  CombatEvent,
  Identity,
  PublicMatch,
  Strategy,
} from "../game/types";
type Show = {
  serverTime: number;
  integrated: boolean;
  demo: boolean;
  platformUrl: string;
  voice: string;
  current: PublicMatch | null;
  upcoming: PublicMatch[];
  recent: PublicMatch[];
};
const FALLBACK: Identity[] = [
  {
    id: "house-rook",
    name: "Rook",
    portrait: "/portraits/rook.svg",
    color: "#e8b96b",
    title: "THE IRON RESOLVE",
    fact: "Pressure. Patience. A shield that holds.",
  },
  {
    id: "house-nyx",
    name: "Nyx",
    portrait: "/portraits/nyx.svg",
    color: "#8fd2cb",
    title: "THE QUIET THREAT",
    fact: "A patient guard hides a dangerous feint.",
  },
];
const pad = (n: number) => String(n).padStart(2, "0");
const countdown = (ms: number) => {
  const n = Math.max(0, Math.ceil(ms / 1000));
  return pad(Math.floor(n / 60)) + ":" + pad(n % 60);
};
const time = (n: number) =>
  new Date(n).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function Mark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="m20 3 16 9v16l-16 9-16-9V12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m12 27 8-15 8 15M15 22h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  );
}
function Icon({ kind }: { kind: string }) {
  return (
    <span aria-hidden="true">
      {(
        { strike: "╱", feint: "⌁", guard: "⬡", recover: "＋" } as Record<
          string,
          string
        >
      )[kind] || "✦"}
    </span>
  );
}
function OutcomeBadge({
  outcome,
  name,
}: {
  outcome: "victory" | "defeat";
  name: string;
}) {
  return (
    <div
      className={"outcome-badge " + outcome}
      role="img"
      aria-label={
        name + ": " + (outcome === "victory" ? "Victory" : "Defeated")
      }
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        {outcome === "victory" ? (
          <>
            <path
              d="M20 16H12v8c0 8 5 13 13 13M44 16h8v8c0 8-5 13-13 13"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path
              d="M20 10h24v17c0 9-5 15-12 15S20 36 20 27Z"
              fill="currentColor"
            />
            <path
              d="M32 40v12M23 54h18M20 58h24"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="m32 17 2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7Z"
              fill="#5b3b16"
            />
          </>
        ) : (
          <>
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            >
              <path d="m13 43 38 15M13 58l38-15" />
            </g>
            <g fill="currentColor">
              <circle cx="12" cy="42" r="4" />
              <circle cx="52" cy="59" r="4" />
              <circle cx="12" cy="59" r="4" />
              <circle cx="52" cy="42" r="4" />
              <path d="M32 7c-11 0-19 8-19 18 0 7 3 12 8 15v8h22v-8c5-3 8-8 8-15C51 15 43 7 32 7Z" />
            </g>
            <g fill="#261b1b">
              <circle cx="24" cy="25" r="5" />
              <circle cx="40" cy="25" r="5" />
              <path d="m32 31-4 6h8Z" />
            </g>
            <path d="M27 41v7M37 41v7" stroke="#261b1b" strokeWidth="3" />
          </>
        )}
      </svg>
    </div>
  );
}
function Token({
  identity,
  state,
  action,
  damage,
  side,
  entrance,
  outcome,
}: {
  identity: Identity;
  state?: { health: number; stamina: number };
  action?: string;
  damage?: number;
  side: number;
  entrance: boolean;
  outcome?: "victory" | "defeat";
}) {
  return (
    <div
      className={
        "combatant side-" +
        side +
        " action-" +
        action +
        (entrance ? " entrance" : "") +
        (outcome ? " outcome-" + outcome : "")
      }
      style={{ "--champion": identity.color } as React.CSSProperties}
    >
      <div className="portrait-ring">
        <div className="orbit" />
        <img
          src={identity.portrait}
          alt={identity.name}
          onError={(e) => {
            e.currentTarget.src = "/portraits/rook.svg";
          }}
        />
        <div className="hit-spark" />
        {action === "guard" && !outcome && (
          <div className="shield-effect">⬡</div>
        )}
        {outcome && <OutcomeBadge outcome={outcome} name={identity.name} />}
        {Boolean(damage) && (
          <span className="damage" key={String(state?.health)}>
            -{damage}
          </span>
        )}
      </div>
      <div className="fighter-identity">
        <span className="eyebrow">{identity.title}</span>
        <h2>{identity.name}</h2>
      </div>
      <div className="health-line">
        <span>VITALITY</span>
        <strong>
          {state?.health ?? 100}
          <small> / 100</small>
        </strong>
      </div>
      <div className="health-track">
        <i style={{ width: (state?.health ?? 100) + "%" }} />
      </div>
      <div className="stamina">
        <span>STAMINA</span>
        <div>
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} className={i < (state?.stamina ?? 6) ? "full" : ""} />
          ))}
        </div>
      </div>
      <div className="action-badge">
        <Icon kind={action || ""} />
        {action || "Ready to enter"}
      </div>
    </div>
  );
}
export function App() {
  const matchId = location.pathname.match(/^\/matches\/([^/]+)/)?.[1];
  const [embedded, setEmbedded] = useState(() =>
    new URLSearchParams(location.search).has("embed"),
  );
  function setBroadcastView(next: boolean) {
    const url = new URL(location.href);
    if (next) url.searchParams.set("embed", "1");
    else url.searchParams.delete("embed");
    history.pushState(history.state, "", url);
    setEmbedded(next);
  }
  useEffect(() => {
    const onPopState = () =>
      setEmbedded(new URLSearchParams(location.search).has("embed"));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && embedded) {
        event.preventDefault();
        setBroadcastView(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [embedded]);
  const [show, setShow] = useState<Show | null>(null),
    [match, setMatch] = useState<PublicMatch | null>(null),
    [tab, setTab] = useState("watch"),
    [error, setError] = useState(""),
    [online, setOnline] = useState(true),
    [now, setNow] = useState(Date.now());
  const [replay, setReplay] = useState(
      new URLSearchParams(location.search).has("replay"),
    ),
    [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [muted, setMuted] = useState(true),
    [volume, setVolume] = useState(0.7);
  const clockOffset = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null),
    played = useRef(new Set<string>()),
    currentCue = useRef<string | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function poll() {
      try {
        const r = await fetch("/api/show");
        if (!r.ok) throw Error();
        const next: Show = await r.json();
        if (stopped) return;
        clockOffset.current = next.serverTime - Date.now();
        setShow(next);
        if (matchId) {
          const response = await fetch(
            "/api/matches/" + encodeURIComponent(matchId),
          );
          if (!response.ok) throw Error("Match unavailable");
          const m = await response.json();
          if (!stopped) setMatch(m);
        } else setMatch(next.current);
        setOnline(true);
        failures = 0;
      } catch {
        setOnline(false);
        failures++;
      }
      if (!stopped)
        timer = setTimeout(poll, Math.min(1000 * 2 ** failures, 10000));
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [matchId]);
  useEffect(() => {
    const timer = setInterval(
      () => setNow(Date.now() + clockOffset.current),
      250,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setReplay(new URLSearchParams(location.search).has("replay"));
    setCursor(0);
    setPlaying(new URLSearchParams(location.search).has("replay"));
    played.current.clear();
    audio.current?.pause();
  }, [match?.id]);

  const bounds = match
    ? replayBounds(match.startsAt, match.endedAt, match.cues)
    : { start: now, duration: 1 };
  const viewTime = replay ? bounds.start + cursor * 1000 : now;
  const event: CombatEvent | undefined = match?.events.findLast(
    (e) => e.at <= viewTime,
  );
  const cue = match?.cues.findLast(
    (c) => c.at <= viewTime && c.expiresAt > viewTime,
  );
  const entrance = match?.entranceCues?.findLast(
    (c) =>
      c.kind === "entrance.begin" && c.at <= viewTime && c.expiresAt > viewTime,
  );
  useEffect(() => {
    if (!playing || !replay) return;
    const timer = setInterval(
      () =>
        setCursor((c) => {
          if (c >= bounds.duration) {
            setPlaying(false);
            return bounds.duration;
          }
          return Math.min(bounds.duration, c + 0.1 * speed);
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [playing, replay, speed, bounds.duration]);
  // Both live and replay share the server-authored cue clock. Seeking starts the
  // current line at its recorded offset and never queues expired commentary.
  useEffect(() => {
    const key = cue ? (replay ? "replay:" : "live:") + cue.id : null;
    const a = audio.current;
    if (muted || !cue || !cue.audio || (replay && !playing)) {
      a?.pause();
      currentCue.current = null;
      return;
    }
    if (currentCue.current === key && a) {
      a.volume = volume;
      a.playbackRate = replay ? speed : 1;
      return;
    }
    a?.pause();
    if (!replay && played.current.has(cue.id)) return;
    const next = new Audio(cue.audio);
    next.volume = volume;
    next.playbackRate = replay ? speed : 1;
    currentCue.current = key;
    audio.current = next;
    next.onloadedmetadata = () => {
      if (audio.current !== next) return;
      const elapsed = Math.max(0, (viewTime - cue.at) / 1000);
      if (elapsed < next.duration) next.currentTime = elapsed;
    };
    played.current.add(cue.id);
    void next.play().catch(() => {});
  }, [cue?.id, muted, replay, playing, speed, volume]);
  const sounded = useRef("");
  useEffect(() => {
    if (muted || !event || (replay && !playing)) return;
    const id = match!.id + ":" + event.seq + ":" + replay;
    if (sounded.current !== id) {
      sounded.current = id;
      if (viewTime - event.at < 1500)
        accent(event.actions.includes("guard") ? "guard" : "strike", volume);
    }
  }, [event?.seq, muted, replay, playing, volume]);
  const identities = match?.entrants.length === 2 ? match.entrants : FALLBACK;
  const isDone = match?.endedAt != null;
  // Reveal the server's result on the final recorded exchange. Rewinding hides
  // both badges again; even a simultaneous knockout uses the declared winner.
  const finalEvent = match?.events.at(-1);
  const visibleResult =
    match?.result &&
    match.endedAt != null &&
    viewTime >= match.endedAt &&
    (!finalEvent || event?.seq === finalEvent.seq)
      ? match.result
      : null;
  const phase = replay
    ? "Replay"
    : !online
      ? "Reconnecting"
      : {
          live: "Live",
          entrance: "Making an entrance",
          settling: "Result pending",
          interrupted: "Broadcast paused",
          cancelled: "Match cancelled",
          wrapup: "The wrapup",
          complete: "Final result",
          waiting: "The next duel",
        }[match?.phase ?? "waiting"];
  const beginReplay = (from = 0) => {
    audio.current?.pause();
    currentCue.current = null;
    setReplay(true);
    setCursor(
      from && match?.events[from]
        ? Math.max(0, (match.events[from].at - bounds.start) / 1000)
        : 0,
    );
    setPlaying(true);
  };
  return (
    <div className={embedded ? "app embedded" : "app"}>
      {!embedded && (
        <header className="masthead">
          <a className="brand" href="/">
            <Mark />
            <span>
              ARENA<small>BY BATTLEBOTS</small>
            </span>
          </a>
          <nav>
            <button
              className={tab === "watch" ? "active" : ""}
              onClick={() => setTab("watch")}
            >
              Watch arena
            </button>
            <button
              className={tab === "schedule" ? "active" : ""}
              onClick={() => setTab("schedule")}
            >
              The lineup
            </button>
            <button
              className={tab === "practice" ? "active" : ""}
              onClick={() => setTab("practice")}
            >
              Training room
            </button>
          </nav>
          <a
            className="outline small"
            href={show?.platformUrl || "https://battlebots.gg"}
          >
            Meet the champions <span>↗</span>
          </a>
        </header>
      )}
      <main>
        {!embedded && (
          <div className="page-intro">
            <div>
              <p className="eyebrow gold">A BATTLEBOTS ORIGINAL</p>
              <h1>
                {tab === "watch"
                  ? "Legends aren’t born."
                  : tab === "practice"
                    ? "Find your edge."
                    : "Every duel. A new story."}
                <em>
                  {tab === "watch"
                    ? "They enter."
                    : tab === "practice"
                      ? "Make it count."
                      : "Know when to tune in."}
                </em>
              </h1>
            </div>
            <p className="intro-copy">
              A strategy. A rival. One arena.
              <br />
              Watch champions write their next chapter.
            </p>
          </div>
        )}
        {tab === "practice" ? (
          <Practice show={show} onError={setError} />
        ) : tab === "schedule" ? (
          <section className="schedule-page">
            <div className="section-title">
              <span className="eyebrow">THE LINEUP</span>
              <span>Times shown in your timezone</span>
            </div>
            {show?.upcoming.length ? (
              show.upcoming.map((m) => <MatchCard key={m.id} match={m} />)
            ) : (
              <div className="empty">
                <h2>The next contenders are waiting.</h2>
                <p>
                  Confirmed ranked matches will appear here with their start
                  times.
                </p>
                <a
                  className="gold-button"
                  href={
                    (show?.platformUrl || "https://battlebots.gg") +
                    "/g/gladiators"
                  }
                >
                  Enter a champion ↗
                </a>
              </div>
            )}
            <h2 className="recent-title">Recently in the arena</h2>
            {show?.recent.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </section>
        ) : (
          <>
            <div className="watch-grid">
              <section
                className={
                  "broadcast " +
                  (match?.replayState === "unsupported" ? "headless" : "")
                }
              >
                <div className="broadcast-bar">
                  <span>
                    <i
                      className={
                        "status-dot " + (phase === "Live" ? "live" : "")
                      }
                    />
                    {phase.toUpperCase()}
                  </span>
                  <span>
                    {match?.mode === "exhibition"
                      ? "HOUSE EXHIBITION · NO REWARDS"
                      : match?.mode?.toUpperCase() || "ARENA"}
                    <b> / </b>DUEL {match?.id.slice(0, 4).toUpperCase() || "—"}
                  </span>
                  <button
                    className="broadcast-toggle"
                    type="button"
                    onClick={() => setBroadcastView(!embedded)}
                    aria-label={
                      embedded ? "Exit broadcast view" : "Open broadcast view"
                    }
                    aria-pressed={embedded}
                    title={
                      embedded
                        ? "Exit broadcast view (Esc)"
                        : "Open broadcast view"
                    }
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d={
                          embedded
                            ? "M9 3v6H3m12-6v6h6M3 15h6v6m12-6h-6v6"
                            : "M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"
                        }
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{embedded ? "Exit broadcast" : "Broadcast"}</span>
                  </button>
                </div>
                {match?.replayState === "unsupported" && (
                  <div className="headless-message">
                    <p className="eyebrow gold">SERVER SIMULATION</p>
                    <h2>
                      {match.endedAt
                        ? "The result is in."
                        : "Running the numbers."}
                    </h2>
                    <p>
                      This match runs without a visual broadcast. Inspect the
                      result and combat log below.
                    </p>
                  </div>
                )}
                <div
                  className={
                    "arena-stage " + (isDone && !replay ? "finished" : "")
                  }
                >
                  <div className="arena-lines" />
                  <div className="arena-motto">FORTUNE FAVORS THE PREPARED</div>
                  <Token
                    key={"left-" + (event?.seq ?? 0)}
                    identity={identities[0]}
                    state={event?.states[0]}
                    action={event?.actions[0]}
                    damage={event?.damage[0]}
                    side={0}
                    outcome={
                      visibleResult
                        ? visibleResult.winner === 0
                          ? "victory"
                          : "defeat"
                        : undefined
                    }
                    entrance={entrance?.championId === identities[0].id}
                  />
                  <div className="duel-center">
                    <span className="crossed">╳</span>
                    <strong>
                      {replay
                        ? "REPLAY"
                        : isDone
                          ? "FINAL"
                          : match?.phase === "live"
                            ? "EXCHANGE"
                            : "DUEL"}
                    </strong>
                    <span>{event ? pad(event.seq) : "VS"}</span>
                  </div>
                  <Token
                    key={"right-" + (event?.seq ?? 0)}
                    identity={identities[1]}
                    state={event?.states[1]}
                    action={event?.actions[1]}
                    damage={event?.damage[1]}
                    side={1}
                    outcome={
                      visibleResult
                        ? visibleResult.winner === 1
                          ? "victory"
                          : "defeat"
                        : undefined
                    }
                    entrance={entrance?.championId === identities[1].id}
                  />
                  <div className="arena-floor" />
                  {entrance && (
                    <div className="entrance-banner" key={entrance.id}>
                      <span className="eyebrow">NOW ENTERING</span>
                      <strong>
                        {
                          identities.find((i) => i.id === entrance.championId)
                            ?.name
                        }
                      </strong>
                    </div>
                  )}
                  {!match && (
                    <div className="waiting-banner">
                      The arena is getting ready
                    </div>
                  )}
                </div>
                <div className="commentary">
                  <span className="mic">◉</span>
                  <div>
                    <span className="eyebrow">FROM THE DESK</span>
                    <p>
                      {cue?.text ||
                        event?.caption ||
                        "Two champions. A clean slate. Let’s see who makes the first move."}
                    </p>
                  </div>
                  <span className="on-air">
                    {muted ? "CAPTIONS" : "ON AIR"}
                  </span>
                </div>
                <div className="playback">
                  <div>
                    <button
                      onClick={() => {
                        if (replay) setPlaying(!playing);
                        else {
                          setReplay(true);
                          setCursor(
                            Math.max(
                              0,
                              ((event?.at ?? match?.startsAt ?? now) -
                                bounds.start) /
                                1000,
                            ),
                          );
                          setPlaying(false);
                        }
                      }}
                      disabled={!match?.events.length}
                    >
                      {replay && playing ? "Ⅱ" : "▶"}{" "}
                      <span>
                        {replay ? (playing ? "Pause" : "Play") : "Review"}
                      </span>
                    </button>
                    {replay && (
                      <>
                        <button
                          onClick={() => {
                            setReplay(false);
                            setPlaying(false);
                          }}
                        >
                          {isDone ? "Return to result" : "Go live"}
                        </button>
                        <button onClick={() => setSpeed(speed === 1 ? 2 : 1)}>
                          {speed}×
                        </button>
                      </>
                    )}
                    <span className="playback-time">
                      {event ? pad(event.seq) : "00"} / 24 exchanges
                    </span>
                  </div>
                  <div>
                    <button
                      onClick={() => {
                        unlockSound();
                        setMuted(!muted);
                      }}
                    >
                      {muted ? "♫ Enable sound" : "♫ Mute"}
                    </button>
                    <input
                      aria-label="Volume"
                      type="range"
                      min="0"
                      max="1"
                      step=".05"
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                    />
                  </div>
                </div>
                {replay && (
                  <input
                    className="scrubber"
                    aria-label="Replay position"
                    type="range"
                    min="0"
                    max={bounds.duration}
                    step=".1"
                    value={cursor}
                    onChange={(e) => {
                      audio.current?.pause();
                      currentCue.current = null;
                      setCursor(Number(e.target.value));
                      setPlaying(false);
                    }}
                  />
                )}
                {isDone && match?.result && (
                  <div className="result-panel">
                    <div>
                      <p className="eyebrow gold">
                        {match.official
                          ? "DUEL COMPLETE"
                          : "AWAITING CONFIRMATION"}
                      </p>
                      <h2>
                        {identities[match.result.winner].name} takes the arena.
                      </h2>
                      <p>
                        {match.result.reason}
                        {match.mode === "exhibition"
                          ? " · House exhibition; no Career rewards."
                          : match.mode === "practice"
                            ? " · Practice; no XP or prizes."
                            : ""}
                      </p>
                    </div>
                    {match.replayState === "available" && (
                      <button className="outline" onClick={() => beginReplay()}>
                        Watch replay ↻
                      </button>
                    )}
                    {match.replayState === "expired" && (
                      <span>Replay expired</span>
                    )}
                  </div>
                )}
              </section>
              {!embedded && (
                <aside className="ringside">
                  <div className="section-title">
                    <span className="eyebrow">RINGSIDE</span>
                    <span className="gold">✦</span>
                  </div>
                  <h2>
                    More than
                    <br />a match.
                  </h2>
                  <p>
                    Every choice has a consequence.
                    <br />
                    Every champion has a story.
                  </p>
                  <div className="ringside-portrait">
                    <img src={identities[0].portrait} alt="" />
                    <span>IN THE SPOTLIGHT</span>
                  </div>
                  <p className="eyebrow gold">{identities[0].title}</p>
                  <h3>{identities[0].name}</h3>
                  <p>{identities[0].fact}</p>
                  {identities[0].rivalry && (
                    <details className="rivalry">
                      <summary>THE REMATCH</summary>
                      <p>{identities[0].rivalry.text}</p>
                      {identities[0].rivalry.evidence.map((e) => (
                        <a
                          key={e.matchId}
                          href={
                            (show?.platformUrl || "https://battlebots.gg") +
                            "/api/v1/matches/" +
                            e.matchId
                          }
                        >
                          Verified result · revision {e.settleSeq} ↗
                        </a>
                      ))}
                    </details>
                  )}
                  <a
                    href={
                      identities[0].handle
                        ? (show?.platformUrl || "https://battlebots.gg") +
                          "/c/" +
                          identities[0].handle
                        : (show?.platformUrl || "https://battlebots.gg") +
                          "/champions"
                    }
                    className="text-link"
                  >
                    Explore the champion <span>↗</span>
                  </a>
                  {identities[0].token && (
                    <a className="token-card" href={identities[0].token.url}>
                      Fan token · {identities[0].token.symbol} ↗
                    </a>
                  )}
                  <div className="divider" />
                  <p className="eyebrow">NEXT ON THE CARD</p>
                  {show?.upcoming[0] ? (
                    <>
                      <h3>
                        {show.upcoming[0].entrants
                          .map((e) => e.name)
                          .join(" vs ") || "Contenders assembling"}
                      </h3>
                      <div className="countdown">
                        {countdown(show.upcoming[0].startsAt - now)}
                      </div>
                      <small>
                        {time(show.upcoming[0].startsAt)} · Your local time
                      </small>
                      {show.upcoming[0].entrants
                        .filter((e) => e.token)
                        .map((e) => (
                          <a
                            className="token-card"
                            key={e.id}
                            href={e.token!.url}
                          >
                            {e.name} · {e.token!.symbol} ↗
                          </a>
                        ))}
                    </>
                  ) : (
                    <>
                      <h3>The next chapter is coming.</h3>
                      <p>
                        Confirmed matchups appear here. Follow a champion to
                        know when to tune in.
                      </p>
                    </>
                  )}
                </aside>
              )}
            </div>
            {!embedded && (
              <>
                <div className="lower-grid">
                  <section className="story-card">
                    <p className="eyebrow gold">THE TURNING POINT</p>
                    <h2>
                      {isDone
                        ? "The moment that mattered."
                        : "Small choices. Big consequences."}
                    </h2>
                    <p>
                      {isDone
                        ? match?.turningPoint?.text
                        : "A well-timed feint. A patient guard. Watch the stamina bars—the next opening could change everything."}
                    </p>
                    {isDone && match?.replayState === "available" && (
                      <button
                        className="text-link"
                        onClick={() =>
                          beginReplay(
                            Math.max(0, (match.turningPoint?.from || 1) - 1),
                          )
                        }
                      >
                        Replay the exchange <span>↻</span>
                      </button>
                    )}
                  </section>
                  <section className="story-card">
                    <p className="eyebrow">YOUR CHAMPION. YOUR STRATEGY.</p>
                    <h2>The next entrance could be yours.</h2>
                    <p>
                      Tune the tactics. Test them in practice. Then step into
                      the competition.
                    </p>
                    <button
                      className="text-link"
                      onClick={() => setTab("practice")}
                    >
                      Visit the training room <span>→</span>
                    </button>
                  </section>
                </div>
                <section className="combat-log">
                  <details>
                    <summary>
                      Inside the duel{" "}
                      <span>
                        {match?.events.length || 0} exchanges · combat log
                      </span>
                    </summary>
                    <ol>
                      {match?.events.map((e) => (
                        <li key={e.seq}>
                          <b>{pad(e.seq)}</b>
                          {e.caption}
                          <small>
                            {e.states[0].health} / {e.states[1].health} HP
                          </small>
                        </li>
                      ))}
                    </ol>
                  </details>
                </section>
              </>
            )}
          </>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {!online && (
          <div className="connection" role="status">
            Reconnecting to the arena. Combat continues on the server.
          </div>
        )}
      </main>
      {!embedded && (
        <footer>
          <span>
            ARENA <small>× BATTLEBOTS</small>
          </span>
          <p>Made for champions. Open for everyone.</p>
          <a href="https://github.com/daveyoung74/battlebots-arena">
            Open source ↗
          </a>
        </footer>
      )}
    </div>
  );
}
function MatchCard({ match }: { match: PublicMatch }) {
  return (
    <a
      className="match-card"
      href={
        "/matches/" +
        match.id +
        (match.replayState === "available" ? "?replay=1" : "")
      }
    >
      <span className="eyebrow">{match.mode}</span>
      <strong>
        {match.entrants.map((e) => e.name).join(" vs ") ||
          "Waiting for contenders"}
      </strong>
      <span>
        {match.endedAt
          ? match.replayState === "available"
            ? "Watch replay ↗"
            : "View result ↗"
          : time(match.startsAt) + " →"}
      </span>
    </a>
  );
}
function Practice({
  show,
  onError,
}: {
  show: Show | null;
  onError: (s: string) => void;
}) {
  const [strategy, setStrategy] = useState<Strategy>({
      aggression: 50,
      feint_rate: 25,
      recover_below: 2,
    }),
    [busy, setBusy] = useState(false),
    [headless, setHeadless] = useState(false),
    [mode, setMode] = useState<"practice" | "casual" | "ranked">("practice");
  async function start() {
    setBusy(true);
    try {
      const endpoint = show?.integrated
        ? "/api/matches/ready"
        : "/api/exhibitions";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          show?.integrated
            ? { mode, headless: mode === "practice" && headless }
            : { strategy, opponent: 1, headless },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      location.href = data.enter_url || data.watchUrl;
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not start match");
      setBusy(false);
    }
  }
  return (
    <section className="training">
      <div className="training-art">
        <img src="/portraits/rook.svg" alt="Rook, house exhibition champion" />
        <span className="eyebrow">PREPARATION IS A STRATEGY</span>
        <h2>Find the opening.</h2>
        <p>
          Balance pressure, deception and recovery.
          <br />
          Every setting has a tradeoff.
        </p>
      </div>
      <div className="training-controls">
        <p className="eyebrow gold">
          {show?.integrated ? "CHAMPION COMPETITION" : "HOUSE EXHIBITION LAB"}
        </p>
        <h2>
          {show?.integrated
            ? "Choose your match."
            : "Try a different approach."}
        </h2>
        <p>
          {show?.integrated
            ? "Champion selection, strategy and entry authorization happen securely on BattleBots."
            : "Try the server-run engine with house portraits. Exhibition results award no XP, prizes or Career progression."}
        </p>
        {!show?.integrated ? (
          (
            [
              ["aggression", "Aggression", "Patient", "Relentless", 100],
              ["feint_rate", "Feint frequency", "Direct", "Deceptive", 100],
              [
                "recover_below",
                "Recovery threshold",
                "Push through",
                "Stay fresh",
                4,
              ],
            ] as const
          ).map(([key, label, low, high, max]) => (
            <label className="strategy-field" key={key}>
              <span>
                {label}
                <b>{strategy[key]}</b>
              </span>
              <input
                type="range"
                min="0"
                max={max}
                value={strategy[key]}
                onChange={(e) =>
                  setStrategy({ ...strategy, [key]: Number(e.target.value) })
                }
              />
              <small>
                <span>{low}</span>
                <span>{high}</span>
              </small>
            </label>
          ))
        ) : (
          <div className="modes">
            {(["practice", "casual", "ranked"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={mode === m ? "selected" : ""}
              >
                <strong>{m}</strong>
                <small>
                  {m === "practice"
                    ? "No rewards · test freely"
                    : m === "casual"
                      ? "XP · no rating pressure"
                      : "Scheduled show · rating"}
                </small>
              </button>
            ))}
          </div>
        )}
        {mode === "practice" && (
          <label className="check">
            <input
              type="checkbox"
              checked={headless}
              onChange={(e) => setHeadless(e.target.checked)}
            />{" "}
            Fast simulation · result and log only
          </label>
        )}
        <button className="gold-button" onClick={start} disabled={busy}>
          {busy
            ? "Preparing…"
            : show?.integrated
              ? "Continue to BattleBots ↗"
              : "Run exhibition →"}
        </button>
        <p className="fine">
          The server runs every exchange. Viewing never changes a result.
        </p>
      </div>
    </section>
  );
}
