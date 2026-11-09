import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const ENTIDADES = ['cliente', 'cotizacion', 'compra', 'fundicion', 'venta'] as const;
export const ACCIONES = ['crear', 'editar', 'anular'] as const;

/** Una entrada de la cola de salida (outbox) de la PWA. */
export class OperacionDto {
  /** Id de la entrada en la cola; la respuesta lo devuelve para emparejar. */
  @IsUUID()
  id!: string;

  @IsIn(ENTIDADES)
  entidad!: (typeof ENTIDADES)[number];

  @IsUUID()
  entidadId!: string;

  @IsIn(ACCIONES)
  accion!: (typeof ACCIONES)[number];

  /** Se valida campo a campo en `verificacion.ts`, según la entidad. */
  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OperacionDto)
  operaciones!: OperacionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  dispositivoId?: string;
}

export type ResultadoOperacion =
  | { id: string; estado: 'ok'; numero?: number }
  | { id: string; estado: 'rechazada'; mensaje: string };
