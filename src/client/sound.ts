let context: AudioContext | null = null;
export function unlockSound() {
  context ??= new AudioContext();
  void context.resume();
}
export function accent(kind: string, volume: number) {
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  const oscillator = context.createOscillator(),
    gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.type = kind === "guard" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(
    kind === "entrance" ? 180 : kind === "guard" ? 450 : 90,
    now,
  );
  oscillator.frequency.exponentialRampToValueAtTime(
    kind === "entrance" ? 360 : 40,
    now + 0.16,
  );
  gain.gain.setValueAtTime(0.08 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  oscillator.start(now);
  oscillator.stop(now + 0.26);
}
