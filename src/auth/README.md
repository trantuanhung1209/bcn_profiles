# Auth module layout

```text
auth/
  auth.module.ts
  controllers/
    auth.controller.ts          # register/login/logout/refresh/password/email
    two-factor.controller.ts    # /auth/2fa/* (setup, verify, recovery, me, admin)
  services/
    auth.service.ts             # credential flows (register, login branch, password, email)
    auth-token.service.ts       # issue/refresh/revoke JWT sessions
    auth-cookies.service.ts     # HttpOnly cookie helpers
    two-factor-auth.service.ts  # TOTP / OTP / backup / challenge helpers
    auth-challenge.service.ts   # single-use 2FA challenge tokens
    token-revocation.service.ts # jti blacklist
    auth-session-cache.service.ts
    email.service.ts
    mail-queue.service.ts
  strategies/                   # passport local + jwt
  guards/                       # jwt, roles, 2FA challenge guards
  dto/
  decorators/
  utils/
```

Public HTTP surface is unchanged (`/auth/*` and `/auth/2fa/*`).
