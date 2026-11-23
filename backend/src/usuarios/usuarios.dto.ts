import { Rol } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const LARGO_MINIMO_CLAVE = 8;
const MENSAJE_CLAVE = `La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
const MENSAJE_ROL = 'El rol debe ser ADMIN, OPERADOR o AUDITOR.';

export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty({ message: 'Escriba el nombre.' })
  @MaxLength(120)
  nombre!: string;

  @IsEmail({}, { message: 'Escriba un correo válido.' })
  @MaxLength(200)
  email!: string;

  @IsEnum(Rol, { message: MENSAJE_ROL })
  rol!: Rol;

  /** Clave temporal que el administrador entrega al usuario. */
  @IsString()
  @MinLength(LARGO_MINIMO_CLAVE, { message: MENSAJE_CLAVE })
  @MaxLength(200)
  password!: string;
}

export class EditarUsuarioDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Escriba el nombre.' })
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Escriba un correo válido.' })
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsEnum(Rol, { message: MENSAJE_ROL })
  rol?: Rol;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class RestablecerClaveDto {
  @IsString()
  @MinLength(LARGO_MINIMO_CLAVE, { message: MENSAJE_CLAVE })
  @MaxLength(200)
  password!: string;
}

export class CambiarClaveDto {
  @IsString()
  @IsNotEmpty({ message: 'Escriba la contraseña actual.' })
  @MaxLength(200)
  actual!: string;

  @IsString()
  @MinLength(LARGO_MINIMO_CLAVE, { message: MENSAJE_CLAVE })
  @MaxLength(200)
  nueva!: string;
}
