import {
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class SetAvatarDto {
  @IsUrl(
    { require_protocol: true, protocols: ['https'] },
    { message: 'avatar phải là URL https' },
  )
  avatar!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/^[a-zA-Z0-9/_-]+$/, {
    message: 'avatarPublicId chứa ký tự không hợp lệ',
  })
  avatarPublicId!: string;
}
