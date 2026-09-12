import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserMetadataDto } from './user-metadata.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Họ tên phải là chuỗi' })
  fullName?: string;

  /** URL avatar. Gửi cùng avatarPublicId khi upload MinIO; gửi null để xóa. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ require_protocol: true }, { message: 'Avatar phải là URL hợp lệ' })
  avatar?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'avatarPublicId phải là chuỗi' })
  @IsNotEmpty({ message: 'avatarPublicId không được để trống' })
  @Matches(/^[a-zA-Z0-9/_-]+$/, {
    message: 'avatarPublicId chứa ký tự không hợp lệ',
  })
  avatarPublicId?: string | null;

  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi' })
  phone?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UserMetadataDto)
  metadata?: UserMetadataDto;
}
