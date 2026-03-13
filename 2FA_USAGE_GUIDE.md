# 2FA Implementation Guide - BCN Profiles

## Overview
A complete 2-Factor Authentication system with:
- **TOTP app** (Google Authenticator, Authy) as primary protection
- **Email OTP** as backup when app unavailable
- **Backup codes** for emergency access
- **Admin reset** capability for user support
- **Mandatory for all users** - enforced on first login after setup requirement

---

## How It Works

### User Journey

#### 1️⃣ New User/First Login (No 2FA Setup)
```
User Login (email + password)
    ↓
Check 2FA Status
    ↓
NOT ENABLED → Return setupToken
    ↓
Client receives: { requiresTwoFactorSetup: true, setupToken: "..." }
```

#### 2️⃣ 2FA Setup Process
```
Step 1: POST /auth/2fa/setup/initiate
  - Require: setupToken (header), password (body)
  - Verify password for security
  - Return: { secret, qrCode }

Step 2: Client scans QR code with Authenticator app
  - User's Authenticator app displays time-based codes

Step 3: POST /auth/2fa/setup/verify
  - Require: setupToken, secret, TOTP code from app
  - Verify TOTP code against secret
  - Return: { backupCodes: ["ABC123", "DEF456", ...] }

Step 4: POST /auth/2fa/setup/confirm
  - Require: setupToken, secret, backupCodes array
  - Save TOTP secret to database
  - Store backup codes for one-time use
  - Return: { accessToken, refreshToken } ← User is now logged in!
```

#### 3️⃣ Subsequent Logins (2FA Enabled)
```
User Login (email + password)
    ↓
Check 2FA Status
    ↓
ENABLED → Return verificationToken (5 min expiry)
    ↓
Client receives: { requiresTwoFactorVerification: true, verificationToken: "..." }
    ↓
User chooses verification method:

Option A: TOTP from Authenticator App
  POST /auth/2fa/verify/totp
    - Header: Authorization: Bearer <verificationToken>
    - Body: { code: "123456" }
    - Verify code against stored secret
    - Return: { accessToken, refreshToken }

Option B: Email OTP (if app unavailable)
  POST /auth/2fa/send-email-otp
    - Header: Authorization: Bearer <verificationToken>
    - Body: {} (empty)
    - Action: Send 6-digit code to email
    - Return: success message
  
  Then: POST /auth/2fa/verify/email
    - Header: Authorization: Bearer <verificationToken>
    - Body: { code: "789012" }
    - Verify OTP from email
    - Return: { accessToken, refreshToken }

Option C: Backup Code (emergency)
  POST /auth/2fa/verify/backup-code
    - Header: Authorization: Bearer <verificationToken>
    - Body: { code: "ABC123" }
    - Verify one-time backup code
    - Mark code as used
    - Return: { accessToken, refreshToken }
```

#### 4️⃣ Lost smart Phone Recovery
```
POST /auth/2fa/recovery/request
  - Body: { email: "user@example.com" }
  - Action: Send recovery OTP to email
  
POST /auth/2fa/recovery/verify-email
  - Body: { email, recoveryOtp: "654321" }
  - Verify email OTP
  - Return: { recoveryToken }

POST /auth/2fa/recovery/reset
  - Header: Authorization: Bearer <recoveryToken>
  - Action: Disable 2FA for user
  - User must setup 2FA again on next login
```

#### 5️⃣ Admin Reset 2FA
```
POST /auth/2fa/admin/reset/:userId
  - Require: Admin role, userId in path
  - Optional: { reason: "User request recovery" }
  - Action: 
    1. Disable user's 2FA
    2. Send email notification to user
  - User must setup 2FA again on next login
```

---

## API Reference

### Setup Endpoints

#### POST `/auth/2fa/setup/initiate`
**Requires**: setupToken (from login)

**Body**:
```json
{
  "password": "user_password_123"
}
```

**Response**:
```json
{
  "success": true,
  "secret": "ABCD1234EFGH5678IJKL9012",
  "qrCode": "data:image/png;base64,...",
  "message": "Quét mã QR bằng ứng dụng Authenticator..."
}
```

---

#### POST `/auth/2fa/setup/verify`
**Requires**: setupToken

**Body**:
```json
{
  "secret": "ABCD1234EFGH5678IJKL9012",
  "code": "123456"
}
```

**Response**:
```json
{
  "success": true,
  "backupCodes": [
    "ABCD1234",
    "EFGH5678",
    "...10 codes total"
  ],
  "message": "Mã TOTP chính xác!",
  "warningMessage": "QUAN TRỌNG: Lưu những mã này ở nơi an toàn"
}
```

---

#### POST `/auth/2fa/setup/confirm`
**Requires**: setupToken

**Body**:
```json
{
  "secret": "ABCD1234EFGH5678IJKL9012",
  "backupCodes": [
    "ABCD1234",
    "EFGH5678",
    "...array of backup codes"
  ]
}
```

**Response**:
```json
{
  "success": true,
  "message": "2FA setup hoàn tất!",
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {...}
}
```

---

### Verification Endpoints

#### POST `/auth/2fa/verify/totp`
**Public endpoint**

**Header**:
```
Authorization: Bearer <verificationToken>
```

**Body**:
```json
{
  "code": "123456"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "access_token": "...",
  "refresh_token": "...",
  "user": {...}
}
```

---

#### POST `/auth/2fa/send-email-otp`
**Public endpoint**

**Header**:
```
Authorization: Bearer <verificationToken>
```

**Body**:
```json
{}
```

**Response**:
```json
{
  "success": true,
  "message": "Mã OTP đã được gửi đến email của bạn"
}
```

---

#### POST `/auth/2fa/verify/email`
**Public endpoint**

**Header**:
```
Authorization: Bearer <verificationToken>
```

**Body**:
```json
{
  "code": "789012"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "access_token": "...",
  "refresh_token": "...",
  "user": {...}
}
```

---

#### POST `/auth/2fa/verify/backup-code`
**Public endpoint**

**Header**:
```
Authorization: Bearer <verificationToken>
```

**Body**:
```json
{
  "code": "ABCD1234"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Đăng nhập thành công (sử dụng mã backup)",
  "access_token": "...",
  "refresh_token": "...",
  "user": {...},
  "warningMessage": "Bạn chỉ còn lại một số ít mã backup. Hãy yêu cầu thêm mã."
}
```

---

### Recovery Endpoints

#### POST `/auth/2fa/recovery/request`
**Public endpoint - Rate limited**

**Body**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Nếu email tồn tại, bạn sẽ nhận được mã khôi phục...",
  "nextStep": "Sử dụng mã để xác nhận yêu cầu khôi phục"
}
```

---

#### POST `/auth/2fa/recovery/verify-email`
**Public endpoint**

**Body**:
```json
{
  "email": "user@example.com",
  "recoveryOtp": "654321"
}
```

**Response**:
```json
{
  "success": true,
  "recoveryToken": "eyJhbGciOiJIUzI1NiIs...",
  "message": "Xác minh email thành công",
  "nextStep": "Gọi endpoint reset 2FA recovery với recovery token này"
}
```

---

#### POST `/auth/2fa/recovery/reset`
**Requires**: recoveryToken (from recovery flow)

**Response**:
```json
{
  "success": true,
  "message": "2FA đã được reset. Vui lòng đăng nhập lại...",
  "nextStep": "Đăng nhập lại để hoàn tất quá trình thiết lập 2FA"
}
```

---

### Admin Endpoints

#### GET `/auth/2fa/status/:userId`
**Requires**: Admin role

**Response**:
```json
{
  "enabled": true,
  "backupCodesRemaining": 7
}
```

---

#### POST `/auth/2fa/admin/reset/:userId`
**Requires**: Admin role

**Body**:
```json
{
  "reason": "User request recovery"
}
```

**Response**:
```json
{
  "success": true,
  "message": "2FA của user ... đã được reset. User sẽ được thông báo via email.",
  "userNotified": true
}
```

---

#### POST `/auth/2fa/admin/disable/:userId`
**Requires**: Admin role

**Response**:
```json
{
  "success": true,
  "message": "2FA của user ... đã được vô hiệu hóa."
}
```

---

## Data Models

### User Model (Updated)
```prisma
model User {
  id                        String
  email                     String @unique
  password                  String?
  fullName                  String?
  avatar                    String?
  phone                     String?
  role                      String
  googleId                  String?
  typeAuth                  authProvider
  metadata                  Json?
  status                    UserStatus
  // 2FA Fields
  twoFactorEnabled          Boolean                @default(false)
  totpSecret                String?
  twoFactorRecoveryCodes    TwoFactorRecoveryCode[]
  timelineEvents            TimelineEvent[]
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime
}
```

### TwoFactorRecoveryCode Model
```prisma
model TwoFactorRecoveryCode {
  id        String    @id @default(cuid())
  userId    String
  code      String    // hashed recovery code
  isUsed    Boolean   @default(false)
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@map("two_factor_recovery_codes")
}
```

---

## Key Features

### ✅ Security
- TOTP based on RFC 6238 (industry standard)
- Backup codes are hashed in database
- Recovery codes are one-time use only
- Tokens have short expiration times (5-30 minutes)
- Password required for setup initiation
- Admin actions send email notifications

### ✅ User Experience
- Simple 3-step setup process
- Multiple 2FA verification options (TOTP, Email OTP, Backup codes)
- Clear recovery process when device lost
- Email notifications for all security events

### ✅ Admin Capabilities
- View user 2FA status
- Reset user 2FA when requested
- Disable 2FA if needed
- User gets email notification of admin actions

### ✅ Flexibility
- Backup codes for emergency access
- Email OTP for when authenticator app unavailable
- Recovery flow doesn't require original device

---

## Error Handling

### Common Errors
```
"Invalid or expired setup token" (401)
→ Setup took too long (>15 min), restart setup

"Mã TOTP không chính xác" (401)
→ Time sync issue or wrong code, try again in next time window

"Mã backup không chính xác hoặc đã được sử dụng" (401)
→ Backup code already used or invalid

"Verification token required" (400)
→ Must login first before verifying 2FA
```

---

## Implementation Files

### New Files Created
- `src/auth/services/two-factor-auth.service.ts` - Core 2FA logic
- `src/auth/guards/two-factor-setup.guard.ts` - Setup token validation
- `src/auth/guards/two-factor-verification.guard.ts` - Verification token validation  
- `src/auth/guards/two-factor-recovery.guard.ts` - Recovery token validation
- `src/auth/dto/setup-two-factor.dto.ts` - Setup DTOs
- `src/auth/dto/verify-two-factor-totp.dto.ts` - TOTP verify DTOs
- `src/auth/dto/verify-two-factor-email.dto.ts` - Email verify DTOs
- `src/auth/dto/confirm-two-factor-setup.dto.ts` - Setup confirm DTOs
- `src/auth/dto/two-factor-recovery.dto.ts` - Recovery DTOs
- `src/auth/dto/admin-reset-two-factor.dto.ts` - Admin reset DTOs
- `src/auth/templates/2fa-otp-verification.hbs` - OTP email template
- `src/auth/templates/2fa-recovery-request.hbs` - Recovery email template
- `src/auth/templates/2fa-admin-reset.hbs` - Admin reset email template

### Modified Files
- `prisma/schema.prisma` - Added 2FA fields to User, created TwoFactorRecoveryCode
- `src/auth/auth.service.ts` - Modified login to check 2FA, added token generation
- `src/auth/auth.controller.ts` - Added all 2FA endpoints
- `src/auth/auth.module.ts` - Added TwoFactorAuthService and guards
- `src/auth/email.service.ts` - Added 4 new email methods for 2FA
- `src/users/users.service.ts` - Updated UserWithoutPassword type
- `prisma/seed.ts` - Fixed enum casting

### Database Changes
- Added columns to User table: `twoFactorEnabled`, `totpSecret`
- Created new table: `two_factor_recovery_codes`

---

## Testing Checklist

### Setup Flow
- [ ] Login → Receive setupToken
- [ ] Call setup/initiate → Get secret + QR code
- [ ] Scan QR with Authenticator app
- [ ] Call setup/verify with correct TOTP code → Get backup codes
- [ ] Call setup/confirm → Receive access token, properly logged in

### Verification Flow
- [ ] Login with 2FA enabled → Receive verificationToken
- [ ] Verify with TOTP code → Success
- [ ] Verify with email OTP → Success
- [ ] Verify with backup code → Success (and marked as used)

### Recovery Flow
- [ ] Request recovery → Email received
- [ ] Verify recovery OTP → Get recoveryToken
- [ ] Reset 2FA → 2FA disabled

### Admin Flow
- [ ] Admin reset 2FA → User email notification
- [ ] User logs in → Must setup 2FA again

---

## Next Steps / Future Enhancements

1. **Rate limiting**: Already using @nestjs/throttler, endpoints pre-configured
2. **Audit logging**: Log all 2FA actions for security audit trail
3. **SMS OTP**: Add SMS as backup method (integrate Twilio/AWS SNS)
4. **WebAuthn**: Support biometric/hardware security keys
5. **2FA enforcement**: Force specific user roles to have 2FA
6. **Device trust**: Remember device for X days to skip 2FA
7. **Backup code regeneration**: Allow users to get new backup codes
8. **Session invalidation**: Auto-logout other sessions when 2FA reset
