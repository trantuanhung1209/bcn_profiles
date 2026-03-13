import { IsEmail, IsString, Length } from 'class-validator';

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

// Step 3: Reset 2FA after recovery verification
export class ResetTwoFactorAfterRecoveryDto {
  @IsString()
  recoveryToken: string; // JWT token from recovery email verification
}

// Response type when recovery is successful (not using validators for response)
export interface TwoFactorRecoveryResponseDto {
  success: boolean;
  message: string;
  twoFactorDisabled: boolean;
  nextSteps: string;
}
