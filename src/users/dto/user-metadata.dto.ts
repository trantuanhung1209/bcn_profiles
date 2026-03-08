import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UserMetadataDto {
  @IsOptional()
  @IsString({ message: 'Bio phải là chuỗi' })
  bio?: string;

  @IsOptional()
  @IsString({ message: 'Trạng thái phải là chuỗi' })
  status?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Link Facebook không hợp lệ' })
  facebook?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Link Instagram không hợp lệ' })
  instagram?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Link TikTok không hợp lệ' })
  tiktok?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Link YouTube không hợp lệ' })
  youtube?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Link GitHub không hợp lệ' })
  github?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Link LinkedIn không hợp lệ' })
  linkedin?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Link Twitter/X không hợp lệ' })
  twitter?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Link website không hợp lệ' })
  website?: string;
}
