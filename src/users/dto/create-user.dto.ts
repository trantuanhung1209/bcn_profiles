import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UserMetadataDto } from './user-metadata.dto';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @Matches(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
    message: 'Email phải có định dạng hợp lệ (vd: user@example.com)',
  })
  email!: string;

  @IsString({ message: 'Password phải là chuỗi' })
  @IsNotEmpty({ message: 'Password không được để trống' })
  @MinLength(6, { message: 'Password phải có ít nhất 6 ký tự' })
  password!: string;

  @IsOptional()
  @IsString({ message: 'Họ tên phải là chuỗi' })
  fullName?: string;

  @IsOptional()
  @IsString({ message: 'Avatar phải là chuỗi' })
  avatar?: string;

  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi' })
  phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UserMetadataDto)
  metadata?: UserMetadataDto;
}
