-- Quién envió una operación sincronizada (el autor sigue en usuario_id).
ALTER TABLE "auditoria" ADD COLUMN "enviado_por_id" UUID;
