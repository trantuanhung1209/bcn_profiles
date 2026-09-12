import { isTokenRevokedBefore } from './token-issued-at';

describe('token revocation issuance precision', () => {
  const cutoff = 1_800_000_000_500;
  const iat = Math.floor(cutoff / 1000);

  it('accepts a new token issued after unblock within the same JWT second', () => {
    expect(
      isTokenRevokedBefore({ iat, issuedAtMs: cutoff + 100 }, cutoff),
    ).toBe(false);
  });

  it('rejects older and boundary tokens within that same second', () => {
    expect(
      isTokenRevokedBefore({ iat, issuedAtMs: cutoff - 100 }, cutoff),
    ).toBe(true);
    expect(isTokenRevokedBefore({ iat, issuedAtMs: cutoff }, cutoff)).toBe(
      true,
    );
  });

  it('retains conservative checks for legacy tokens', () => {
    expect(isTokenRevokedBefore({ iat }, cutoff)).toBe(true);
    expect(isTokenRevokedBefore({ iat: iat + 1 }, cutoff)).toBe(false);
  });

  it('fails closed for absent or malformed claims when a cutoff exists', () => {
    for (const payload of [
      {},
      { issuedAtMs: NaN },
      { issuedAtMs: 0 },
      { issuedAtMs: Infinity },
    ]) {
      expect(isTokenRevokedBefore(payload, cutoff)).toBe(true);
    }
  });

  it('does not revoke a token without a cutoff', () => {
    expect(isTokenRevokedBefore({ iat }, undefined)).toBe(false);
  });
});
