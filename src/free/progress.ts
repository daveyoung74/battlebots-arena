import { packageHash, type FreePacket } from "./model.ts";
export function verifyLiveProgress(value: FreePacket, previous?: FreePacket) {
  if (previous) {
    if (
      ["committed", "finalized", "released"].indexOf(value.state) <
        ["committed", "finalized", "released"].indexOf(previous.state) ||
      (previous.completion?.state === "complete" &&
        value.completion?.state !== "complete") ||
      previous.receipts.some(
        (receipt, i) => packageHash(receipt) !== packageHash(value.receipts[i]),
      ) ||
      (previous.completion?.state === "complete" &&
        packageHash(previous.completion) !== packageHash(value.completion))
    )
      throw new Error("Live status regression or evidence replacement");
  }
  return value;
}
