import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  /** Không ràng buộc định dạng email ở bước đăng nhập: sai tài khoản phải trả 401, không phải 400. */
  @IsString({ message: 'Email không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập email.' })
  @MaxLength(200, { message: 'Email quá dài.' })
  email!: string;

  @IsString({ message: 'Mật khẩu không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu.' })
  @MaxLength(200, { message: 'Mật khẩu quá dài.' })
  password!: string;
}

export class RefreshDto {
  @IsString({ message: 'Refresh token không hợp lệ.' })
  @IsNotEmpty({ message: 'Thiếu refresh token.' })
  refresh_token!: string;
}
