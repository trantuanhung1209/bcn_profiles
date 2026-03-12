# API Documentation - BCN Profiles

Base URL: `https://your-domain.com/api`

## 📋 Mục lục

- [Authentication APIs](#authentication-apis)
- [User Management APIs](#user-management-apis)
- [Timeline Events APIs](#timeline-events-apis)
- [Common Errors](#common-errors)

---

## 🔐 Authentication APIs

### 1. Đăng ký tài khoản

**POST** `/auth/register`

**Public endpoint** - Không cần authentication

**Rate limit:** 5 requests / phút

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "Nguyễn Văn A",
  "phone": "0912345678",
  "avatar": "https://example.com/avatar.jpg" // Optional
}
```

**Validation:**
- Email: phải là email hợp lệ
- Password: tối thiểu 6 ký tự
- FullName: 2-50 ký tự
- Phone: số điện thoại Việt Nam hợp lệ (0912345678 hoặc +84912345678)

**Success Response (201):**
```json
{
  "message": "Đăng ký thành công. Vui lòng chờ admin phê duyệt.",
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "phone": "0912345678",
    "status": "PENDING",
    "role": "USER",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Response (400):**
```json
{
  "statusCode": 400,
  "message": "Email đã tồn tại",
  "error": "Bad Request"
}
```

---

### 2. Đăng nhập

**POST** `/auth/login`

**Public endpoint**

**Rate limit:** 5 requests / phút

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Success Response (200):**
```json
{
  "message": "Đăng nhập thành công"
}
```

**Cookies được set:**
- `access_token`: JWT token (expires: 60 phút)
- `refresh_token`: JWT refresh token (expires: 7 ngày)

**Error Response (401):**
```json
{
  "statusCode": 401,
  "message": "Email hoặc mật khẩu không đúng"
}
```

---

### 3. Đăng xuất

**POST** `/auth/logout`

**Requires:** Authentication (access_token cookie)

**Success Response (200):**
```json
{
  "message": "Đăng xuất thành công"
}
```

**Note:** Cookies sẽ bị xóa và access token sẽ được thêm vào blacklist

---

### 4. Refresh Token

**POST** `/auth/refresh`

**Public endpoint** - Nhưng cần refresh_token cookie

**Rate limit:** 10 requests / phút

**Success Response (200):**
```json
{
  "message": "Làm mới token thành công",
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "role": "USER"
  }
}
```

**Cookies được cập nhật:**
- `access_token`: Token mới (expires: 60 phút)
- `refresh_token`: Token mới (expires: 7 ngày)

---

### 5. Lấy thông tin profile

**GET** `/auth/profile`

**Requires:** Authentication

**Success Response (200):**
```json
{
  "id": "uuid-string",
  "email": "user@example.com",
  "fullName": "Nguyễn Văn A",
  "avatar": "https://example.com/avatar.jpg",
  "phone": "0912345678",
  "role": "USER",
  "status": "ACTIVE",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "metadata": {
    "dateOfBirth": "1990-01-01",
    "address": "Hà Nội"
  }
}
```

---

### 6. Lấy thông tin user hiện tại

**GET** `/auth/me`

**Requires:** Authentication

**Success Response (200):**
```json
{
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "role": "USER"
  }
}
```

---

### 7. Quên mật khẩu

**POST** `/auth/forgot-password`

**Public endpoint**

**Rate limit:** 3 requests / phút

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "message": "Email đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư."
}
```

**Note:** OTP sẽ được gửi qua email, có hiệu lực 15 phút

---

### 8. Đặt lại mật khẩu

**POST** `/auth/reset-password`

**Public endpoint**

**Rate limit:** 5 requests / phút

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "newpassword123"
}
```

**Success Response (200):**
```json
{
  "message": "Đặt lại mật khẩu thành công"
}
```

**Error Response (400):**
```json
{
  "statusCode": 400,
  "message": "OTP không hợp lệ hoặc đã hết hạn"
}
```

---

### 9. Yêu cầu đổi email

**POST** `/auth/change-email/request`

**Requires:** Authentication

**Rate limit:** 3 requests / 15 phút

**Request Body:**
```json
{
  "newEmail": "newemail@example.com",
  "password": "currentpassword123"
}
```

**Success Response (200):**
```json
{
  "message": "OTP đã được gửi đến email mới. Vui lòng kiểm tra và xác nhận."
}
```

---

### 10. Xác nhận đổi email

**POST** `/auth/change-email/confirm`

**Requires:** Authentication

**Rate limit:** 5 requests / 15 phút

**Request Body:**
```json
{
  "newEmail": "newemail@example.com",
  "otp": "123456"
}
```

**Success Response (200):**
```json
{
  "message": "Email đã được thay đổi thành công"
}
```

---

### 11. Đăng nhập Google

**GET** `/auth/google`

**Public endpoint**

Redirect user đến trang đăng nhập Google OAuth

---

### 12. Google OAuth Callback

**GET** `/auth/google/callback`

**Public endpoint**

Được gọi tự động bởi Google sau khi user cho phép

**Success Response (200):**
```json
{
  "message": "Đăng nhập Google thành công",
  "user": {
    "id": "uuid-string",
    "email": "user@gmail.com",
    "fullName": "Nguyễn Văn A",
    "avatar": "https://lh3.googleusercontent.com/...",
    "role": "USER"
  }
}
```

---

## 👥 User Management APIs

### 1. Tìm kiếm users

**GET** `/users/search?q={query}`

**Requires:** Authentication

**Query Parameters:**
- `q`: Chuỗi tìm kiếm (tên hoặc email)

**Success Response (200):**
```json
{
  "users": [
    {
      "id": "uuid-string",
      "email": "user@example.com",
      "fullName": "Nguyễn Văn A",
      "avatar": "https://example.com/avatar.jpg",
      "role": "USER",
      "status": "ACTIVE"
    }
  ]
}
```

---

### 2. Lấy danh sách tất cả users

**GET** `/users`

**Requires:** ADMIN role

**Query Parameters:**
- `page`: Số trang (default: 1)
- `limit`: Số items mỗi trang (default: 10)
- `sort`: Trường để sort (default: "createdAt")
- `order`: Thứ tự sort "asc" hoặc "desc" (default: "desc")
- `search`: Chuỗi tìm kiếm (optional)

**Example:** `/users?page=1&limit=10&sort=fullName&order=asc&search=nguyen`

**Success Response (200):**
```json
{
  "users": [
    {
      "id": "uuid-string",
      "email": "user@example.com",
      "fullName": "Nguyễn Văn A",
      "avatar": "https://example.com/avatar.jpg",
      "phone": "0912345678",
      "role": "USER",
      "status": "ACTIVE",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "timelineEvents": [
        {
          "id": 2,
          "eventType": "COURSE_COMPLETE",
          "title": "Hoàn thành khóa C",
          "metadata": { "score": 95 },
          "createdAt": "2024-05-15T00:00:00.000Z"
        },
        {
          "id": 1,
          "eventType": "JOIN_BCN",
          "title": "Gia nhập BCN",
          "metadata": {},
          "createdAt": "2023-12-29T00:00:00.000Z"
        }
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

### 3. Lấy danh sách users đang chờ duyệt

**GET** `/users/pending`

**Requires:** ADMIN role

**Query Parameters:** Giống như `/users`

**Success Response (200):**
```json
{
  "users": [
    {
      "id": "uuid-string",
      "email": "user@example.com",
      "fullName": "Nguyễn Văn A",
      "phone": "0912345678",
      "status": "PENDING",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "timelineEvents": []
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 10
}
```

---

### 4. Đếm số lượng users

**GET** `/users/count`

**Requires:** ADMIN role

**Success Response (200):**
```json
{
  "count": 150
}
```

---

### 5. Tìm user theo email

**GET** `/users/email?email={email}`

**Requires:** ADMIN role

**Success Response (200):**
```json
{
  "users": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "role": "USER",
    "status": "ACTIVE"
  }
}
```

**Not Found (200):**
```json
{
  "message": "User không tồn tại"
}
```

---

### 6. Lấy thông tin một user

**GET** `/users/:id`

**Requires:** ADMIN role

**Success Response (200):**
```json
{
  "users": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "avatar": "https://example.com/avatar.jpg",
    "phone": "0912345678",
    "role": "USER",
    "status": "ACTIVE",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "metadata": {},
    "timelineEvents": [
      {
        "id": 2,
        "eventType": "COURSE_COMPLETE",
        "title": "Hoàn thành khóa C",
        "metadata": { "score": 95 },
        "createdAt": "2024-05-15T00:00:00.000Z"
      },
      {
        "id": 1,
        "eventType": "JOIN_BCN",
        "title": "Gia nhập BCN",
        "metadata": {},
        "createdAt": "2023-12-29T00:00:00.000Z"
      }
    ]
  }
}
```

---

### 7. Tạo user mới

**POST** `/users`

**Requires:** ADMIN role

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "fullName": "Trần Văn B",
  "phone": "0987654321",
  "avatar": "https://example.com/avatar.jpg", // Optional
  "role": "USER", // Optional: "USER" hoặc "ADMIN"
  "status": "ACTIVE" // Optional: "PENDING", "ACTIVE", "BLOCKED"
}
```

**Success Response (201):**
```json
{
  "users": {
    "id": "uuid-string",
    "email": "newuser@example.com",
    "fullName": "Trần Văn B",
    "role": "USER",
    "status": "ACTIVE"
  }
}
```

---

### 8. Phê duyệt user

**PATCH** `/users/:id/approve`

**Requires:** ADMIN role

**Success Response (200):**
```json
{
  "message": "Tài khoản đã được phê duyệt",
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "status": "ACTIVE"
  }
}
```

---

### 9. Khóa tài khoản user

**PATCH** `/users/:id/block`

**Requires:** ADMIN role

**Note:** Admin không thể tự khóa tài khoản của chính mình

**Success Response (200):**
```json
{
  "message": "Tài khoản đã bị khóa",
  "user": {
    "id": "uuid-string",
    "status": "BLOCKED"
  }
}
```

**Error (403):**
```json
{
  "statusCode": 403,
  "message": "Bạn không thể tự khóa tài khoản của chính mình"
}
```

---

### 10. Mở khóa tài khoản user

**PATCH** `/users/:id/unblock`

**Requires:** ADMIN role

**Success Response (200):**
```json
{
  "message": "Tài khoản đã được mở khóa",
  "user": {
    "id": "uuid-string",
    "status": "ACTIVE"
  }
}
```

---

### 11. Từ chối yêu cầu đăng ký

**DELETE** `/users/:id/reject`

**Requires:** ADMIN role

**Note:** Xóa user có status PENDING khỏi hệ thống

**Success Response (200):**
```json
{
  "message": "Yêu cầu đăng ký đã bị từ chối và xóa khỏi hệ thống"
}
```

---

### 12. Xóa user

**DELETE** `/users/:id`

**Requires:** ADMIN role

**Note:** Admin không thể tự xóa tài khoản của chính mình

**Success Response (200):**
```json
{
  "message": "User đã được xóa"
}
```

---

### 13. Cập nhật thông tin cá nhân

**PATCH** `/users/me`

**Requires:** Authentication (USER hoặc ADMIN)

**Request Body:**
```json
{
  "fullName": "Nguyễn Văn A Updated",
  "avatar": "https://example.com/new-avatar.jpg",
  "phone": "0999888777",
  "metadata": {
    "dateOfBirth": "1990-01-01",
    "address": "Hà Nội",
    "customField": "value"
  }
}
```

**Note:** Tất cả các trường đều optional

**Success Response (200):**
```json
{
  "users": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A Updated",
    "avatar": "https://example.com/new-avatar.jpg",
    "phone": "0999888777",
    "metadata": {
      "dateOfBirth": "1990-01-01",
      "address": "Hà Nội"
    },
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

---

### 14. Xem thông tin cá nhân

**GET** `/users/me/profile`

**Requires:** Authentication

**Success Response (200):**
```json
{
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "avatar": "https://example.com/avatar.jpg",
    "phone": "0912345678",
    "role": "USER",
    "status": "ACTIVE"
  }
}
```

---

### 15. Xem profile công khai của user khác

**GET** `/users/:id/profile`

**Requires:** Authentication

**Note:** 
- Mọi user đã đăng nhập có thể xem profile công khai của user khác
- Chỉ trả về thông tin công khai (không bao gồm: số điện thoại, metadata, thông tin đăng nhập)
- Chỉ có thể xem profile của user có status ACTIVE
- Bao gồm timeline events của user đó

**Success Response (200):**
```json
{
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "avatar": "https://example.com/avatar.jpg",
    "role": "USER",
    "status": "ACTIVE",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "timelineEvents": [
      {
        "id": 3,
        "eventType": "PROJECT_COMPLETE",
        "title": "Hoàn thành project HTML CSS JS",
        "metadata": {
          "projectName": "Portfolio"
        },
        "createdAt": "2024-06-30T00:00:00.000Z"
      },
      {
        "id": 2,
        "eventType": "COURSE_COMPLETE",
        "title": "Hoàn thành khóa C",
        "metadata": {
          "score": 95
        },
        "createdAt": "2024-05-15T00:00:00.000Z"
      },
      {
        "id": 1,
        "eventType": "JOIN_BCN",
        "title": "Gia nhập BCN",
        "metadata": {},
        "createdAt": "2023-12-29T00:00:00.000Z"
      }
    ]
  }
}
```

**Error (404):**
```json
{
  "statusCode": 404,
  "message": "User với ID uuid-string không tồn tại"
}
```

---

## 📅 Timeline Events APIs

### 1. Tạo timeline event mới

**POST** `/timeline-events`

**Requires:** Authentication

**Request Body:**
```json
{
  "eventType": "COURSE_COMPLETE",
  "title": "Hoàn thành khóa học C",
  "metadata": {
    "courseId": "C101",
    "score": 95,
    "duration": "3 months"
  }
}
```

**Event Types:**
- `JOIN_BCN`: Gia nhập BCN
- `COURSE_COMPLETE`: Hoàn thành khóa học
- `QUIZ_COMPLETE`: Hoàn thành bài quiz
- `PROJECT_COMPLETE`: Hoàn thành dự án
- `SEMESTER_COMPLETE`: Hoàn thành học kỳ

**Success Response (201):**
```json
{
  "id": 1,
  "userUuid": "uuid-string",
  "eventType": "COURSE_COMPLETE",
  "title": "Hoàn thành khóa học C",
  "metadata": {
    "courseId": "C101",
    "score": 95
  },
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

### 2. Lấy timeline của user hiện tại

**GET** `/timeline-events/my-timeline`

**Requires:** Authentication

**Success Response (200):**
```json
[
  {
    "id": 4,
    "userUuid": "uuid-string",
    "eventType": "PROJECT_COMPLETE",
    "title": "Hoàn thành project HTML CSS JS",
    "metadata": {
      "projectName": "Portfolio Website"
    },
    "createdAt": "2024-06-30T00:00:00.000Z"
  },
  {
    "id": 3,
    "userUuid": "uuid-string",
    "eventType": "QUIZ_COMPLETE",
    "title": "Hoàn thành quiz C",
    "metadata": {
      "score": 90
    },
    "createdAt": "2024-06-20T00:00:00.000Z"
  },
  {
    "id": 2,
    "userUuid": "uuid-string",
    "eventType": "COURSE_COMPLETE",
    "title": "Hoàn thành khóa C",
    "metadata": {},
    "createdAt": "2024-05-15T00:00:00.000Z"
  },
  {
    "id": 1,
    "userUuid": "uuid-string",
    "eventType": "JOIN_BCN",
    "title": "Gia nhập BCN",
    "metadata": {},
    "createdAt": "2023-12-29T00:00:00.000Z"
  }
]
```

**Note:** Events được sắp xếp theo thứ tự mới nhất

---

### 3. Lấy chi tiết một timeline event

**GET** `/timeline-events/:id`

**Requires:** Authentication

**Success Response (200):**
```json
{
  "id": 1,
  "userUuid": "uuid-string",
  "eventType": "JOIN_BCN",
  "title": "Gia nhập BCN",
  "metadata": {},
  "createdAt": "2023-12-29T00:00:00.000Z"
}
```

**Error (404):**
```json
{
  "statusCode": 404,
  "message": "Timeline event with ID 1 not found"
}
```

---

### 4. Cập nhật timeline event

**PATCH** `/timeline-events/:id`

**Requires:** Authentication

**Note:** User chỉ có thể cập nhật event của chính mình

**Request Body:**
```json
{
  "eventType": "COURSE_COMPLETE",
  "title": "Hoàn thành khóa học C++",
  "metadata": {
    "courseId": "C102",
    "score": 98
  }
}
```

**Note:** Tất cả các trường đều optional

**Success Response (200):**
```json
{
  "id": 2,
  "userUuid": "uuid-string",
  "eventType": "COURSE_COMPLETE",
  "title": "Hoàn thành khóa học C++",
  "metadata": {
    "courseId": "C102",
    "score": 98
  },
  "createdAt": "2024-05-15T00:00:00.000Z"
}
```

**Error (403):**
```json
{
  "statusCode": 403,
  "message": "You can only update your own timeline events"
}
```

---

### 5. Xóa timeline event

**DELETE** `/timeline-events/:id`

**Requires:** ADMIN role

**Note:** Chỉ admin mới có thể xóa timeline events (kể cả của user khác)

**Success Response (200):**
```json
{
  "id": 1,
  "userUuid": "uuid-string",
  "eventType": "JOIN_BCN",
  "title": "Gia nhập BCN",
  "metadata": {},
  "createdAt": "2023-12-29T00:00:00.000Z"
}
```

**Error (403):**
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```

---

## ⚠️ Common Errors

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```
**Nguyên nhân:** 
- Chưa đăng nhập (thiếu access_token)
- Token đã hết hạn
- Token không hợp lệ

**Giải pháp:** Gọi `/auth/refresh` để làm mới token hoặc đăng nhập lại

---

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```
**Nguyên nhân:**
- Không có quyền truy cập endpoint (cần ADMIN role)
- Cố gắng thao tác trên resource của người khác

---

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Resource not found"
}
```
**Nguyên nhân:** Resource không tồn tại (user, timeline event, etc.)

---

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": [
    "Email không hợp lệ",
    "Mật khẩu phải có ít nhất 6 ký tự"
  ],
  "error": "Bad Request"
}
```
**Nguyên nhân:** Validation error - dữ liệu gửi lên không hợp lệ

---

### 429 Too Many Requests
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```
**Nguyên nhân:** Vượt quá rate limit
- Default: 60 requests / phút
- Login/Register: 5 requests / phút
- Forgot password: 3 requests / phút

---

## 🔑 Authentication Flow

### Luồng đăng nhập thông thường

1. **Đăng ký:** `POST /auth/register`
   - User đăng ký → status = PENDING
   - Chờ admin approve

2. **Admin phê duyệt:** `PATCH /users/:id/approve`
   - Admin approve → status = ACTIVE
   - User có thể đăng nhập

3. **Đăng nhập:** `POST /auth/login`
   - Nhận access_token (15 phút) và refresh_token (7 ngày) trong cookies
   - Sử dụng access_token cho các API calls

4. **Làm mới token:** `POST /auth/refresh`
   - Khi access_token hết hạn, tự động gọi refresh để lấy token mới
   - Không cần user đăng nhập lại

5. **Đăng xuất:** `POST /auth/logout`
   - Xóa cookies và blacklist token

### Gọi API với Authentication

**Cách 1: Sử dụng Cookie (Recommended)**
```javascript
// Browser tự động gửi cookies
fetch('https://api.example.com/auth/profile', {
  method: 'GET',
  credentials: 'include', // Quan trọng: gửi cookies
})

// Xem profile user khác (bao gồm timeline)
fetch('https://api.example.com/users/uuid-123/profile', {
  method: 'GET',
  credentials: 'include',
})
```

**Cách 2: Sử dụng Bearer Token**
```javascript
// Nếu không dùng cookie
fetch('https://api.example.com/auth/profile', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
})
```

---

## 📝 User Roles & Permissions

### USER Role
✅ Có thể:
- Quản lý thông tin cá nhân
- Xem và cập nhật timeline events của chính mình
- Tìm kiếm users khác
- Xem profile công khai của user khác

❌ Không thể:
- Xem danh sách tất cả users
- Approve/Block/Delete users
- Xóa timeline events
- Xem thông tin chi tiết/riêng tư của user khác (phone, metadata)

### ADMIN Role
✅ Có thể:
- Tất cả quyền của USER
- Quản lý tất cả users (CRUD)
- Approve/Block/Unblock users
- Xóa timeline events của bất kỳ user nào
- Xem thống kê

❌ Không thể:
- Tự xóa hoặc block chính mình

---

## 🚀 Tips for Frontend Development

### 1. Xử lý Token Expired
```javascript
// Interceptor để tự động refresh token
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        await axios.post('/auth/refresh', {}, { 
          withCredentials: true 
        });
        // Retry request gốc
        return axios(error.config);
      } catch (refreshError) {
        // Redirect to login
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
```

### 2. Timeline Events Display
```javascript
// Format event type cho UI
const EVENT_TYPE_LABELS = {
  JOIN_BCN: { label: 'Gia nhập BCN', icon: '🎉', color: 'blue' },
  COURSE_COMPLETE: { label: 'Hoàn thành khóa học', icon: '📚', color: 'green' },
  QUIZ_COMPLETE: { label: 'Hoàn thành quiz', icon: '✅', color: 'purple' },
  PROJECT_COMPLETE: { label: 'Hoàn thành dự án', icon: '🚀', color: 'orange' },
  SEMESTER_COMPLETE: { label: 'Hoàn thành học kỳ', icon: '🎓', color: 'red' },
};
```

### 3. User Status Display
```javascript
const STATUS_CONFIG = {
  PENDING: { label: 'Chờ duyệt', color: 'yellow', canLogin: false },
  ACTIVE: { label: 'Hoạt động', color: 'green', canLogin: true },
  BLOCKED: { label: 'Đã khóa', color: 'red', canLogin: false },
};
```

### 4. Rate Limiting Handling
```javascript
// Hiển thị countdown khi bị rate limit
if (error.response?.status === 429) {
  const retryAfter = error.response.headers['retry-after'] || 60;
  showToast(`Vui lòng thử lại sau ${retryAfter} giây`);
}
```

### 5. User Profile Display
```javascript
// Component hiển thị profile với timeline
function UserProfile({ userId }) {
  const [profile, setProfile] = useState(null);
  
  useEffect(() => {
    // Lấy profile công khai kèm timeline
    fetch(`/users/${userId}/profile`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setProfile(data.user));
  }, [userId]);
  
  return (
    <div>
      <div className="profile-header">
        <img src={profile?.avatar} alt={profile?.fullName} />
        <h1>{profile?.fullName}</h1>
        <p>{profile?.email}</p>
        <span className={`badge ${profile?.role}`}>{profile?.role}</span>
      </div>
      
      <div className="timeline">
        <h2>Timeline</h2>
        {profile?.timelineEvents?.map(event => (
          <div key={event.id} className="timeline-event">
            <span className="icon">{EVENT_TYPE_LABELS[event.eventType].icon}</span>
            <div>
              <h3>{event.title}</h3>
              <small>{new Date(event.createdAt).toLocaleDateString('vi-VN')}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 📞 Support

Nếu có vấn đề hoặc câu hỏi về API, vui lòng liên hệ:
- Email: support@bcn.com
- Slack: #api-support
