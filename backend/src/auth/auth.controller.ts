import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Publico, UsuarioActual, UsuarioSesion } from './sesion';

export class LoginDto {
  @IsEmail({}, { message: 'Escriba un correo válido.' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Escriba la contraseña.' })
  @MaxLength(200)
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.iniciarSesion(dto.email, dto.password);
  }

  /** Sirve a la PWA para comprobar que el token sigue vigente. */
  @Get('yo')
  yo(@UsuarioActual() usuario: UsuarioSesion) {
    return usuario;
  }
}
