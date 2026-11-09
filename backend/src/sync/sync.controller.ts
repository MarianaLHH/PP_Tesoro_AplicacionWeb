import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { UsuarioActual, UsuarioSesion } from '../auth/sesion';
import { SyncDto } from './sync.dto';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /**
   * Recibe un tramo de la cola de salida. Responde un resultado por operación
   * aplicada, en orden; si una se rechaza, las siguientes no se procesan y
   * quedan fuera de la respuesta.
   */
  @Post()
  @HttpCode(200)
  async sincronizar(@Body() dto: SyncDto, @UsuarioActual() usuario: UsuarioSesion) {
    const resultados = await this.sync.procesar(dto.operaciones, usuario, dto.dispositivoId);
    return { resultados };
  }
}
