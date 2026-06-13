import { IsString, IsNotEmpty, Length } from 'class-validator';

export class InitiateEnable2FADto {
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password: string;
}

export class ConfirmEnable2FADto {
  /** TOTP secret từ initiate step (không bắt buộc nếu setupToken đã chứa secret) */
  @IsString()
  @IsNotEmpty({ message: 'Secret không được để trống' })
  secret: string;

  @IsString()
  @Length(6, 6, { message: 'Mã TOTP phải đúng 6 chữ số' })
  @IsNotEmpty({ message: 'Mã TOTP không được để trống' })
  code: string;
}

export class Disable2FADto {
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password: string;

  @IsString()
  @Length(6, 6, { message: 'Mã TOTP phải đúng 6 chữ số' })
  @IsNotEmpty({ message: 'Mã TOTP không được để trống' })
  totpCode: string;
}
