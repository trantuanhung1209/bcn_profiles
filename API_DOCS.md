# API Documentation — BCN Profiles

**Base URL:** `https://profiles.uside.studio`

> Tất cả request/response đều là JSON (`Content-Type: application/json`).  
> Authentication sử dụng **HttpOnly cookie** — FE phải gửi kèm `credentials: 'include'` (fetch) hoặc `withCredentials: true` (axios).

---

## 📋 Mục lục

- [Authentication](#-authentication)
- [2FA — Luồng chi tiết](#-2fa--luồng-chi-tiết)
- [2FA — Endpoints](#-2fa--endpoints)
- [Users](#-users)
- [Timeline Events](#-timeline-events)
- [Cookies & Tokens](#-cookies--tokens)
- [Lỗi thường gặp](#-lỗi-thường-gặp)
- [Rate Limits](#-rate-limits)

---

## 🔐 Authentication

### POST `/auth/register`

Đăng ký tài khoản mới. Tài khoản được tạo với `status: PENDING` và phải chờ admin phê duyệt trước khi đăng nhập được.

**Auth:** Public  
**Rate limit:** 50 req / phút

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "Nguyễn Văn A",
  "phone": "0912345678",
  "avatar": "https://example.com/avatar.jpg"
}
```

| Field | Bắt buộc | Validation |
|---|---|---|
| `email` | ✅ | Email hợp lệ |
| `password` | ✅ | Tối thiểu 6 ký tự |
| `fullName` | ✅ | 2–50 ký tự |
| `phone` | ✅ | Số VN hợp lệ (`0912345678` hoặc `+84912345678`) |
| `avatar` | ❌ | URL hợp lệ |

**Success (201):**
```json
{
  "message": "Đăng ký thành công. Tài khoản đang chờ admin phê duyệt, bạn sẽ nhận được email thông báo khi được duyệt.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "avatar": null,
    "phone": "0912345678",
    "status": "PENDING",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Errors:**
- `409` — Email hoặc số điện thoại đã được sử dụng

---

### POST `/auth/login`

Đăng nhập bằng email và mật khẩu. Response có 3 dạng tuỳ trạng thái 2FA của tài khoản — xem [2FA — Luồng chi tiết](#-2fa--luồng-chi-tiết).

**Auth:** Public  
**Rate limit:** 50 req / phút

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Success (200) — Trường hợp 1: Không có 2FA**

Cookie `access_token` + `refresh_token` được set ngay.
```json
{
  "message": "Đăng nhập thành công (2FA không bắt buộc)",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "avatar": null,
    "role": "USER"
  },
  "skipTwoFactor": true
}
```

**Success (200) — Trường hợp 2: User đã bật 2FA**

Không có cookie. Client dùng `verificationToken` để xác minh 2FA.
```json
{
  "requiresTwoFactorVerification": true,
  "verificationToken": "eyJ...",
  "message": "Vui lòng xác nhận 2FA để hoàn tất đăng nhập."
}
```

**Success (200) — Trường hợp 3: Admin bắt buộc 2FA nhưng user chưa setup**

Không có cookie. Client dùng `setupToken` để đi qua setup flow.
```json
{
  "requiresTwoFactorSetup": true,
  "setupToken": "eyJ...",
  "message": "Bạn phải cài đặt xác thực 2 lớp (2FA) để tiếp tục."
}
```

**Errors:**
- `401` — Sai email/mật khẩu
- `401` — Tài khoản đang chờ duyệt (`PENDING`) hoặc đã bị khóa (`BLOCKED`)

---

### GET `/auth/profile`

Lấy thông tin profile đầy đủ của user đang đăng nhập từ database.

**Auth:** JWT cookie  
**Rate limit:** default

**Success (200):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "fullName": "Nguyễn Văn A",
  "avatar": "https://example.com/avatar.jpg",
  "role": "USER",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

---

### GET `/auth/me`

Lấy thông tin user từ JWT payload (không truy vấn DB). Dùng để kiểm tra nhanh trạng thái đăng nhập.

**Auth:** JWT cookie  
**Rate limit:** Không giới hạn

**Success (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "USER",
    "iat": 1234567890,
    "exp": 1234571490
  }
}
```

> **Lưu ý:** Đây là JWT payload — không phải dữ liệu DB. Dùng `GET /auth/profile` nếu cần dữ liệu mới nhất.

---

### POST `/auth/logout`

Đăng xuất. Xóa cookies và thêm `access_token` hiện tại vào blacklist (không dùng được nữa dù chưa hết hạn).

**Auth:** JWT cookie  
**Rate limit:** default

**Success (200):**
```json
{
  "message": "Đăng xuất thành công"
}
```

---

### POST `/auth/refresh`

Làm mới `access_token` dùng `refresh_token` còn trong cookie. Gọi endpoint này khi nhận được lỗi `401` từ bất kỳ API nào.

**Auth:** Public (đọc `refresh_token` cookie tự động)  
**Rate limit:** 100 req / phút

**Success (200):**

Cookie `access_token` + `refresh_token` được cập nhật.
```json
{
  "message": "Làm mới token thành công",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "avatar": null,
    "role": "USER",
    "status": "ACTIVE"
  }
}
```

**Errors:**
- `401` — Không có refresh token, token không hợp lệ, hoặc tài khoản bị khóa/chờ duyệt

---

### POST `/auth/forgot-password`

Gửi OTP 6 chữ số đến email để reset mật khẩu. OTP có hiệu lực 15 phút.

**Auth:** Public  
**Rate limit:** 30 req / phút

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success (200):**
```json
{
  "message": "Mã OTP đang được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.",
  "expiresIn": "15 phút"
}
```

**Errors:**
- `404` — Email không tồn tại trong hệ thống

---

### POST `/auth/reset-password`

Đặt lại mật khẩu bằng OTP đã nhận qua email.

**Auth:** Public  
**Rate limit:** 50 req / phút

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "newpassword123"
}
```

**Success (200):**
```json
{
  "message": "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới."
}
```

**Errors:**
- `400` — OTP không hợp lệ, đã dùng, hoặc hết hạn
- `404` — Email không tồn tại

---

### POST `/auth/change-email/request`

Bước 1 của đổi email: gửi OTP đến địa chỉ email mới để xác minh.

**Auth:** JWT cookie  
**Rate limit:** 30 req / 15 phút

**Request Body:**
```json
{
  "newEmail": "newemail@example.com"
}
```

**Success (200):**
```json
{
  "message": "Mã OTP đang được gửi đến newemail@example.com. Vui lòng kiểm tra hộp thư.",
  "expiresIn": "15 phút"
}
```

**Errors:**
- `400` — Email mới trùng email hiện tại
- `409` — Email đã được dùng bởi tài khoản khác

---

### POST `/auth/change-email/confirm`

Bước 2 của đổi email: xác nhận OTP và cập nhật email mới vào DB.

**Auth:** JWT cookie  
**Rate limit:** 50 req / 15 phút

**Request Body:**
```json
{
  "newEmail": "newemail@example.com",
  "otp": "123456"
}
```

**Success (200):**
```json
{
  "message": "Cập nhật email thành công."
}
```

**Errors:**
- `400` — OTP không hợp lệ hoặc hết hạn
- `409` — Email vừa bị đăng ký bởi người khác trong lúc chờ

---

### GET `/auth/google`

Khởi tạo luồng đăng nhập Google OAuth. Trình duyệt sẽ được redirect đến trang đăng nhập của Google.

**Auth:** Public

> **Lưu ý:** Endpoint này redirect trực tiếp — không trả JSON. Dùng bằng cách mở URL trong trình duyệt hoặc `window.location.href`.

---

### GET `/auth/google/callback`

Callback tự động được gọi sau khi user xác nhận với Google. Không gọi trực tiếp từ FE.

**Auth:** Public (xử lý bởi GoogleAuthGuard)

**Success:** Cookie `access_token` + `refresh_token` được set.
```json
{
  "message": "Đăng nhập Google thành công",
  "user": {
    "id": "uuid",
    "email": "user@gmail.com",
    "fullName": "Nguyễn Văn A",
    "avatar": "https://lh3.googleusercontent.com/...",
    "role": "USER"
  }
}
```

**Errors:**
- `401` — Tài khoản đang chờ duyệt hoặc bị khóa
- `401` — Email chưa có tài khoản: tự động tạo mới với `PENDING`, trả 401 luôn (phải chờ admin duyệt)

---

## 🔒 2FA — Luồng chi tiết

### Ma trận hành vi khi login

| `twoFactorRequired` | `twoFactorEnabled` | Kết quả |
|---|---|---|
| ❌ | ❌ | ✅ Đăng nhập thẳng — cookies được set ngay |
| ❌ | ✅ | 🔑 Phải xác minh 2FA — trả `verificationToken` (5 phút) |
| ✅ | ❌ | ⚙️ Phải setup 2FA — trả `setupToken` (15 phút) |
| ✅ | ✅ | 🔑 Phải xác minh 2FA — trả `verificationToken` (5 phút) |

---

### Luồng A — Đăng nhập không có 2FA

```
POST /auth/login  { email, password }
  └─ skipTwoFactor: true → set cookies → done ✅
```

---

### Luồng B — Xác minh 2FA khi login (user đã bật 2FA)

```
1. POST /auth/login
   └─ { requiresTwoFactorVerification: true, verificationToken }

2. Nếu cần OTP qua email (tùy chọn):
   POST /auth/2fa/send-email-otp
   Header: Authorization: Bearer <verificationToken>

3. Xác minh bằng một trong ba cách:
   POST /auth/2fa/verify/totp         body: { code: "123456" }
   POST /auth/2fa/verify/email        body: { code: "789012" }
   POST /auth/2fa/verify/backup-code  body: { code: "ABCD1234" }
   Header: Authorization: Bearer <verificationToken>

   └─ set cookies → done ✅
```

---

### Luồng C — Bắt buộc setup 2FA khi login (admin enforce)

```
1. POST /auth/login
   └─ { requiresTwoFactorSetup: true, setupToken }

2. POST /auth/2fa/setup/initiate
   Header: Authorization: Bearer <setupToken>
   Body:   { password: "user_password" }
   └─ { secret, qrCode, setupToken (mới, chứa secret) }
   → User quét QR bằng app Authenticator

3. POST /auth/2fa/setup/confirm
   Header: Authorization: Bearer <setupToken mới>
   Body:   { secret: "BASE32...", code: "123456" }
   └─ { backupCodes: [...10 codes...], user } + set cookies → done ✅
```

---

### Luồng D — User tự bật 2FA (khi đã đăng nhập)

```
1. POST /auth/2fa/me/enable/initiate
   Cookie: access_token
   Body:   { password: "user_password" }
   └─ { secret, qrCode, setupToken }
   → User quét QR bằng app Authenticator

2. POST /auth/2fa/me/enable/confirm
   Header: Authorization: Bearer <setupToken>
   Body:   { secret: "BASE32...", code: "123456" }
   └─ { backupCodes: [...10 codes...] } — không đổi cookie ✅
```

---

### Luồng E — User tự tắt 2FA

Chỉ khả dụng khi `twoFactorRequired = false`.

```
POST /auth/2fa/me/disable
Cookie: access_token
Body:   { password: "user_password", totpCode: "123456" }
└─ { success: true } ✅
```

---

### Luồng F — Khôi phục khi mất thiết bị Authenticator

Dùng khi user không truy cập được app và đã dùng hết backup codes.

```
1. POST /auth/2fa/recovery/request
   Body: { email: "user@example.com" }
   └─ Gửi OTP đến email

2. POST /auth/2fa/recovery/verify-email
   Body: { email: "user@example.com", recoveryOtp: "654321" }
   └─ { recoveryToken } — hết hạn sau 30 phút

3. POST /auth/2fa/recovery/reset
   Header: Authorization: Bearer <recoveryToken>
   └─ 2FA bị tắt hoàn toàn → đăng nhập lại bình thường ✅
      (nếu twoFactorRequired=true: phải đi lại Luồng C)
```

---

### Luồng G — Admin quản lý 2FA của user

```
Xem trạng thái:
GET  /auth/2fa/admin/status/:userId

Bắt buộc user dùng 2FA (gửi email thông báo):
POST /auth/2fa/admin/require/:userId

Gỡ bắt buộc (gửi email thông báo):
POST /auth/2fa/admin/unrequire/:userId

Reset 2FA của user (audit log + email thông báo):
POST /auth/2fa/admin/reset/:userId
Body: { reason?: "User request recovery" }
```

---

## 🔑 2FA — Endpoints

### POST `/auth/2fa/setup/initiate`

Bước 1 của setup flow (bị admin enforce): xác minh mật khẩu, tạo TOTP secret và QR code. Trả về `setupToken` mới có nhúng secret để dùng ở bước confirm.

**Auth:** `setupToken` trong header (`Authorization: Bearer <setupToken>`)  
**Rate limit:** 30 req / phút

**Request Body:**
```json
{
  "password": "current_password"
}
```

**Success (200):**
```json
{
  "success": true,
  "secret": "BASE32SECRETSTRING...",
  "qrCode": "data:image/png;base64,...",
  "setupToken": "eyJ... (token mới, có chứa secret, hết hạn 15 phút)",
  "message": "Quét mã QR bằng ứng dụng Authenticator (Google Authenticator, Authy, v.v.)"
}
```

**Errors:**
- `401` — Mật khẩu không đúng hoặc setupToken không hợp lệ/hết hạn

---

### POST `/auth/2fa/setup/confirm`

Bước 2 của setup flow (bị admin enforce): xác minh TOTP, lưu vào DB, tạo backup codes, và cấp tokens để đăng nhập ngay.

**Auth:** `setupToken` (có chứa secret) trong header  
**Rate limit:** 30 req / phút

**Request Body:**
```json
{
  "secret": "BASE32SECRETSTRING...",
  "code": "123456"
}
```

**Success (200):**

Cookie `access_token` + `refresh_token` được set.
```json
{
  "success": true,
  "message": "2FA setup hoàn tất! Tài khoản của bạn hiện đã được bảo vệ bằng 2FA.",
  "backupCodes": [
    "ABCD1234", "EFGH5678", "IJKL9012", "MNOP3456", "QRST7890",
    "UVWX1234", "YZA25678", "BCD39012", "EFG43456", "HIJ57890"
  ],
  "user": { "id": "uuid", "email": "...", "fullName": "...", "avatar": null, "role": "USER" },
  "securityTip": "Giữ mã backup ở nơi an toàn..."
}
```

**Errors:**
- `400` — Thiếu secret hoặc sai format base32
- `401` — TOTP không đúng hoặc secret không khớp với setupToken

> ⚠️ **Quan trọng:** Backup codes chỉ hiển thị **một lần duy nhất** ngay tại bước này. Hãy lưu lại trước khi đóng.

---

### POST `/auth/2fa/verify/totp`

Xác minh 2FA bằng mã TOTP từ app Authenticator sau khi login.

**Auth:** `verificationToken` trong header  
**Rate limit:** 50 req / phút

**Header:**
```
Authorization: Bearer <verificationToken>
```

**Request Body:**
```json
{
  "code": "123456"
}
```

**Success (200):**

Cookie `access_token` + `refresh_token` được set.
```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "user": { "id": "uuid", "email": "...", "fullName": "...", "avatar": null, "role": "USER" }
}
```

**Errors:**
- `401` — verificationToken không hợp lệ/hết hạn, mã TOTP sai, hoặc 2FA chưa được thiết lập

---

### POST `/auth/2fa/send-email-otp`

Gửi OTP 6 chữ số đến email của user để dùng thay cho TOTP khi không có app Authenticator.

**Auth:** `verificationToken` trong header  
**Rate limit:** 30 req / 5 phút

**Header:**
```
Authorization: Bearer <verificationToken>
```

**Success (200):**
```json
{
  "success": true,
  "message": "Mã OTP đã được gửi đến email của bạn"
}
```

**Errors:**
- `401` — verificationToken không hợp lệ/hết hạn

---

### POST `/auth/2fa/verify/email`

Xác minh 2FA bằng OTP đã nhận qua email (dùng sau khi gọi `send-email-otp`).

**Auth:** `verificationToken` trong header  
**Rate limit:** 50 req / phút

**Header:**
```
Authorization: Bearer <verificationToken>
```

**Request Body:**
```json
{
  "code": "789012"
}
```

**Success (200):**

Cookie `access_token` + `refresh_token` được set.
```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "user": { "id": "uuid", "email": "...", "fullName": "...", "avatar": null, "role": "USER" }
}
```

**Errors:**
- `401` — OTP không chính xác hoặc đã hết hạn (OTP có hiệu lực 15 phút)

---

### POST `/auth/2fa/verify/backup-code`

Xác minh 2FA bằng backup code dự phòng. Mỗi code chỉ dùng được một lần.

**Auth:** `verificationToken` trong header  
**Rate limit:** 50 req / phút

**Header:**
```
Authorization: Bearer <verificationToken>
```

**Request Body:**
```json
{
  "code": "ABCD1234"
}
```

**Success (200):**

Cookie `access_token` + `refresh_token` được set.
```json
{
  "success": true,
  "message": "Đăng nhập thành công (sử dụng mã backup)",
  "user": { "id": "uuid", "email": "...", "fullName": "...", "avatar": null, "role": "USER" },
  "warningMessage": "Bạn chỉ còn lại một số ít mã backup. Hãy yêu cầu thêm mã."
}
```

**Errors:**
- `401` — Backup code sai hoặc đã được sử dụng trước đó

---

### POST `/auth/2fa/recovery/request`

Gửi OTP khôi phục đến email để bắt đầu quá trình reset 2FA khi mất thiết bị. Response luôn thành công để không lộ thông tin email tồn tại hay không.

**Auth:** Public  
**Rate limit:** 20 req / 15 phút

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success (200):**
```json
{
  "success": true,
  "message": "Nếu email tồn tại, bạn sẽ nhận được mã khôi phục. Vui lòng kiểm tra hộp thư.",
  "nextStep": "Sử dụng mã để xác nhận yêu cầu khôi phục"
}
```

---

### POST `/auth/2fa/recovery/verify-email`

Xác minh OTP khôi phục và nhận `recoveryToken` để thực hiện reset 2FA.

**Auth:** Public  
**Rate limit:** 50 req / phút

**Request Body:**
```json
{
  "email": "user@example.com",
  "recoveryOtp": "654321"
}
```

**Success (200):**
```json
{
  "success": true,
  "recoveryToken": "eyJ... (hết hạn sau 30 phút)",
  "message": "Xác minh email thành công. Bây giờ bạn có thể reset 2FA.",
  "nextStep": "Gọi endpoint reset 2FA recovery với recovery token này"
}
```

**Errors:**
- `401` — OTP không đúng/hết hạn hoặc email không tồn tại

---

### POST `/auth/2fa/recovery/reset`

Bước cuối của luồng khôi phục: tắt 2FA hoàn toàn. Sau đó user đăng nhập lại bình thường (nếu `twoFactorRequired = true` sẽ phải setup lại).

**Auth:** `recoveryToken` trong header (`Authorization: Bearer <recoveryToken>`)  
**Rate limit:** 30 req / phút

**Success (200):**
```json
{
  "success": true,
  "message": "2FA đã được reset. Vui lòng đăng nhập lại để thiết lập 2FA mới.",
  "nextStep": "Đăng nhập lại để hoàn tất quá trình thiết lập 2FA"
}
```

**Errors:**
- `401` — recoveryToken không hợp lệ hoặc hết hạn

---

### GET `/auth/2fa/me/status`

Xem trạng thái 2FA hiện tại của bản thân.

**Auth:** JWT cookie  
**Rate limit:** Không giới hạn

**Success (200):**
```json
{
  "twoFactorEnabled": true,
  "twoFactorRequired": false,
  "backupCodesRemaining": 8
}
```

---

### POST `/auth/2fa/me/enable/initiate`

Bước 1 của luồng tự bật 2FA: xác minh mật khẩu và nhận QR code. Chỉ dùng khi đã đăng nhập.

**Auth:** JWT cookie  
**Rate limit:** 30 req / phút

**Request Body:**
```json
{
  "password": "current_password"
}
```

**Success (200):**
```json
{
  "success": true,
  "secret": "BASE32SECRETSTRING...",
  "qrCode": "data:image/png;base64,...",
  "setupToken": "eyJ... (hết hạn 15 phút)",
  "message": "Quét mã QR bằng ứng dụng Authenticator rồi gọi confirm để hoàn tất."
}
```

**Errors:**
- `401` — Mật khẩu không đúng

---

### POST `/auth/2fa/me/enable/confirm`

Bước 2 của luồng tự bật 2FA: xác minh TOTP, lưu DB, nhận backup codes. Không cấp token mới vì user đã đăng nhập sẵn.

**Auth:** `setupToken` trong header (từ bước initiate)  
**Rate limit:** 50 req / phút

**Header:**
```
Authorization: Bearer <setupToken>
```

**Request Body:**
```json
{
  "secret": "BASE32SECRETSTRING...",
  "code": "123456"
}
```

**Success (200):**
```json
{
  "success": true,
  "backupCodes": [
    "ABCD1234", "EFGH5678", "IJKL9012", "MNOP3456", "QRST7890",
    "UVWX1234", "YZA25678", "BCD39012", "EFG43456", "HIJ57890"
  ],
  "message": "2FA đã được bật thành công! Lưu các mã backup ở nơi an toàn.",
  "warning": "Nếu mất thiết bị Authenticator, bạn sẽ cần các mã backup này để đăng nhập."
}
```

**Errors:**
- `400` — Secret không khớp với setupToken
- `401` — Mã TOTP không đúng

> ⚠️ Backup codes chỉ hiển thị **một lần duy nhất**. Lưu lại ngay.

---

### POST `/auth/2fa/me/disable`

Tự tắt 2FA. Yêu cầu xác minh cả mật khẩu lẫn mã TOTP hiện tại để đảm bảo an toàn. Không thể tắt nếu admin đã đặt `twoFactorRequired = true` cho tài khoản.

**Auth:** JWT cookie  
**Rate limit:** 30 req / phút

**Request Body:**
```json
{
  "password": "current_password",
  "totpCode": "123456"
}
```

**Success (200):**
```json
{
  "success": true,
  "message": "2FA đã được tắt. Tài khoản của bạn sẽ đăng nhập trực tiếp bằng email và mật khẩu."
}
```

**Errors:**
- `400` — Tài khoản bắt buộc phải dùng 2FA (`twoFactorRequired = true`), phải liên hệ admin để gỡ
- `401` — Mật khẩu hoặc mã TOTP không đúng

---

### POST `/auth/2fa/admin/reset/:userId`

Tắt 2FA của một user cụ thể. Ghi audit log và gửi email thông báo đến user. Dùng khi user yêu cầu hỗ trợ mà không thể tự khôi phục.

**Auth:** JWT cookie + ADMIN role  
**Rate limit:** 50 req / phút

**Request Body:**
```json
{
  "reason": "User yêu cầu reset do mất thiết bị"
}
```

**Success (200):**
```json
{
  "success": true,
  "message": "2FA của user <userId> đã được reset. User sẽ được thông báo via email.",
  "userNotified": true
}
```

---

### POST `/auth/2fa/admin/require/:userId`

Bắt buộc user phải sử dụng 2FA. User sẽ bị yêu cầu setup 2FA ở lần đăng nhập kế tiếp nếu chưa bật. Gửi email thông báo đến user.

**Auth:** JWT cookie + ADMIN role  
**Rate limit:** 50 req / phút

**Success (200):**
```json
{
  "success": true,
  "message": "User <userId> bắt buộc phải sử dụng 2FA. User sẽ được thông báo via email.",
  "userNotified": true
}
```

**Errors:**
- `404` — User không tồn tại

---

### POST `/auth/2fa/admin/unrequire/:userId`

Gỡ bỏ yêu cầu bắt buộc 2FA, cho phép user tắt 2FA theo ý muốn. Gửi email thông báo đến user.

**Auth:** JWT cookie + ADMIN role  
**Rate limit:** 50 req / phút

**Success (200):**
```json
{
  "success": true,
  "message": "User <userId> không bắt buộc phải sử dụng 2FA nữa. User sẽ được thông báo via email.",
  "userNotified": true
}
```

**Errors:**
- `404` — User không tồn tại

---

### GET `/auth/2fa/admin/status/:userId`

Xem trạng thái 2FA đầy đủ của một user.

**Auth:** JWT cookie + ADMIN role  
**Rate limit:** 100 req / phút

**Success (200):**
```json
{
  "userId": "uuid",
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

**Errors:**
- `404` — User không tồn tại

---

## 👥 Users

Tất cả endpoints trong `/users` đều yêu cầu **JWT cookie**. Các endpoint ADMIN yêu cầu thêm `role: ADMIN`.

---

### GET `/users/search`

Tìm kiếm user theo tên hoặc email. Trả tối đa 20 kết quả.

**Auth:** JWT cookie  
**Query:** `q` — chuỗi tìm kiếm

**Success (200):**
```json
{
  "users": [
    { "id": "uuid", "fullName": "Nguyễn Văn A", "avatar": null, "metadata": {} }
  ]
}
```

> Trả về mảng rỗng nếu `q` trống.

---

### GET `/users`

Lấy danh sách toàn bộ users với phân trang, sắp xếp và tìm kiếm. Kèm 5 timeline event gần nhất của mỗi user.

**Auth:** JWT cookie + ADMIN  
**Query:**

| Param | Default | Mô tả |
|---|---|---|
| `page` | `1` | Số trang |
| `limit` | `10` | Số item mỗi trang |
| `sort` | `createdAt` | Field sắp xếp (`id`, `email`, `fullName`, `createdAt`, `updatedAt`, `role`) |
| `order` | `desc` | `asc` hoặc `desc` |
| `search` | — | Tìm theo tên hoặc email |

**Success (200):**
```json
{
  "data": [
    {
      "id": "uuid", "email": "...", "fullName": "...", "avatar": null,
      "phone": "...", "metadata": {}, "role": "USER", "status": "ACTIVE",
      "createdAt": "...", "updatedAt": "...",
      "timelineEvents": [
        { "id": 1, "eventType": "JOIN_BCN", "title": "...", "metadata": {}, "createdAt": "..." }
      ]
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 10,
  "totalPages": 10
}
```

---

### GET `/users/pending`

Lấy danh sách users đang chờ admin phê duyệt. Cùng format và query params với `GET /users`.

**Auth:** JWT cookie + ADMIN

---

### GET `/users/count`

Đếm tổng số users trong hệ thống.

**Auth:** JWT cookie + ADMIN

**Success (200):**
```json
{
  "count": 150
}
```

---

### GET `/users/email`

Tìm user theo địa chỉ email chính xác.

**Auth:** JWT cookie + ADMIN  
**Query:** `email` — địa chỉ email cần tìm

**Success (200):**
```json
{
  "users": {
    "id": "uuid", "email": "user@example.com", "fullName": "...",
    "avatar": null, "phone": "...", "metadata": {},
    "role": "USER", "status": "ACTIVE", "createdAt": "...", "updatedAt": "..."
  }
}
```

Hoặc nếu không tìm thấy:
```json
{
  "message": "User không tồn tại"
}
```

---

### GET `/users/me/profile`

Lấy thông tin của chính user đang đăng nhập từ JWT payload. Nhanh hơn `/auth/me` vì cùng nguồn dữ liệu.

**Auth:** JWT cookie

**Success (200):**
```json
{
  "user": { "id": "uuid", "email": "...", "role": "USER", ... }
}
```

---

### GET `/users/:id`

Lấy thông tin đầy đủ của một user, bao gồm toàn bộ timeline events.

**Auth:** JWT cookie + ADMIN

**Success (200):**
```json
{
  "users": {
    "id": "uuid", "email": "...", "fullName": "...", "avatar": null,
    "phone": "...", "metadata": {}, "role": "USER", "status": "ACTIVE",
    "createdAt": "...", "updatedAt": "...",
    "timelineEvents": [ ... ]
  }
}
```

**Errors:**
- `404` — User không tồn tại

---

### GET `/users/:id/profile`

Lấy profile công khai của một user khác. Không trả về thông tin nhạy cảm như `phone`, `metadata`, `googleId`.

**Auth:** JWT cookie (bất kỳ role)

**Success (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "avatar": "https://...",
    "role": "USER",
    "status": "ACTIVE",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "timelineEvents": [
      { "id": 3, "eventType": "PROJECT_COMPLETE", "title": "...", "metadata": {}, "createdAt": "..." }
    ]
  }
}
```

**Errors:**
- `404` — User không tồn tại

---

### POST `/users`

Tạo user mới (admin tạo hộ). User được tạo với `status: ACTIVE` ngay — không cần chờ duyệt.

**Auth:** JWT cookie + ADMIN

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "fullName": "Trần Văn B",
  "phone": "0987654321",
  "avatar": "https://...",
  "metadata": {}
}
```

| Field | Bắt buộc |
|---|---|
| `email` | ✅ |
| `password` | ✅ (min 6) |
| `fullName` | ❌ |
| `phone` | ❌ |
| `avatar` | ❌ |
| `metadata` | ❌ |

**Success (201):**
```json
{
  "users": {
    "id": "uuid", "email": "...", "fullName": "...",
    "role": "USER", "status": "ACTIVE", ...
  }
}
```

**Errors:**
- `409` — Email đã được sử dụng

---

### PATCH `/users/me`

Cập nhật thông tin cá nhân của bản thân. Tất cả fields đều optional.

**Auth:** JWT cookie (USER hoặc ADMIN)

**Request Body:**
```json
{
  "fullName": "Nguyễn Văn A Updated",
  "avatar": "https://...",
  "phone": "0999888777",
  "metadata": {
    "bio": "Mô tả bản thân",
    "status": "Đang học NestJS",
    "facebook": "https://facebook.com/...",
    "instagram": "https://instagram.com/...",
    "github": "https://github.com/...",
    "linkedin": "https://linkedin.com/...",
    "website": "https://mywebsite.com"
  }
}
```

**Success (200):**
```json
{
  "users": {
    "id": "uuid", "email": "...", "fullName": "...",
    "avatar": "...", "phone": "...", "metadata": { ... },
    "updatedAt": "..."
  }
}
```

---

### PATCH `/users/:id/approve`

Phê duyệt tài khoản đang chờ duyệt. Chuyển `status: PENDING` → `ACTIVE` và gửi email thông báo cho user.

**Auth:** JWT cookie + ADMIN

**Success (200):**
```json
{
  "message": "Tài khoản đã được phê duyệt",
  "user": { "id": "uuid", "status": "ACTIVE", ... }
}
```

---

### PATCH `/users/:id/block`

Khóa tài khoản user. Admin không thể tự khóa chính mình.

**Auth:** JWT cookie + ADMIN

**Success (200):**
```json
{
  "message": "Tài khoản đã bị khóa",
  "user": { "id": "uuid", "status": "BLOCKED", ... }
}
```

**Errors:**
- `403` — Admin tự khóa chính mình
- `404` — User không tồn tại

---

### PATCH `/users/:id/unblock`

Mở khóa tài khoản đã bị khóa.

**Auth:** JWT cookie + ADMIN

**Success (200):**
```json
{
  "message": "Tài khoản đã được mở khóa",
  "user": { "id": "uuid", "status": "ACTIVE", ... }
}
```

---

### DELETE `/users/:id/reject`

Từ chối và xóa hoàn toàn tài khoản đang chờ duyệt. Gửi email thông báo từ chối.

**Auth:** JWT cookie + ADMIN

**Success (200):**
```json
{
  "message": "Yêu cầu đăng ký đã bị từ chối và xóa khỏi hệ thống"
}
```

**Errors:**
- `404` — User không tồn tại
- `409` — User không ở trạng thái `PENDING`

---

### DELETE `/users/:id`

Xóa vĩnh viễn một user. Admin không thể tự xóa chính mình.

**Auth:** JWT cookie + ADMIN

**Success (200):**
```json
{
  "message": "User đã được xóa"
}
```

**Errors:**
- `403` — Admin tự xóa chính mình
- `404` — User không tồn tại

---

## 📅 Timeline Events

Tất cả endpoints đều yêu cầu **JWT cookie**.

**Các loại event (`eventType`):**

| Value | Ý nghĩa |
|---|---|
| `JOIN_BCN` | Gia nhập BCN |
| `COURSE_COMPLETE` | Hoàn thành khóa học |
| `QUIZ_COMPLETE` | Hoàn thành bài quiz |
| `PROJECT_COMPLETE` | Hoàn thành dự án |
| `SEMESTER_COMPLETE` | Hoàn thành học kỳ |

---

### POST `/timeline-events`

Tạo timeline event mới cho bản thân.

**Auth:** JWT cookie

**Request Body:**
```json
{
  "eventType": "COURSE_COMPLETE",
  "title": "Hoàn thành khóa NestJS",
  "metadata": {
    "courseId": "NJS101",
    "score": 95,
    "duration": "2 months"
  }
}
```

**Success (201):**
```json
{
  "id": 1,
  "userUuid": "uuid",
  "eventType": "COURSE_COMPLETE",
  "title": "Hoàn thành khóa NestJS",
  "metadata": { "courseId": "NJS101", "score": 95 },
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

---

### GET `/timeline-events/my-timeline`

Lấy danh sách timeline events của bản thân, sắp xếp mới nhất trước, có phân trang.

**Auth:** JWT cookie  
**Query:** `page` (default `1`), `limit` (default `20`)

**Success (200):**
```json
[
  {
    "id": 4,
    "userUuid": "uuid",
    "eventType": "PROJECT_COMPLETE",
    "title": "Hoàn thành Portfolio",
    "metadata": { "projectName": "Portfolio Website" },
    "createdAt": "2026-06-01T00:00:00.000Z"
  }
]
```

---

### GET `/timeline-events/:id`

Lấy chi tiết một timeline event theo ID.

**Auth:** JWT cookie  
**Params:** `id` — số nguyên

**Success (200):**
```json
{
  "id": 1,
  "userUuid": "uuid",
  "eventType": "JOIN_BCN",
  "title": "Gia nhập BCN",
  "metadata": {},
  "createdAt": "2025-12-29T00:00:00.000Z"
}
```

**Errors:**
- `404` — Event không tồn tại

---

### PATCH `/timeline-events/:id`

Cập nhật timeline event. Chỉ được chỉnh sửa event của chính mình.

**Auth:** JWT cookie (phải là chủ sở hữu event)  
**Params:** `id` — số nguyên

**Request Body (tất cả optional):**
```json
{
  "eventType": "COURSE_COMPLETE",
  "title": "Hoàn thành khóa học C++",
  "metadata": { "score": 98 }
}
```

**Success (200):** Updated event object

**Errors:**
- `403` — Cố chỉnh sửa event của người khác
- `404` — Event không tồn tại

---

### DELETE `/timeline-events/:id`

Xóa timeline event. Chỉ admin mới có quyền xóa.

**Auth:** JWT cookie + ADMIN  
**Params:** `id` — số nguyên

**Success (200):** Deleted event object

**Errors:**
- `403` — Không có quyền ADMIN
- `404` — Event không tồn tại

---

## 🍪 Cookies & Tokens

### Cookie settings

| Cookie | Max-Age | HttpOnly | Secure | SameSite | Domain (prod) |
|---|---|---|---|---|---|
| `access_token` | 60 phút | ✅ | ✅ (prod) | `none` | `.uside.studio` |
| `refresh_token` | 7 ngày | ✅ | ✅ (prod) | `none` | `.uside.studio` |

> **Development:** `secure: false`, không có `domain`, `sameSite: none` — cho phép cross-origin giữa các port localhost.

### TTL của các intermediate tokens (2FA)

| Token | TTL | Dùng cho |
|---|---|---|
| `setupToken` | 15 phút | Setup flow (bắt buộc hoặc tự nguyện) |
| `verificationToken` | 5 phút | Verify 2FA khi login |
| `recoveryToken` | 30 phút | Reset 2FA qua recovery flow |

### FE setup cơ bản

```js
// axios — áp dụng một lần toàn app
axios.defaults.withCredentials = true;

// fetch — thêm vào từng request
fetch('/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
```

### Tự động refresh token

```js
axios.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      try {
        await axios.post('/auth/refresh');
        return axios(error.config);
      } catch {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
```

---

## ⚠️ Lỗi thường gặp

### 400 Bad Request
Validation thất bại hoặc dữ liệu không hợp lệ.
```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password must be longer than or equal to 6 characters"],
  "error": "Bad Request"
}
```

### 401 Unauthorized
Chưa đăng nhập, token hết hạn, hoặc credentials sai.
```json
{ "statusCode": 401, "message": "Unauthorized" }
```
→ Gọi `POST /auth/refresh` để lấy token mới, hoặc đăng nhập lại.

### 403 Forbidden
Không đủ quyền (cần ADMIN role, hoặc cố thao tác tài nguyên của người khác).
```json
{ "statusCode": 403, "message": "Forbidden resource" }
```

### 404 Not Found
Tài nguyên không tồn tại.
```json
{ "statusCode": 404, "message": "User với ID abc không tồn tại" }
```

### 409 Conflict
Dữ liệu trùng lặp (email, phone đã dùng).
```json
{ "statusCode": 409, "message": "Email đã được sử dụng" }
```

### 429 Too Many Requests
Vượt rate limit.
```json
{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }
```

---

## 🚦 Rate Limits

| Endpoint | Limit |
|---|---|
| Default | 60 req / phút |
| `POST /auth/register` | 50 req / phút |
| `POST /auth/login` | 50 req / phút |
| `POST /auth/refresh` | 100 req / phút |
| `POST /auth/forgot-password` | 30 req / phút |
| `POST /auth/reset-password` | 50 req / phút |
| `POST /auth/change-email/request` | 30 req / 15 phút |
| `POST /auth/change-email/confirm` | 50 req / 15 phút |
| `POST /auth/2fa/setup/initiate` | 30 req / phút |
| `POST /auth/2fa/setup/confirm` | 30 req / phút |
| `POST /auth/2fa/verify/*` | 50 req / phút |
| `POST /auth/2fa/send-email-otp` | 30 req / 5 phút |
| `POST /auth/2fa/recovery/request` | 20 req / 15 phút |
| `POST /auth/2fa/recovery/verify-email` | 50 req / phút |
| `POST /auth/2fa/recovery/reset` | 30 req / phút |
| `POST /auth/2fa/me/enable/initiate` | 30 req / phút |
| `POST /auth/2fa/me/enable/confirm` | 50 req / phút |
| `POST /auth/2fa/me/disable` | 30 req / phút |
| `GET /auth/me`, `GET /auth/2fa/me/status` | Không giới hạn |
