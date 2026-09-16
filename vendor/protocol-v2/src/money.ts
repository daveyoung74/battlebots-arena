import { positiveUintSchema, uintSchema, ZERO_ADDRESS, permissionSchema, type MatchManifest, type Payment, type Source } from "./schemas.js";

const ZERO = BigInt(0), BPS = BigInt(10000), FEE_BPS = BigInt(100);
export function contributionToken(match: Pick<MatchManifest, 'contributionAsset'>) { return match.contributionAsset?.token ?? ZERO_ADDRESS; }
export function spendingLimits(raw: unknown, token: string) {
  const p = permissionSchema.parse(raw);
  const keys = (p.assetPermissions ?? []).map(a => `${a.asset.chainId}:${a.asset.token}`);
  requireMoney(new Set(keys).size === keys.length && (p.assetPermissions ?? []).every(a => a.asset.token !== ZERO_ADDRESS), 'duplicate or native asset permission');
  if (token === ZERO_ADDRESS) return { maxContributionWei: p.maxContributionWei, minimumRemainingWei: p.minimumRemainingWei, grossDailyBudgetWei: p.grossDailyBudgetWei };
  const a = p.assetPermissions?.find(a => a.asset.token === token);
  requireMoney(a, 'explicit token spending permission required');
  return { maxContributionWei: a.maxContributionBaseUnits, minimumRemainingWei: a.minimumRemainingBaseUnits, grossDailyBudgetWei: a.grossDailyBudgetBaseUnits };
}
export function winningsAllocation(amount: string, vaultBps = 5000) {
  requireMoney(Number.isInteger(vaultBps) && vaultBps >= 5000 && vaultBps <= 10000, 'winnings split outside 50–100%');
  const total = BigInt(uintSchema.parse(amount)), vault = total * BigInt(vaultBps) / BPS;
  return { vault: String(vault), payout: String(total - vault) };
}
function requireMoney(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INVALID_DOCUMENT: ${message}`);
}
export function sourceAmounts(kind: Source["kind"], grossAmount: string) {
  const gross = BigInt(positiveUintSchema.parse(grossAmount));
  const fee = kind === "sponsor" ? ZERO : gross * FEE_BPS / BPS;
  return { grossAmount: gross.toString(), feeAmount: fee.toString(), netAmount: (gross - fee).toString() };
}
export function availablePurse(totalWei: string, reservedWei: string, liabilityWei: string): string {
  const [total, reserved, liability] = [totalWei, reservedWei, liabilityWei].map(value => BigInt(uintSchema.parse(value)));
  requireMoney(reserved + liability <= total, "purse liabilities exceed balance");
  return (total - reserved - liability).toString();
}
export function fundingAllocation(receipt: string, vaultBps: number) {
  requireMoney(Number.isInteger(vaultBps) && vaultBps >= 2000 && vaultBps <= 10000, "funding split outside 20–100%");
  const amount = BigInt(uintSchema.parse(receipt)), vault = amount * BigInt(vaultBps) / BPS;
  return { vault: vault.toString(), payout: (amount - vault).toString() };
}
export function contribution(format: MatchManifest["format"], championId: string, availableWei: string): string {
  const available = BigInt(uintSchema.parse(availableWei));
  if (format.kind === "none" || (format.kind === "bounty" && format.championId !== championId)) return "0";
  const terms = format.kind === "bounty" ? format.contribution : format;
  const amount = terms.kind === "percentage" ? available * BigInt(terms.entryBps) / BPS : BigInt(terms.amountWei);
  requireMoney(amount > ZERO && amount >= BigInt(format.minimumWei), "contribution below minimum; never top up");
  return amount.toString();
}
export function assertExposure(input: { contributionWei: string; availableWei: string; maxSliceBps: number;
  maxContributionWei: string; minimumRemainingWei: string; grossDailyUsedWei: string; grossDailyBudgetWei: string }) {
  for (const value of [input.contributionWei, input.availableWei, input.maxContributionWei,
    input.minimumRemainingWei, input.grossDailyUsedWei, input.grossDailyBudgetWei]) uintSchema.parse(value);
  requireMoney(Number.isInteger(input.maxSliceBps) && input.maxSliceBps >= 0 && input.maxSliceBps <= 2000, "invalid exposure ceiling");
  const amount = BigInt(input.contributionWei), available = BigInt(input.availableWei);
  requireMoney(amount <= available * BigInt(input.maxSliceBps) / BPS, "purse exposure ceiling");
  requireMoney(amount <= BigInt(input.maxContributionWei), "handler amount ceiling");
  requireMoney(available - amount >= BigInt(input.minimumRemainingWei), "retained purse floor");
  requireMoney(BigInt(input.grossDailyUsedWei) + amount <= BigInt(input.grossDailyBudgetWei), "gross daily budget");
}
export function allocatePrizes(manifest: MatchManifest, placements: string[], sharesBps: number[]): Payment[] {
  requireMoney(sharesBps.length > 0 && sharesBps.length <= placements.length &&
    sharesBps.every(value => Number.isInteger(value) && value > 0) &&
    sharesBps.reduce((a, b) => a + b, 0) === 10000, "invalid placement shares");
  requireMoney(new Set(placements).size === placements.length, "duplicate placement");
  const byChampion = new Map(manifest.roster.map(entry => [entry.championId, entry]));
  const recipients = placements.map(id => {
    const entry = byChampion.get(id);
    requireMoney(entry, "winner outside roster");
    return entry;
  });
  return manifest.sources.flatMap(source => {
    const expected = sourceAmounts(source.kind, source.grossAmount);
    requireMoney(source.feeAmount === expected.feeAmount && source.netAmount === expected.netAmount, "source fee/net mismatch");
    const rows: Payment[] = [];
    if (source.feeAmount !== "0") rows.push({ sourceId: source.sourceId, asset: source.asset, kind: "treasury",
      beneficiary: manifest.treasury, championId: null, amount: source.feeAmount });
    const net = BigInt(source.netAmount);
    const amounts = sharesBps.map(share => net * BigInt(share) / BPS);
    amounts[0] += net - amounts.reduce((a, b) => a + b, ZERO);
    amounts.forEach((amount, index) => {
      if (amount !== ZERO) rows.push({ sourceId: source.sourceId, asset: source.asset, kind: "prize",
        beneficiary: recipients[index].winnings?.splitter ?? recipients[index].payout, championId: recipients[index].championId, amount: amount.toString() });
    });
    return rows;
  });
}

/** This calculation is enabled only by an explicitly adopted refund_all policy. */
export function cancellationReturns(manifest: MatchManifest, disposition: "refund_all" | "unresolved"): Payment[] {
  if (manifest.sources.length === 0) return [];
  requireMoney(disposition === "refund_all", "UNRESOLVED_POLICY: cancelled no-show disposition");
  return manifest.sources.flatMap<Payment>(source => {
    if (source.kind === "vault") return [{ sourceId: source.sourceId, asset: source.asset, kind: "reservation_release" as const,
      beneficiary: source.contract, championId: source.championId, amount: source.grossAmount }];
    return source.deposits.map(deposit => ({ sourceId: source.sourceId, asset: source.asset, kind: "return" as const,
      beneficiary: deposit.funder, championId: "championId" in deposit ? deposit.championId : null, amount: deposit.amount }));
  });
}
