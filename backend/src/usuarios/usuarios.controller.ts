import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles, RolesGuard } from '../auth/roles';
import { UsuarioActual, UsuarioSesion } from '../auth/sesion';
import { CrearUsuarioDto, EditarUsuarioDto, RestablecerClaveDto } from './usuarios.dto';
import { UsuariosService } from './usuarios.service';

/** Administración de cuentas. Solo para ADMIN. */
@Controller('usuarios')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Post()
  crear(@Body() dto: CrearUsuarioDto, @UsuarioActual() yo: UsuarioSesion) {
    return this.usuarios.crear(dto, { id: yo.id });
  }

  @Patch(':id')
  editar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EditarUsuarioDto,
    @UsuarioActual() yo: UsuarioSesion,
  ) {
    return this.usuarios.editar(id, dto, { id: yo.id });
  }

  @Post(':id/restablecer-clave')
  @HttpCode(204)
  async restablecerClave(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RestablecerClaveDto,
    @UsuarioActual() yo: UsuarioSesion,
  ) {
    await this.usuarios.restablecerClave(id, dto.password, { id: yo.id });
  }
}
