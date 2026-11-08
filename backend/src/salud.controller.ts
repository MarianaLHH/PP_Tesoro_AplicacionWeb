import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

/** Usado por Docker y por la plataforma en la nube para saber si el servicio está vivo. */
@Controller('salud')
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async salud() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { estado: 'ok', baseDeDatos: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ estado: 'error', baseDeDatos: 'sin conexión' });
    }
  }
}
