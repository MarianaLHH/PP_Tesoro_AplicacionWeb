-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'OPERADOR', 'AUDITOR');

-- CreateEnum
CREATE TYPE "EstadoOperacion" AS ENUM ('BORRADOR', 'CONFIRMADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('BOB', 'USD');

-- CreateEnum
CREATE TYPE "EstadoLote" AS ENUM ('DISPONIBLE', 'FUNDIDO', 'VENDIDO');

-- CreateEnum
CREATE TYPE "OrigenLote" AS ENUM ('COMPRA', 'FUNDICION');

-- CreateEnum
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('ENTRADA_COMPRA', 'SALIDA_VENTA', 'MERMA', 'AJUSTE', 'ANULACION');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "AccionAuditoria" AS ENUM ('CREAR', 'EDITAR', 'ANULAR');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'OPERADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "ci" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exportador" (
    "id" UUID NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nit" TEXT,
    "contacto" TEXT,
    "telefono" TEXT,
    "pais_destino" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exportador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion" (
    "id" UUID NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "onza_cierre_usd" DECIMAL(18,2) NOT NULL,
    "tipo_cambio" DECIMAL(18,4) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compra" (
    "id" UUID NOT NULL,
    "numero" INTEGER,
    "numero_local" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "cliente_id" UUID NOT NULL,
    "onza_cierre_usd" DECIMAL(18,2) NOT NULL,
    "tipo_cambio" DECIMAL(18,4) NOT NULL,
    "total_bs" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoOperacion" NOT NULL DEFAULT 'BORRADOR',
    "observacion" TEXT,
    "caja_sesion_id" UUID,
    "usuario_id" UUID NOT NULL,
    "dispositivo_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compra_item" (
    "id" UUID NOT NULL,
    "compra_id" UUID NOT NULL,
    "peso_antes_fundir_g" DECIMAL(14,3),
    "peso_despues_fundir_g" DECIMAL(14,3) NOT NULL,
    "merma_g" DECIMAL(14,3),
    "ley" DECIMAL(6,4) NOT NULL,
    "bs_por_gramo" DECIMAL(18,2) NOT NULL,
    "total_bs" DECIMAL(18,2) NOT NULL,
    "peso_fino_g" DECIMAL(14,3) NOT NULL,
    "observacion" TEXT,

    CONSTRAINT "compra_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "origen" "OrigenLote" NOT NULL,
    "compra_id" UUID,
    "fundicion_origen_id" UUID,
    "fundicion_destino_id" UUID,
    "fecha" TIMESTAMP(3) NOT NULL,
    "peso_bruto_g" DECIMAL(14,3) NOT NULL,
    "peso_fino_g" DECIMAL(14,3) NOT NULL,
    "ley_estimada" DECIMAL(6,4) NOT NULL,
    "costo_bs" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoLote" NOT NULL DEFAULT 'DISPONIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fundicion" (
    "id" UUID NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "peso_bruto_origen_g" DECIMAL(14,3) NOT NULL,
    "peso_resultante_g" DECIMAL(14,3) NOT NULL,
    "merma_g" DECIMAL(14,3) NOT NULL,
    "peso_fino_g" DECIMAL(14,3) NOT NULL,
    "ley_estimada" DECIMAL(6,4) NOT NULL,
    "costo_bs" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoOperacion" NOT NULL DEFAULT 'CONFIRMADA',
    "observacion" TEXT,
    "usuario_id" UUID NOT NULL,
    "dispositivo_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fundicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_inventario" (
    "id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "tipo" "TipoMovimientoInventario" NOT NULL,
    "peso_fino_g" DECIMAL(14,3) NOT NULL,
    "referencia_tipo" TEXT,
    "referencia_id" UUID,
    "fecha" TIMESTAMP(3) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta" (
    "id" UUID NOT NULL,
    "numero" INTEGER,
    "numero_local" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "exportador_id" UUID NOT NULL,
    "moneda" "Moneda" NOT NULL DEFAULT 'USD',
    "onza_cierre_usd" DECIMAL(18,2) NOT NULL,
    "tipo_cambio" DECIMAL(18,4) NOT NULL,
    "total_usd" DECIMAL(18,2) NOT NULL,
    "total_bs" DECIMAL(18,2) NOT NULL,
    "costo_bs" DECIMAL(18,2) NOT NULL,
    "margen_bs" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoOperacion" NOT NULL DEFAULT 'BORRADOR',
    "observacion" TEXT,
    "caja_sesion_id" UUID,
    "usuario_id" UUID NOT NULL,
    "dispositivo_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_item" (
    "id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "peso_g" DECIMAL(14,3) NOT NULL,
    "ley" DECIMAL(6,4) NOT NULL,
    "peso_fino_g" DECIMAL(14,3) NOT NULL,
    "peso_fino_estimado_g" DECIMAL(14,3) NOT NULL,
    "bs_por_gramo" DECIMAL(18,2) NOT NULL,
    "precio_gramo_usd" DECIMAL(18,2) NOT NULL,
    "total_bs" DECIMAL(18,2) NOT NULL,
    "total_usd" DECIMAL(18,2) NOT NULL,
    "costo_bs" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "venta_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_sesion" (
    "id" UUID NOT NULL,
    "fecha_apertura" TIMESTAMP(3) NOT NULL,
    "fecha_cierre" TIMESTAMP(3),
    "saldo_inicial" DECIMAL(18,2) NOT NULL,
    "saldo_final_declarado" DECIMAL(18,2),
    "saldo_final_calculado" DECIMAL(18,2),
    "diferencia" DECIMAL(18,2),
    "usuario_id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caja_sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_movimiento" (
    "id" UUID NOT NULL,
    "caja_sesion_id" UUID NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "moneda" "Moneda" NOT NULL DEFAULT 'BOB',
    "referencia_tipo" TEXT,
    "referencia_id" UUID,
    "fecha" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" UUID NOT NULL,
    "accion" "AccionAuditoria" NOT NULL,
    "datos_antes" JSONB,
    "datos_despues" JSONB,
    "usuario_id" UUID NOT NULL,
    "dispositivo_id" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correlativo" (
    "tipo" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "correlativo_pkey" PRIMARY KEY ("tipo")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "cliente_nombre_idx" ON "cliente"("nombre");

-- CreateIndex
CREATE INDEX "cotizacion_fecha_idx" ON "cotizacion"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "compra_numero_key" ON "compra"("numero");

-- CreateIndex
CREATE INDEX "compra_fecha_idx" ON "compra"("fecha");

-- CreateIndex
CREATE INDEX "compra_cliente_id_idx" ON "compra"("cliente_id");

-- CreateIndex
CREATE INDEX "compra_item_compra_id_idx" ON "compra_item"("compra_id");

-- CreateIndex
CREATE UNIQUE INDEX "lote_codigo_key" ON "lote"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "lote_compra_id_key" ON "lote"("compra_id");

-- CreateIndex
CREATE UNIQUE INDEX "lote_fundicion_origen_id_key" ON "lote"("fundicion_origen_id");

-- CreateIndex
CREATE INDEX "lote_estado_idx" ON "lote"("estado");

-- CreateIndex
CREATE INDEX "fundicion_fecha_idx" ON "fundicion"("fecha");

-- CreateIndex
CREATE INDEX "movimiento_inventario_lote_id_idx" ON "movimiento_inventario"("lote_id");

-- CreateIndex
CREATE INDEX "movimiento_inventario_fecha_idx" ON "movimiento_inventario"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "venta_numero_key" ON "venta"("numero");

-- CreateIndex
CREATE INDEX "venta_fecha_idx" ON "venta"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "venta_item_lote_id_key" ON "venta_item"("lote_id");

-- CreateIndex
CREATE INDEX "venta_item_venta_id_idx" ON "venta_item"("venta_id");

-- CreateIndex
CREATE INDEX "caja_movimiento_caja_sesion_id_idx" ON "caja_movimiento"("caja_sesion_id");

-- CreateIndex
CREATE INDEX "auditoria_entidad_entidad_id_idx" ON "auditoria"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "auditoria_fecha_idx" ON "auditoria"("fecha");

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_caja_sesion_id_fkey" FOREIGN KEY ("caja_sesion_id") REFERENCES "caja_sesion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_fundicion_origen_id_fkey" FOREIGN KEY ("fundicion_origen_id") REFERENCES "fundicion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_fundicion_destino_id_fkey" FOREIGN KEY ("fundicion_destino_id") REFERENCES "fundicion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_exportador_id_fkey" FOREIGN KEY ("exportador_id") REFERENCES "exportador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_caja_sesion_id_fkey" FOREIGN KEY ("caja_sesion_id") REFERENCES "caja_sesion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_item" ADD CONSTRAINT "venta_item_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_item" ADD CONSTRAINT "venta_item_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_sesion" ADD CONSTRAINT "caja_sesion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimiento" ADD CONSTRAINT "caja_movimiento_caja_sesion_id_fkey" FOREIGN KEY ("caja_sesion_id") REFERENCES "caja_sesion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

