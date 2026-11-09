import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';

const SECRETO_DE_EJEMPLO = 'cambiar-en-produccion';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secreto = config.get<string>('JWT_SECRET');
        if (!secreto) throw new Error('Falta la variable JWT_SECRET.');
        if (secreto === SECRETO_DE_EJEMPLO && process.env.NODE_ENV === 'production') {
          new Logger('Auth').warn(
            'JWT_SECRET tiene el valor de ejemplo: cualquiera podría firmar sesiones. Cámbielo.',
          );
        }
        return {
          secret: secreto,
          signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '8h' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtGuard }],
})
export class AuthModule {}
