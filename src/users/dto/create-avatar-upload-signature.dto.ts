import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAvatarUploadSignatureDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  publicId?: string;
}
