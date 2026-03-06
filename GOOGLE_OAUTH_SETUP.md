# Hướng dẫn cấu hình Google OAuth Login

## 1. Tạo Google OAuth Credentials

### Bước 1: Truy cập Google Cloud Console
- Truy cập: https://console.cloud.google.com/
- Đăng nhập bằng tài khoản Google của bạn

### Bước 2: Tạo hoặc chọn Project
- Chọn project hiện có hoặc tạo project mới
- Click vào "Select a project" ở thanh menu trên cùng
- Click "NEW PROJECT" nếu muốn tạo mới

### Bước 3: Kích hoạt Google+ API (tùy chọn)
- Vào "APIs & Services" > "Library"
- Tìm "Google+ API" và enable (một số phiên bản có thể không cần)

### Bước 4: Tạo OAuth 2.0 Credentials
1. Vào "APIs & Services" > "Credentials"
2. Click "CREATE CREDENTIALS" > "OAuth client ID"
3. Nếu chưa có OAuth consent screen, bạn sẽ được yêu cầu cấu hình:
   - Chọn "External" (cho testing) hoặc "Internal"
   - Điền thông tin app: App name, User support email, Developer contact
   - Click "Save and Continue"
   - Scopes: Thêm `.../auth/userinfo.email` và `.../auth/userinfo.profile`
   - Test users: Thêm email để test (nếu External)

4. Sau khi cấu hình OAuth consent:
   - Chọn "Application type": **Web application**
   - Đặt tên: "Chat App OAuth"
   - **Authorized JavaScript origins**:
     ```
     http://localhost:3000
     ```
   - **Authorized redirect URIs**:
     ```
     http://localhost:3000/auth/google/callback
     ```
   - Click "CREATE"

5. Sao chép **Client ID** và **Client Secret**

## 2. Cấu hình Environment Variables

Thêm các biến sau vào file `.env`:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

**Lưu ý Production:**
- Khi deploy lên production, thay đổi URLs thành domain thật
- Cập nhật lại "Authorized redirect URIs" trong Google Console
- Ví dụ: `https://your-domain.com/auth/google/callback`

## 3. Testing Google OAuth Login

### Frontend (Browser):
Redirect user đến endpoint:
```
GET http://localhost:3000/auth/google
```

### Flow:
1. User click "Đăng nhập bằng Google"
2. Frontend redirect đến: `http://localhost:3000/auth/google`
3. Google hiển thị màn hình đăng nhập
4. User chọn tài khoản và đồng ý
5. Google redirect về: `http://localhost:3000/auth/google/callback`
6. Backend xử lý và trả về JWT tokens trong cookies
7. Frontend nhận response với thông tin user

### Response mẫu:
```json
{
  "message": "Đăng nhập Google thành công",
  "user": {
    "id": "uuid",
    "email": "user@gmail.com",
    "fullName": "Nguyen Van A",
    "avatar": "https://lh3.googleusercontent.com/...",
    "role": "USER"
  }
}
```

## 4. Ghi chú quan trọng

### Bảo mật:
- **KHÔNG** commit file `.env` lên Git
- Sử dụng HTTPS trong production
- Kiểm tra CORS settings kỹ lưỡng

### Database:
- User đăng nhập lần đầu qua Google sẽ tự động được tạo tài khoản
- Field `password` sẽ là `null` cho Google users
- Email từ Google được dùng làm unique identifier

### Xử lý Frontend:
```javascript
// Button đăng nhập Google
<a href="http://localhost:3000/auth/google" className="btn-google">
  Đăng nhập bằng Google
</a>

// Hoặc dùng window.location
const handleGoogleLogin = () => {
  window.location.href = 'http://localhost:3000/auth/google';
};
```

## 5. Troubleshooting

### Lỗi "redirect_uri_mismatch":
- Kiểm tra URL trong Google Console khớp chính xác với `GOOGLE_CALLBACK_URL`
- Không có dấu `/` thừa ở cuối

### Lỗi "access_denied":
- Kiểm tra OAuth consent screen đã được cấu hình
- Thêm email test user nếu app đang ở chế độ "Testing"

### User không được tạo:
- Kiểm tra Prisma schema có field `password` nullable
- Xem logs để debug lỗi database
