-- Alinea el esquema con lo que la PWA guarda en IndexedDB, para que la
-- sincronización pueda subir sus operaciones sin perder datos.

-- Kardex: la fundición conjunta mueve lotes enteros.
ALTER TYPE "TipoMovimientoInventario" ADD VALUE 'ENTRADA_FUNDICION';
ALTER TYPE "TipoMovimientoInventario" ADD VALUE 'SALIDA_FUNDICION';

-- Las fechas de operación son días (`YYYY-MM-DD` en la PWA), no instantes.
ALTER TABLE "compra"    ALTER COLUMN "fecha" SET DATA TYPE DATE;
ALTER TABLE "lote"      ALTER COLUMN "fecha" SET DATA TYPE DATE;
ALTER TABLE "fundicion" ALTER COLUMN "fecha" SET DATA TYPE DATE;

-- Venta: el comprador es texto libre; el exportador pasa a ser opcional.
-- Siempre se cobra en Bs (total_usd es referencia), así que sobra `moneda`.
ALTER TABLE "venta" DROP CONSTRAINT "venta_exportador_id_fkey";

ALTER TABLE "venta" ADD COLUMN "destino" TEXT;
UPDATE "venta" v
   SET "destino" = COALESCE(
         (SELECT e."razon_social" FROM "exportador" e WHERE e."id" = v."exportador_id"),
         '—');
ALTER TABLE "venta"
  ALTER COLUMN "destino" SET NOT NULL,
  DROP COLUMN "moneda",
  ALTER COLUMN "fecha" SET DATA TYPE DATE,
  ALTER COLUMN "exportador_id" DROP NOT NULL,
  -- `null` en ventas anteriores al módulo de lotes: no se conoce el costo.
  ALTER COLUMN "costo_bs" DROP NOT NULL,
  ALTER COLUMN "ganancia_bs" DROP NOT NULL;

ALTER TABLE "venta" ADD CONSTRAINT "venta_exportador_id_fkey"
  FOREIGN KEY ("exportador_id") REFERENCES "exportador"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Ítem de venta: puede no tener lote (ventas antiguas) y guarda su código.
ALTER TABLE "venta_item" DROP CONSTRAINT "venta_item_lote_id_fkey";

ALTER TABLE "venta_item" ADD COLUMN "lote_codigo" TEXT;
UPDATE "venta_item" vi
   SET "lote_codigo" = COALESCE(
         (SELECT l."codigo" FROM "lote" l WHERE l."id" = vi."lote_id"),
         '—');
ALTER TABLE "venta_item"
  ALTER COLUMN "lote_codigo" SET NOT NULL,
  ALTER COLUMN "lote_id" DROP NOT NULL,
  ALTER COLUMN "bs_por_gramo" DROP NOT NULL,
  ALTER COLUMN "costo_bs" DROP NOT NULL;

ALTER TABLE "venta_item" ADD CONSTRAINT "venta_item_lote_id_fkey"
  FOREIGN KEY ("lote_id") REFERENCES "lote"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
