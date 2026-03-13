import { IsArray, IsString } from 'class-validator';

// Request DTO
export class ConfirmTwoFactorSetupDto {
  @IsArray()
  @IsString({ each: true })
  backupCodes: string[]; // List of backup codes (for confirmation only, server generates them)
}

// Response DTO type (not using validators for response)
export interface ConfirmTwoFactorSetupResponseDto {
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
