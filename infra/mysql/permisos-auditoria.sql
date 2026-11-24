-- Principio de mínimo privilegio para la bitácora de auditoría (#11, ADR 0002).
-- Ejecutar con usuario root en MySQL 8 al aprovisionar la base de datos en VPS (#35).
-- El usuario de la aplicación puede consultar e insertar en `auditoria`, pero NUNCA modificar ni borrar filas.

REVOKE ALL PRIVILEGES ON `salud_digna`.`auditoria` FROM 'salud_digna_app'@'%';
GRANT SELECT, INSERT ON `salud_digna`.`auditoria` TO 'salud_digna_app'@'%';
FLUSH PRIVILEGES;
