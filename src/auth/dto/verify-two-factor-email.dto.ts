import { IsString, Length } from 'class-validator';

// Request DTO
export class VerifyTwoFactorEmailDto {
  @IsString()
  @Length(6, 6, { message: 'Email OTP code must be 6 digits' })
  code: string;
}

// Response DTO type (not using validators for response)
export interface VerifyTwoFactorEmailResponseDto {
  success: boolean;
  message: string;
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName?: string;
    role: string;
  };
}
