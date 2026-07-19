import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';

export class InitiateEnable2FADto {
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password: string;
}

export class ConfirmEnable2FADto {
  /** Optional legacy field — server prefers secret bound to setupToken. */
  @IsOptional()
  @IsString()
  secret?: string;

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
