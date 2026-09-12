export type TokenIssuedAt = { iat?: number; issuedAtMs?: number };

/** The signed millisecond claim avoids rounding fresh tokens down to JWT seconds. */
export function isTokenRevokedBefore(
  payload: TokenIssuedAt,
  revokedBefore: number | undefined,
): boolean {
  if (revokedBefore === undefined) return false;
  const issuedAt =
    payload.issuedAtMs !== undefined
      ? payload.issuedAtMs
      : typeof payload.iat === 'number'
        ? payload.iat * 1000
        : undefined;
  // Legacy tokens keep their conservative second-resolution check; malformed
  // issuance claims must not bypass an existing revocation cutoff.
  return (
    typeof issuedAt !== 'number' ||
    !Number.isFinite(issuedAt) ||
    issuedAt <= 0 ||
    issuedAt <= revokedBefore
  );
}
