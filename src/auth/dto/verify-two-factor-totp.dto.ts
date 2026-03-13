import { IsString, Length } from 'class-validator';

// Request DTO
export class VerifyTwoFactorTotpDto {
  @IsString()
  @Length(6, 6, { message: 'TOTP code must be 6 digits' })
  code: string;
}

// Response DTO type (not using validators for response)
export interface VerifyTwoFactorTotpResponseDto {
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
