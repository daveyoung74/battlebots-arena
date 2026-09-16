import { mkdir, readFile, stat, open, link, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as P from "@agentborn/protocol-v2";
import {
  BUNDLE_BYTES,
  parseBundle,
  verifyBundle,
  type ViewerBundle,
  type ViewerPolicy,
} from "./model.ts";

/** Immutable first download. Signals are refreshed separately; cache availability is never official lifecycle authority. */
export class ReplayCache {
  private pending = new Map<string, Promise<ViewerBundle>>();
  constructor(
    private directory: string,
    private policy: ViewerPolicy,
    private load: (matchId: string) => Promise<ViewerBundle>,
    private clock = () => Date.now(),
  ) {}
  private file(id: string) {
    return path.join(
      path.resolve(this.directory),
      `${P.idSchema.parse(id)}.json`,
    );
  }
  private async read(id: string) {
    const file = this.file(id);
    try {
      if ((await stat(file)).size > BUNDLE_BYTES)
        throw new Error("Cached replay too large");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const bundle = parseBundle(await readFile(file));
    if (bundle.manifest.matchId !== id)
      throw new Error("Cached match identity mismatch");
    return (await verifyBundle(bundle, this.policy, this.clock())).bundle;
  }
  async get(id: string) {
    P.idSchema.parse(id);
    const existing = this.pending.get(id);
    if (existing) return existing;
    const work = this.acquire(id);
    this.pending.set(id, work);
    try {
      return await work;
    } finally {
      this.pending.delete(id);
    }
  }
  private async acquire(id: string) {
    const cached = await this.read(id);
    if (cached) return cached;
    const bundle = (
      await verifyBundle(await this.load(id), this.policy, this.clock())
    ).bundle;
    if (bundle.manifest.matchId !== id)
      throw new Error("Downloaded match identity mismatch");
    await mkdir(this.directory, { recursive: true });
    const file = this.file(id),
      temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(P.canonicalJson(bundle, BUNDLE_BYTES));
      await handle.sync();
      await handle.close();
      try {
        await link(temporary, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const saved = await this.read(id);
      if (!saved) throw new Error("Replay cache write failed");
      // Cross-process duplicate delivery must not overwrite a different immutable replay.
      const immutable = (b: ViewerBundle) =>
        b.kind === "replay"
          ? [
              b.manifest,
              b.registry,
              b.qualification,
              b.receipt,
              b.envelope,
              b.replay,
            ]
          : [b.manifest, b.registry, b.cancellation];
      if (
        P.hashDocument(immutable(saved), BUNDLE_BYTES) !==
        P.hashDocument(immutable(bundle), BUNDLE_BYTES)
      )
        throw new Error("Conflicting replay delivery");
      return saved;
    } finally {
      await handle.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
  }
}
