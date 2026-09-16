# Winnings and currency extension

This alpha extension adds optional fields to existing `agentborn/2` documents. It does not activate paid matches. Legacy documents retain revision `2.0.0-alpha.1` and identical canonical bytes when these fields are absent. Consumers must adopt the extended schemas before accepting new manifests; old strict schemas reject unknown fields. Never append extension fields to an already committed document.

## Manifest and prizes

`contributionAsset: {chainId,token}` fixes the ordinary contribution and door-fee currency. Omission means native ETH (`token = 0x0000000000000000000000000000000000000000`). All ordinary vault and entry sources must match. Sponsors may contribute another approved asset. Each asset remains separate through fees, placement, winnings and refunds.

A new roster entry has `winnings: {splitter,vaultBps}`. `splitter` is the immutable match-prize recipient, distinct from the entry's fixed owner `payout` and `vault`. Every new deployment's roster includes this field, even when the champion contributes zero. `vaultBps` is 5000–10000 and defaults to 5000. The complete roster commitment freezes it for the match; an earlier bounty reservation does not freeze the winnings percentage.

`allocatePrizes` applies existing source fees and placement rounding, then identifies each prize beneficiary as its winner's splitter. The result commitment continues to bind those original source awards. A separate `winningsAllocation(amount,vaultBps)` computes `floor(amount * vaultBps / 10000)` for the vault and the remainder for the owner. No extra fee is charged. Both nonzero credits must be delivered independently; source-to-splitter funding alone does not mean the winner has been fully paid. A split change cannot redistribute previously allocated funds.

## Units, limits and compatibility

Existing match/evidence keys ending in `Wei` (`amountWei`, `minimumWei`, `doorFeeWei`, `availableAtReservationWei`, `grossDailyUsedWei`, etc.) mean base units of `contributionAsset` when the extension is present, and retain their old wei meaning when it is absent. This spelling is retained for canonical/structural compatibility. It is never a license to mix assets or apply a dollar exchange rate.

Native permission fields always govern ETH. `assetPermissions` explicitly grants each token a `maxContributionBaseUnits`, `minimumRemainingBaseUnits` and `grossDailyBudgetBaseUnits`, keyed by `{chainId,token}`. Duplicate and native entries in this list are invalid. No token spending is authorized by an ETH limit. Exposure remains at most 20% of the available amount in that token; champion exclusivity and match frequency remain global.

Tier benefits may set `contributionAsset` for their purse/prize bands. An omitted currency means ETH and cannot gate a token match by interpreting wei limits as token units. Qualifying holdings remain raw token quantities, independent of the match currency.

## Vault balances and support

For each currency, `available = recognized − reserved − unpaid`. Explicit token deposits verify exact amounts. Direct transfers of a supported token can be reconciled once without assigning depositor identity. Token winnings delivered to the vault increase recognized and usable balances in that same token. There is no automatic forwarding, conversion or general owner withdrawal.

Only explicitly approved standard-transfer tokens are supported. Arbitrary assets, transfer fees, rebases and unreviewed behavior changes are outside the compatibility promise. Unsupported direct transfers are not spendable. Suspending a token preserves earlier obligations and allows independent unrelated deliveries.

The new application chain profile is `a4.reads.2`; old `a4.reads.1` verifies retained native records only. Typed lock/bounty domains move to `AgentBorn.A1.lock.2` / `AgentBorn.A1.bounty.2`. Both bind currency, and roster locks additionally bind each splitter and frozen percentage. New deployments and old retained evidence require their respective explicitly reviewed profiles.
