-- Speed up password reset and OTP lookups/cleanup
CREATE INDEX IF NOT EXISTS "PasswordReset_email_isUsed_createdAt_idx"
ON "PasswordReset" ("email", "isUsed", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "PasswordReset_email_otp_isUsed_idx"
ON "PasswordReset" ("email", "otp", "isUsed");

CREATE INDEX IF NOT EXISTS "PasswordReset_expiresAt_idx"
ON "PasswordReset" ("expiresAt");

-- Speed up blacklist cleanup job
CREATE INDEX IF NOT EXISTS "TokenBlacklist_expiresAt_idx"
ON "TokenBlacklist" ("expiresAt");

-- Speed up 2FA backup code verification/count by user+status
CREATE INDEX IF NOT EXISTS "two_factor_recovery_codes_userId_isUsed_idx"
ON "two_factor_recovery_codes" ("userId", "isUsed");
