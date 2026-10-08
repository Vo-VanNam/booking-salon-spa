import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AiChatDto {
  @IsString({ message: 'Nội dung tin nhắn không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập nội dung tin nhắn.' })
  @MaxLength(2000, { message: 'Nội dung tin nhắn quá dài (tối đa 2000 ký tự).' })
  message!: string;

  @IsOptional()
  @IsString({ message: 'Mã phiên không hợp lệ.' })
  @MaxLength(100, { message: 'Mã phiên quá dài.' })
  session_id?: string;
}
