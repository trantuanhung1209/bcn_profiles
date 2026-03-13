import { IsEmail, IsString, MinLength } from 'class-validator';

// Request DTO for setup initiation
export class SetupTwoFactorDto {
  @IsString()
  @MinLength(4, { message: 'Password must be at least 4 characters' })
  password: string = '';
}

// Response DTO types (not using class-validator for responses)
export interface TwoFactorSetupResponseDto {
  success: boolean;
  secret: string;
  qrCode: string; // base64 encoded QR code
  message: string;
}
