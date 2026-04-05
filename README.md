# BCN Profiles API

Backend API cho hệ thống quản lý hồ sơ học viên BCN, xác thực người dùng, phê duyệt tài khoản, và quản lý timeline sự kiện học tập.

## 1) Tổng quan dự án

BCN Profiles được xây dựng theo kiến trúc module của NestJS, tập trung vào:

- Quản lý người dùng và trạng thái tài khoản (`PENDING`, `ACTIVE`, `BLOCKED`)
- Xác thực đa phương thức (Email/Password, Google OAuth)
- Bảo mật phiên với JWT access/refresh token và blacklist token
- Hỗ trợ quy trình bảo mật nâng cao (OTP email, 2FA, mã khôi phục)
- Quản lý timeline sự kiện học tập theo user

## 2) Tính năng chính

### Authentication & Authorization

- Đăng ký, đăng nhập bằng Email/Password
- Đăng nhập bằng Google OAuth 2.0
- JWT Access Token + Refresh Token
- RBAC theo vai trò (`USER`, `ADMIN`)
- Quên mật khẩu bằng OTP qua email
- Đổi email và xác minh email mới bằng OTP
- 2FA (TOTP + recovery codes)

### User Management

- Quản lý hồ sơ người dùng
- Admin duyệt/từ chối user mới
- Tìm kiếm, lọc, phân trang danh sách người dùng
- Quản lý trạng thái người dùng

### Timeline Events

- Quản lý sự kiện timeline theo user
- Các loại sự kiện: `JOIN_BCN`, `COURSE_COMPLETE`, `QUIZ_COMPLETE`, `PROJECT_COMPLETE`, `SEMESTER_COMPLETE`
- User tạo/sửa sự kiện của mình
- Admin có quyền quản trị cao hơn trên dữ liệu timeline

### Security

- Rate limiting (throttle)
- Token blacklist khi logout
- Validate input với `class-validator`
- `helmet` cho HTTP security headers
- Cookie parser và cơ chế bảo vệ endpoint theo guard/decorator

## 3) Công nghệ sử dụng

### Core

- **Framework:** NestJS 11
- **Language:** TypeScript 5
- **Runtime:** Node.js

### Database & ORM

- **Database:** PostgreSQL
- **ORM:** Prisma 7
- **Prisma Client Generator:** `prisma-client` (output tại `prisma/client`)
- **Migration:** Prisma Migrate

### Authentication & Security

- `@nestjs/jwt`, `passport`, `passport-jwt`, `passport-local`, `passport-google-oauth20`
- `bcrypt` để hash password/recovery codes
- `helmet`, `@nestjs/throttler`

### Validation & Data Handling

- `class-validator`
- `class-transformer`

### Email & OTP

- `nodemailer`
- Template email trong module auth

### Dev Tools

- ESLint + Prettier
- Jest (unit test + e2e)

## 4) Cấu trúc thư mục chính

```text
src/
  auth/                # Xác thực, phân quyền, OTP, 2FA
  users/               # Quản lý user và hồ sơ
  timeline-events/     # Timeline events theo user
  prisma/              # Prisma module/service cho NestJS
  common/              # Utilities/interceptors dùng chung
  middlewares/         # Middleware logging, ...

prisma/
  schema.prisma        # Định nghĩa schema database
  migrations/          # Lịch sử migration SQL
  client/              # Prisma client generated code
```

## 5) Biến môi trường

Tạo file `.env` ở root:

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/database"

# JWT
JWT_SECRET="your-jwt-secret-key"
JWT_REFRESH_SECRET="your-jwt-refresh-secret-key"

# Email (OTP)
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="your-app-password"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"

# App
NODE_ENV="development"
PORT=3000
```

## 6) Cài đặt và chạy dự án

```bash
npm install
```

### Chạy migration local/dev

```bash
npx prisma migrate dev
```

### Deploy migration (staging/production)

```bash
npm run migrate:deploy
```

### Generate Prisma Client

```bash
npx prisma generate
```

### Chạy ứng dụng

```bash
# dev
npm run start:dev

# production
npm run start:prod
```

## 7) Scripts quan trọng

- `npm run build`: Build NestJS app
- `npm run start:dev`: Chạy development mode
- `npm run start:prod`: Chạy production mode
- `npm run migrate:deploy`: Apply migration lên DB
- `npm run test`: Unit tests
- `npm run test:e2e`: E2E tests
- `npm run lint`: Lint code

## 8) Tài liệu liên quan

- API docs chi tiết: [API_DOCS.md](./API_DOCS.md)
- Hướng dẫn 2FA: [2FA_USAGE_GUIDE.md](./2FA_USAGE_GUIDE.md)

## 9) Ghi chú triển khai

- Luôn chạy migration bằng `migrate deploy` trên môi trường production.
- Hạn chế dùng `prisma db push` trên production để tránh lệch lịch sử migration.
- Đảm bảo secrets (`JWT_SECRET`, mail credentials, OAuth secrets) được quản lý qua biến môi trường an toàn.
