import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password!: string;

  @IsString({ message: 'Tên người dùng phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên người dùng không được để trống' })
  @MinLength(2, { message: 'Tên người dùng phải có ít nhất 2 ký tự' })
  @MaxLength(50, { message: 'Tên người dùng không được vượt quá 50 ký tự' })
  fullName!: string;

  @IsString({ message: 'Số điện thoại phải là chuỗi' })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @Matches(/^(\+84|0)(3[2-9]|5[25689]|7[06-9]|8[0-9]|9[0-9])[0-9]{7}$/, {
    message: 'Số điện thoại không hợp lệ (VD: 0912345678 hoặc +84912345678)',
  })
  phone!: string;

  @IsOptional()
  @IsString({ message: 'Avatar phải là chuỗi' })
  avatar?: string;
}
