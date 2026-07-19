import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

// Step 1: Request recovery
export class TwoFactorRecoveryRequestDto {
  @IsEmail()
  email: string;
}

// Step 2: Verify recovery email (user receives OTP in email)
export class VerifyRecoveryEmailDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'Recovery OTP code must be 6 digits' })
  recoveryOtp: string;
}

// Step 3: Reset 2FA after recovery verification — requires account password
export class ResetTwoFactorAfterRecoveryDto {
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6)
  password: string;
}

// Response type when recovery is successful (not using validators for response)
export interface TwoFactorRecoveryResponseDto {
  success: boolean;
  message: string;
  twoFactorDisabled: boolean;
  nextSteps: string;
}
