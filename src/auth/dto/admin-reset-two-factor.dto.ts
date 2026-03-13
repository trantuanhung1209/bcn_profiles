import { IsString, IsOptional } from 'class-validator';

// Request DTO
export class AdminResetTwoFactorDto {
  @IsOptional()
  @IsString()
  reason?: string; // Optional reason for audit logging
}

// Response DTO type (not using validators for response)
export interface AdminResetTwoFactorResponseDto {
  success: boolean;
  message: string;
  userId: string;
  twoFactorDisabled: boolean;
  userNotified: boolean;
}
