<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

BCN Profiles - Hệ thống quản lý hồ sơ và timeline sự kiện cho học viên BCN.

### ✨ Features

- 🔐 **Authentication & Authorization**
  - Email/Password authentication
  - Google OAuth 2.0
  - JWT with access & refresh tokens
  - Role-based access control (USER, ADMIN)
  - Password reset with OTP via email
  - Email change with OTP verification
  
- 👥 **User Management**
  - User registration with admin approval
  - User profile management
  - Search and filter users
  - User status management (PENDING, ACTIVE, BLOCKED)
  - Admin dashboard for user management
  
- 📅 **Timeline Events**
  - Track user milestones and achievements
  - Event types: JOIN_BCN, COURSE_COMPLETE, QUIZ_COMPLETE, PROJECT_COMPLETE, SEMESTER_COMPLETE
  - User can create and update their own events
  - Admin can delete any events
  
- 🛡️ **Security**
  - Rate limiting (ThrottleGuard)
  - Token blacklist on logout
  - HTTP-only cookies for tokens
  - Input validation with class-validator
  
- 🗄️ **Database**
  - PostgreSQL with Prisma ORM
  - Type-safe database queries
  - Automated migrations

### 🛠️ Tech Stack

- **Framework:** NestJS
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Authentication:** Passport.js (JWT, Google OAuth)
- **Validation:** class-validator, class-transformer
- **Email:** Nodemailer

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## 📚 API Documentation

Xem tài liệu đầy đủ về tất cả API endpoints tại: **[API_DOCS.md](./API_DOCS.md)**

Tài liệu bao gồm:
- ✅ Authentication APIs (đăng ký, đăng nhập, quên mật khẩu, Google OAuth)
- ✅ User Management APIs (CRUD, phê duyệt, khóa/mở khóa)
- ✅ Timeline Events APIs (tạo, sửa, xóa timeline)
- ✅ Request/Response examples
- ✅ Error handling
- ✅ Authentication flow
- ✅ Tips for Frontend development

## Project setup

```bash
$ npm install
```

## Environment Setup

Tạo file `.env` trong thư mục root với nội dung:

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/database"

# JWT
JWT_SECRET="your-jwt-secret-key"
JWT_REFRESH_SECRET="your-jwt-refresh-secret-key"

# Email (for OTP)
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

## Database Setup

```bash
# Push schema to database
$ npx prisma db push

# Generate Prisma Client
$ npx prisma generate

# (Optional) Open Prisma Studio
$ npx prisma studio
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## 📁 Project Structure

```
src/
├── auth/                   # Authentication module
│   ├── guards/            # JWT & Roles guards
│   ├── strategies/        # Passport strategies
│   ├── decorators/        # Custom decorators
│   └── dto/               # Data transfer objects
├── users/                 # User management module
│   └── dto/
├── timeline-events/       # Timeline events module
│   └── dto/
├── prisma/                # Prisma configuration
│   └── prisma.service.ts
├── common/                # Shared utilities
│   ├── interceptors/
│   └── utils/
└── middlewares/           # Custom middlewares

prisma/
├── schema.prisma          # Database schema
└── migrations/            # Database migrations
```

## 🚀 Quick Start

1. Clone repository
2. Install dependencies: `npm install`
3. Setup `.env` file
4. Push database schema: `npx prisma db push`
5. Generate Prisma Client: `npx prisma generate`
6. Start development: `npm run start:dev`
7. Access API at: `http://localhost:3000`

## 📋 Default Admin Account

Sau khi chạy seed (nếu có), bạn có thể tạo admin account thông qua:
- Register qua API → Admin approve → Promote to ADMIN role

Hoặc tạo trực tiếp trong database:
```sql
UPDATE "User" SET role = 'ADMIN', status = 'ACTIVE' WHERE email = 'admin@example.com';
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
