-- Traspaso v2: actor ≠ paciente, hora del hecho, versión del trámite, correlación e idempotencia
ALTER TABLE `eventos`
    ADD COLUMN `rol_actor` VARCHAR(40) NULL,
    ADD COLUMN `ocurrido_en` DATETIME(3) NULL,
    ADD COLUMN `version_tramite` INTEGER NULL,
    ADD COLUMN `correlacion_id` VARCHAR(64) NULL,
    ADD COLUMN `llave_idempotencia` VARCHAR(128) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `uq_eventos_llave_idempotencia` ON `eventos`(`llave_idempotencia`);

-- CreateIndex
CREATE INDEX `idx_eventos_correlacion` ON `eventos`(`correlacion_id`);
