import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../src/index.js';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/played.json', import.meta.url), 'utf8'));
const token = `0x${'a1'.repeat(20)}`, asset = { chainId: '4663' as const, token };

test('winnings defaults, range, rounding and conservation cover the full allowed interval', () => {
    assert.deepEqual(P.winningsAllocation('101'), { vault: '50', payout: '51' });
    assert.deepEqual(P.winningsAllocation('101', 10000), { vault: '101', payout: '0' });
    for (const bps of [-1, 0, 4999, 10001, 5000.5, NaN]) assert.throws(() => P.winningsAllocation('101', bps));
    for (let bps = 5000; bps <= 10000; bps++) {
        const value = P.winningsAllocation('123456789012345678901234567890', bps);
        assert.equal(BigInt(value.vault) + BigInt(value.payout), BigInt('123456789012345678901234567890'));
    }
});
test('ETH permissions never authorize a token, and token permissions never replace ETH limits', () => {
    const permission = P.permissionSchema.parse(fixture.permissions[0]);
    assert.throws(() => P.spendingLimits(permission, token), /explicit token/);
    permission.assetPermissions = [{ asset, maxContributionBaseUnits: '101', minimumRemainingBaseUnits: '13', grossDailyBudgetBaseUnits: '301' }];
    assert.equal(P.spendingLimits(permission, token).maxContributionWei, '101');
    assert.equal(P.spendingLimits(permission, P.ZERO_ADDRESS).maxContributionWei, permission.maxContributionWei);
    assert.throws(() => P.spendingLimits({ ...permission, assetPermissions: [...permission.assetPermissions!, ...permission.assetPermissions!] }, token), /duplicate/);
    assert.throws(() => P.spendingLimits({ ...permission, assetPermissions: [{ ...permission.assetPermissions![0], asset: { ...asset, token: P.ZERO_ADDRESS } }] }, token), /native/);
});
test('manifest prizes use immutable splitters while cancellation restores the original currency', () => {
    const m = P.matchManifestSchema.parse(fixture.manifest), registry = P.registrySchema.parse(fixture.registry);
    m.contributionAsset = asset; registry.assets.assets.push(asset); m.assetPolicyHash = P.hashDocument(registry.assets);
    m.roster.forEach((entry, n) => { entry.winnings = { splitter: `0x${(1000 + n).toString(16).padStart(40, '0')}`, vaultBps: n === 0 ? 10000 : 5000 }; });
    m.sources.forEach(source => { if (source.kind !== 'sponsor') source.asset = asset; });
    P.validateManifest(m, registry);
    const payments = P.allocatePrizes(m, m.roster.slice(0, 3).map(e => e.championId), [5000, 3000, 2000]);
    for (const p of payments.filter(p => p.kind === 'prize')) assert.equal(p.beneficiary, m.roster.find(e => e.championId === p.championId)!.winnings!.splitter);
    for (const p of P.cancellationReturns(m, 'refund_all').filter(p => p.kind === 'reservation_release')) assert.deepEqual(p.asset, asset);
    const wrong = structuredClone(m); wrong.sources.find(s => s.kind === 'vault')!.asset = { ...asset, token: P.ZERO_ADDRESS };
    assert.throws(() => P.validateManifest(wrong, registry), /currency/);
    const alias = structuredClone(m); alias.roster[0].winnings!.splitter = alias.roster[0].payout;
    assert.throws(() => P.validateManifest(alias, registry), /winnings destinations/);
});
test('a changed percentage or currency changes the committed manifest hash', () => {
    const m = P.matchManifestSchema.parse(fixture.manifest);
    const old = P.hashDocument(m); m.contributionAsset = asset;
    assert.notEqual(P.hashDocument(m), old);
    m.roster[0].winnings = { splitter: token, vaultBps: 5000 };
    const committed = P.hashDocument(m); m.roster[0].winnings.vaultBps = 7500;
    assert.notEqual(P.hashDocument(m), committed);
    assert.equal(P.contributionToken(fixture.manifest), P.ZERO_ADDRESS);
});
