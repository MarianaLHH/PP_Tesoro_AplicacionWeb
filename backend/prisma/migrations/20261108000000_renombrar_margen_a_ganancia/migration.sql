-- Renombra margen por ganancia. RENAME conserva los datos existentes.
ALTER TABLE "venta" RENAME COLUMN "margen_bs" TO "ganancia_bs";
