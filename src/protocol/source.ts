import * as P from "@agentborn/protocol-v2";
import {
  verifyBundle,
  applySignal,
  signalOf,
  requireValue,
  type ViewerBundle,
  type ViewerPolicy,
} from "./model.ts";
export type ProtocolClient = ReturnType<typeof P.createProtocolClient>;
export async function downloadMatch(
  client: ProtocolClient,
  policy: ViewerPolicy,
  matchId: string,
  preview = false,
  now = Date.now(),
): Promise<ViewerBundle> {
  P.idSchema.parse(matchId);
  const [status, manifest, registry] = await Promise.all([
    client.status(matchId),
    client.manifest(matchId),
    client.registry(matchId),
  ]);
  requireValue(manifest.matchId === matchId, "Wrong match returned");
  let bundle: ViewerBundle;
  if (status.lifecycle === "cancelled") {
    const cancellation = await client.cancellation(matchId),
      qualification = cancellation.qualificationHash
        ? await client.qualification(matchId)
        : null;
    bundle = {
      version: 1,
      kind: "cancelled",
      manifest,
      registry,
      status,
      cancellation,
      qualification,
    };
  } else {
    if (!status.openingAvailable && !preview)
      throw new P.ProtocolResponseError(
        425,
        "NOT_RELEASED",
        "The official replay is not released yet",
        true,
      );
    const [qualification, receipt, envelope] = await Promise.all([
      client.qualification(matchId),
      client.commitment(matchId),
      client.sealed(matchId),
    ]);
    const opening = status.openingAvailable
      ? await client.opening(matchId)
      : null;
    const replay = opening
      ? (
          await P.verifyPublishedPackage({
            manifest,
            registry,
            qualification,
            receipt,
            envelope,
            opening,
            now: String(Math.floor(now / 1000)),
          })
        ).replay
      : await client.studioPackage(matchId);
    bundle = {
      version: 1,
      kind: "replay",
      manifest,
      registry,
      status,
      qualification,
      receipt,
      envelope,
      opening,
      replay,
    };
  }
  return (await verifyBundle(bundle, policy, now)).bundle;
}
export async function refreshSignal(
  client: ProtocolClient,
  previous: ViewerBundle,
  policy: ViewerPolicy,
  now = Date.now(),
): Promise<ViewerBundle> {
  const matchId = previous.manifest.matchId,
    status = await client.status(matchId);
  let next: ViewerBundle;
  if (status.lifecycle === "cancelled") {
    const cancellation = await client.cancellation(matchId),
      qualification = cancellation.qualificationHash
        ? await client.qualification(matchId)
        : null;
    next = {
      version: 1,
      kind: "cancelled",
      manifest: previous.manifest,
      registry: previous.registry,
      status,
      cancellation,
      qualification,
    };
  } else {
    requireValue(
      previous.kind === "replay",
      "Cancelled history cannot become active",
    );
    const opening = status.openingAvailable
      ? (previous.opening ?? (await client.opening(matchId)))
      : null;
    requireValue(
      !previous.opening || opening,
      "Published opening is no longer available",
    );
    next = { ...previous, status, opening };
  }
  return (await applySignal(previous, signalOf(next), policy, now)).bundle;
}
