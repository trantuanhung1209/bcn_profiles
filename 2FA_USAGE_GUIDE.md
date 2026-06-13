# 2FA Implementation Guide - BCN Profiles

## Overview
A complete 2-Factor Authentication system with:
- **TOTP app** (Google Authenticator, Authy) as primary protection
- **Email OTP** as backup when app unavailable
- **Backup codes** for emergency access
- **Admin reset** capability for user support
- **Optional 2FA** — users can voluntarily enable/disable 2FA when logged in
- **Configurable 2FA requirement** — admin can set `twoFactorRequired` per user

---

## 2FA Configuration

### User-Level Configuration
Each user has two 2FA-related fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `twoFactorEnabled` | Boolean | `false` | Whether user has completed 2FA setup |
| `twoFactorRequired` | Boolean | `false` | Whether user MUST use 2FA (enforced by admin) |

### Login Behavior Matrix

| `twoFactorRequired` | `twoFactorEnabled` | Login Result |
|---|---|---|
| ❌ false | ❌ false | ✅ Allow direct login (skip 2FA) |
| ❌ false | ✅ true | 🔒 Require 2FA verification |
| ✅ true | ❌ false | ⚙️ Force 2FA setup first |
| ✅ true | ✅ true | 🔒 Require 2FA verification |

---

## How It Works

### User Journey - NEW FLOW

#### 1️⃣ New User/First Login
```
User Login (email + password)
    ↓
Validate credentials
    ↓
Check twoFactorRequired flag
    │
    ├─ If twoFactorRequired = true
    │   └─ Return { requiresTwoFactorSetup: true, setupToken }
    │
    └─ If twoFactorRequired = false
        ├─ Check twoFactorEnabled
        │   ├─ If true → Return { requiresTwoFactorVerification: true, verificationToken }
        │   └─ If false → ✅ Allow direct login (skipTwoFactor: true)
        │
        └─ Tokens & user data returned directly
```

#### 2️⃣ 2FA Setup Process (When Required)
```
Step 1: POST /auth/2fa/setup/initiate
  - Require: setupToken (header), password (body)
  - Verify password for security
  - Return: { secret, qrCode, setupToken (new, with secret embedded) }

Step 2: Client scans QR code with Authenticator app
  - User's Authenticator app displays time-based codes

Step 3: POST /auth/2fa/setup/confirm
  - Require: setupToken (header), body: { secret, code }
  - Verify TOTP code against secret
  - Generate backup codes server-side
  - Save TOTP secret + backup codes to database
  - Return: { backupCodes, user } + set access/refresh cookies
  ← User is now logged in!
```

#### 3️⃣ Subsequent Logins (2FA Enabled)
```
User Login (email + password)
    ↓
Validate credentials
    ↓
Check twoFactorEnabled
    ├─ If true → Return { requiresTwoFactorVerification: true, verificationToken }
    └─ If false → Check twoFactorRequired
        ├─ If true → Force setup (see step 2)
        └─ If false → ✅ Allow direct login
```

#### 4️⃣ 2FA Verification Methods
```
Option A: TOTP from Authenticator App
  POST /auth/2fa/verify/totp
    - Header: Authorization: Bearer <verificationToken>
    - Body: { code: "123456" }
    - Verify code against stored secret
    - Return: { accessToken, refreshToken }

Option B: Email OTP (if app unavailable)
  POST /auth/2fa/send-email-otp
    - Header: Authorization: Bearer <verificationToken>
    - Action: Send 6-digit code to email
    - Return: success message
  
  Then: POST /auth/2fa/verify/email
    - Header: Authorization: Bearer <verificationToken>
    - Body: { code: "789012" }
    - Return: { accessToken, refreshToken }

Option C: Backup Code (emergency)
  POST /auth/2fa/verify/backup-code
    - Header: Authorization: Bearer <verificationToken>
    - Body: { code: "ABC123" }
    - Mark code as used
    - Return: { accessToken, refreshToken }
```

#### 5️⃣ User Self-Service 2FA (Voluntary Enable/Disable)

User chủ động bật hoặc tắt 2FA khi đang đăng nhập — không cần admin can thiệp.

**Bật 2FA:**
```
Step 1: POST /auth/2fa/me/enable/initiate
  - Require: access_token (JWT cookie), body: { password }
  - Verify password
  - Return: { secret, qrCode, setupToken (15 min) }

Step 2: User scans QR with Authenticator app

Step 3: POST /auth/2fa/me/enable/confirm
  - Require: setupToken (header), body: { secret, code }
  - Verify TOTP code
  - Save to DB + generate backup codes
  - Return: { backupCodes: [...10 codes...] }
```

**Tắt 2FA** (chỉ khi twoFactorRequired = false):
```
POST /auth/2fa/me/disable
  - Require: access_token (JWT cookie)
  - Body: { password, totpCode }
  - Verify both password AND current TOTP code
  - Return: { success: true }
```

**Xem trạng thái:**
```
GET /auth/2fa/me/status
  - Require: access_token (JWT cookie)
  - Return: { twoFactorEnabled, twoFactorRequired, backupCodesRemaining }
```

---

#### 6️⃣ Lost Smart Phone Recovery```
POST /auth/2fa/recovery/request
  - Body: { email: "user@example.com" }
  - Action: Send recovery OTP to email
  
POST /auth/2fa/recovery/verify-email
  - Body: { email, recoveryOtp: "654321" }
  - Return: { recoveryToken }

POST /auth/2fa/recovery/reset
  - Header: Authorization: Bearer <recoveryToken>
  - Action: Disable 2FA for user
  - User must setup 2FA again on next login (if required)
```

#### 7️⃣ Admin Reset 2FA
```
POST /auth/2fa/admin/reset/:userId
  - Require: Admin role, userId in path
  - Optional: { reason: "User request recovery" }
  - Action: 
    1. Disable user's 2FA
    2. Send email notification to user
  - User must setup 2FA again on next login (if required)
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

#### POST `/auth/2fa/setup/confirm`
**Requires**: setupToken (header) — bước cuối, verify TOTP + lưu DB + trả cookies + backup codes

**Header**:
```
Authorization: Bearer <setupToken>
```

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
  "message": "2FA setup hoàn tất!",
  "backupCodes": [
    "ABCD1234", "EFGH5678", "...10 codes total"
  ],
  "user": {...}
}
```

**Note**: Backup codes được generate server-side tại bước này. Cookie `access_token` + `refresh_token` được set — user đã đăng nhập.

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

### User Self-Service 2FA Endpoints

#### GET `/auth/2fa/me/status`
**Requires**: JWT cookie (đã đăng nhập)

**Response**:
```json
{
  "twoFactorEnabled": false,
  "twoFactorRequired": false,
  "backupCodesRemaining": 0
}
```

---

#### POST `/auth/2fa/me/enable/initiate`
**Requires**: JWT cookie (đã đăng nhập)

**Rate limit**: 3 requests / phút

**Body**:
```json
{
  "password": "current_password"
}
```

**Response**:
```json
{
  "success": true,
  "secret": "BASE32SECRET...",
  "qrCode": "data:image/png;base64,...",
  "setupToken": "eyJ...",
  "message": "Quét mã QR bằng ứng dụng Authenticator rồi gọi confirm để hoàn tất."
}
```

**Note**: `setupToken` hết hạn sau 15 phút. Truyền vào header `Authorization: Bearer <setupToken>` ở bước tiếp theo.

---

#### POST `/auth/2fa/me/enable/confirm`
**Public endpoint** — xác thực qua `setupToken` trong header

**Rate limit**: 5 requests / phút

**Header**:
```
Authorization: Bearer <setupToken>
```

**Body**:
```json
{
  "secret": "BASE32SECRET...",
  "code": "123456"
}
```

**Response**:
```json
{
  "success": true,
  "backupCodes": [
    "ABCD1234", "EFGH5678", "IJKL9012",
    "MNOP3456", "QRST7890", "UVWX1234",
    "YZA25678", "BCD39012", "EFG43456", "HIJ57890"
  ],
  "message": "2FA đã được bật thành công! Lưu các mã backup ở nơi an toàn.",
  "warning": "Nếu mất thiết bị Authenticator, bạn sẽ cần các mã backup này để đăng nhập."
}
```

---

#### POST `/auth/2fa/me/disable`
**Requires**: JWT cookie (đã đăng nhập)

**Rate limit**: 3 requests / phút

**Note**: Yêu cầu cả mật khẩu và mã TOTP hiện tại. Thất bại nếu admin đặt `twoFactorRequired = true`.

**Body**:
```json
{
  "password": "current_password",
  "totpCode": "123456"
}
```

**Response**:
```json
{
  "success": true,
  "message": "2FA đã được tắt. Tài khoản của bạn sẽ đăng nhập trực tiếp bằng email và mật khẩu."
}
```

**Error (400)**:
```json
{
  "statusCode": 400,
  "message": "Tài khoản của bạn bắt buộc phải sử dụng 2FA. Liên hệ admin để gỡ yêu cầu này."
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

#### GET `/auth/2fa/admin/status/:userId`
**Requires**: Admin role

**Response**:
```json
{
  "userId": "user-id",
  "email": "user@example.com",
  "twoFactorEnabled": true,
  "twoFactorRequired": false,
  "backupCodesRemaining": 7,
  "status": {
    "setup": "✅ Đã setup",
    "requirement": "✔️ Tuỳ chọn"
  }
}
```

---

#### POST `/auth/2fa/admin/reset/:userId`
**Requires**: Admin role

**Description**: Tắt 2FA cho user + ghi log + gửi email thông báo. Dùng khi user yêu cầu hỗ trợ.

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

#### POST `/auth/2fa/admin/require/:userId`
**Requires**: Admin role

**Description**: Enforce 2FA requirement for a user. User will be forced to setup 2FA on next login.

**Response**:
```json
{
  "success": true,
  "message": "User ... bắt buộc phải sử dụng 2FA. User sẽ được thông báo via email.",
  "userNotified": true
}
```

---

#### POST `/auth/2fa/admin/unrequire/:userId`
**Requires**: Admin role

**Description**: Make 2FA optional for a user. User can skip 2FA on login if not enabled.

**Response**:
```json
{
  "success": true,
  "message": "User ... không bắt buộc phải sử dụng 2FA nữa. User sẽ được thông báo via email.",
  "userNotified": true
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
  twoFactorRequired         Boolean                @default(false)  // NEW: Admin can enforce 2FA
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
- **User can self-enable or self-disable 2FA** while logged in
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
- `src/auth/dto/enable-two-factor.dto.ts` - User self-service 2FA DTOs (`InitiateEnable2FADto`, `ConfirmEnable2FADto`, `Disable2FADto`)
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

### Setup Flow (Admin-enforced)
- [ ] Login → Receive setupToken
- [ ] Call setup/initiate → Get secret + QR code
- [ ] Scan QR with Authenticator app
- [ ] Call setup/verify with correct TOTP code → Get backup codes
- [ ] Call setup/confirm → Receive access token, properly logged in

### User Self-Service 2FA
- [ ] GET /auth/2fa/me/status → View current 2FA state
- [ ] POST /auth/2fa/me/enable/initiate (with password) → Get QR + setupToken
- [ ] POST /auth/2fa/me/enable/confirm (with setupToken + TOTP) → 2FA enabled, receive backup codes
- [ ] POST /auth/2fa/me/disable (with password + totpCode) → 2FA disabled
- [ ] Attempt disable when twoFactorRequired=true → Receive 400 error

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
5. **Device trust**: Remember device for X days to skip 2FA
6. **Backup code regeneration**: Allow users to get new backup codes via self-service
7. **Session invalidation**: Auto-logout other sessions when 2FA reset
