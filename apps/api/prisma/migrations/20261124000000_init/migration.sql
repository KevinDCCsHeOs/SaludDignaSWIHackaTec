-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(36) NOT NULL,
    `clave` ENUM('paciente', 'asesor_ia', 'asesor', 'asesor_pro', 'medico', 'revisor_tecnico', 'admin') NOT NULL,
    `nombre` VARCHAR(80) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `permisos` JSON NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_clave_key`(`clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` VARCHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `hash` VARCHAR(255) NOT NULL,
    `rol` ENUM('paciente', 'asesor_ia', 'asesor', 'asesor_pro', 'medico', 'revisor_tecnico', 'admin') NOT NULL,
    `region` VARCHAR(60) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `es_demo` BOOLEAN NOT NULL DEFAULT false,
    `ultimo_acceso_en` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_email_key`(`email`),
    INDEX `idx_usuarios_rol_region_activo`(`rol`, `region`, `activo`),
    INDEX `idx_usuarios_region`(`region`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pacientes` (
    `id` VARCHAR(36) NOT NULL,
    `nombre` VARCHAR(120) NOT NULL,
    `apellidos` VARCHAR(150) NOT NULL,
    `fecha_nac_cifrada` TEXT NULL,
    `curp_cifrado` TEXT NULL,
    `curp_hash` CHAR(64) NULL,
    `datos_fiscales_cifrados` TEXT NULL,
    `email` VARCHAR(254) NULL,
    `telefono_e164` VARCHAR(20) NULL,
    `canal_preferido` ENUM('web', 'app', 'whatsapp', 'call_center', 'email') NOT NULL DEFAULT 'whatsapp',
    `idioma` ENUM('es', 'en', 'nah') NOT NULL DEFAULT 'es',
    `region` VARCHAR(60) NULL,
    `es_demo` BOOLEAN NOT NULL DEFAULT false,
    `usuario_id` VARCHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_pacientes_curp_hash`(`curp_hash`),
    UNIQUE INDEX `pacientes_usuario_id_key`(`usuario_id`),
    INDEX `idx_pacientes_telefono`(`telefono_e164`),
    INDEX `idx_pacientes_email`(`email`),
    INDEX `idx_pacientes_region`(`region`),
    INDEX `idx_pacientes_es_demo`(`es_demo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `identidades_canal` (
    `id` VARCHAR(36) NOT NULL,
    `paciente_id` VARCHAR(36) NOT NULL,
    `canal` ENUM('web', 'app', 'whatsapp', 'call_center', 'email') NOT NULL,
    `identificador` VARCHAR(254) NOT NULL,
    `verificado_en` DATETIME(3) NULL,
    `metodo_verificacion` VARCHAR(40) NULL,
    `es_principal` BOOLEAN NOT NULL DEFAULT false,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `idx_identidad_paciente`(`paciente_id`),
    INDEX `idx_identidad_identificador`(`identificador`),
    UNIQUE INDEX `uq_identidad_canal_identificador`(`canal`, `identificador`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consentimientos` (
    `id` VARCHAR(36) NOT NULL,
    `paciente_id` VARCHAR(36) NOT NULL,
    `tipo` ENUM('aviso_privacidad', 'datos_sensibles', 'notificaciones') NOT NULL DEFAULT 'aviso_privacidad',
    `version_aviso` VARCHAR(32) NOT NULL,
    `canal` ENUM('web', 'app', 'whatsapp', 'call_center', 'email') NOT NULL,
    `otorgado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revocado_en` DATETIME(3) NULL,
    `ip` VARCHAR(45) NULL,

    INDEX `idx_consentimiento_paciente_tipo`(`paciente_id`, `tipo`),
    INDEX `idx_consentimiento_otorgado`(`otorgado_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clinicas` (
    `id` VARCHAR(36) NOT NULL,
    `codigo` VARCHAR(32) NOT NULL,
    `nombre` VARCHAR(160) NOT NULL,
    `direccion` VARCHAR(300) NOT NULL,
    `lat` DECIMAL(10, 7) NOT NULL,
    `lng` DECIMAL(10, 7) NOT NULL,
    `region` VARCHAR(60) NOT NULL,
    `telefono` VARCHAR(20) NULL,
    `horario` JSON NOT NULL,
    `estatus` ENUM('operando', 'retraso', 'fuera_de_servicio') NOT NULL DEFAULT 'operando',
    `mensaje_estatus` VARCHAR(255) NULL,
    `es_demo` BOOLEAN NOT NULL DEFAULT false,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `clinicas_codigo_key`(`codigo`),
    INDEX `idx_clinicas_region_estatus`(`region`, `estatus`),
    INDEX `idx_clinicas_coordenadas`(`lat`, `lng`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estudios` (
    `id` VARCHAR(36) NOT NULL,
    `codigo` VARCHAR(40) NOT NULL,
    `nombre` VARCHAR(160) NOT NULL,
    `categoria` ENUM('laboratorio', 'ultrasonido', 'rayos_x', 'mastografia', 'papanicolaou', 'electrocardiograma', 'densitometria', 'tomografia', 'resonancia', 'optometria', 'nutricion', 'otro') NOT NULL,
    `precio` DECIMAL(10, 2) NOT NULL,
    `preparacion` TEXT NOT NULL,
    `duracion_minutos` INTEGER NOT NULL DEFAULT 30,
    `vigencia_dias` INTEGER NOT NULL DEFAULT 30,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `es_demo` BOOLEAN NOT NULL DEFAULT false,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `estudios_codigo_key`(`codigo`),
    INDEX `idx_estudios_categoria_activo`(`categoria`, `activo`),
    INDEX `idx_estudios_nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tramites` (
    `id` VARCHAR(36) NOT NULL,
    `folio` VARCHAR(32) NOT NULL,
    `paciente_id` VARCHAR(36) NOT NULL,
    `estudio_id` VARCHAR(36) NULL,
    `clinica_id` VARCHAR(36) NULL,
    `tipo` ENUM('estudio', 'resultado', 'factura') NOT NULL DEFAULT 'estudio',
    `estado` ENUM('cotizacion', 'registro', 'seleccion_clinica', 'cita_agendada', 'cita_confirmada', 'pago_factura', 'en_proceso', 'resultados_liberados', 'cerrado', 'pausado', 'cancelado') NOT NULL DEFAULT 'cotizacion',
    `estado_anterior` ENUM('cotizacion', 'registro', 'seleccion_clinica', 'cita_agendada', 'cita_confirmada', 'pago_factura', 'en_proceso', 'resultados_liberados', 'cerrado', 'pausado', 'cancelado') NULL,
    `paso_actual` VARCHAR(60) NOT NULL,
    `contexto` JSON NOT NULL,
    `canal_origen` ENUM('web', 'app', 'whatsapp', 'call_center', 'email') NOT NULL,
    `ultimo_canal` ENUM('web', 'app', 'whatsapp', 'call_center', 'email') NOT NULL,
    `region` VARCHAR(60) NULL,
    `vence_en` DATETIME(3) NULL,
    `es_demo` BOOLEAN NOT NULL DEFAULT false,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tramites_folio_key`(`folio`),
    INDEX `idx_tramites_paciente_estado`(`paciente_id`, `estado`),
    INDEX `idx_tramites_estado_actualizado`(`estado`, `actualizado_en`),
    INDEX `idx_tramites_region_estado`(`region`, `estado`),
    INDEX `idx_tramites_ultimo_canal`(`ultimo_canal`),
    INDEX `idx_tramites_vence_en`(`vence_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pasos_tramite` (
    `id` VARCHAR(36) NOT NULL,
    `tramite_id` VARCHAR(36) NOT NULL,
    `orden` INTEGER NOT NULL,
    `clave_paso` VARCHAR(60) NOT NULL,
    `estatus` ENUM('pendiente', 'en_progreso', 'completado', 'omitido', 'fallido') NOT NULL DEFAULT 'en_progreso',
    `canal` ENUM('web', 'app', 'whatsapp', 'call_center', 'email') NOT NULL,
    `datos` JSON NULL,
    `iniciado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completado_en` DATETIME(3) NULL,

    INDEX `idx_paso_tramite_clave`(`tramite_id`, `clave_paso`),
    INDEX `idx_paso_tramite_canal_fecha`(`canal`, `iniciado_en`),
    UNIQUE INDEX `uq_paso_tramite_orden`(`tramite_id`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `citas` (
    `id` VARCHAR(36) NOT NULL,
    `tramite_id` VARCHAR(36) NOT NULL,
    `clinica_id` VARCHAR(36) NOT NULL,
    `fecha_hora` DATETIME(3) NOT NULL,
    `estatus` ENUM('agendada', 'confirmada', 'en_curso', 'completada', 'reprogramada', 'cancelada', 'no_asistio') NOT NULL DEFAULT 'agendada',
    `canal_agendamiento` ENUM('web', 'app', 'whatsapp', 'call_center', 'email') NOT NULL,
    `codigo_confirmacion` VARCHAR(24) NULL,
    `confirmada_en` DATETIME(3) NULL,
    `cancelada_en` DATETIME(3) NULL,
    `motivo_cancelacion` VARCHAR(255) NULL,
    `es_demo` BOOLEAN NOT NULL DEFAULT false,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `citas_codigo_confirmacion_key`(`codigo_confirmacion`),
    INDEX `idx_citas_tramite_estatus`(`tramite_id`, `estatus`),
    INDEX `idx_citas_clinica_fecha`(`clinica_id`, `fecha_hora`),
    INDEX `idx_citas_estatus_fecha`(`estatus`, `fecha_hora`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resultados` (
    `id` VARCHAR(36) NOT NULL,
    `tramite_id` VARCHAR(36) NOT NULL,
    `estudio_id` VARCHAR(36) NOT NULL,
    `estatus` ENUM('captura', 'revision_tecnica', 'validacion_medica', 'liberado', 'rechazado') NOT NULL DEFAULT 'captura',
    `contenido_cifrado` LONGTEXT NULL,
    `archivo_url_cifrada` TEXT NULL,
    `observaciones_tecnicas` TEXT NULL,
    `motivo_rechazo` VARCHAR(255) NULL,
    `revisado_por` VARCHAR(36) NULL,
    `revisado_en` DATETIME(3) NULL,
    `validado_por` VARCHAR(36) NULL,
    `validado_en` DATETIME(3) NULL,
    `liberado_en` DATETIME(3) NULL,
    `es_demo` BOOLEAN NOT NULL DEFAULT false,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `idx_resultados_tramite_estatus`(`tramite_id`, `estatus`),
    INDEX `idx_resultados_estatus_fecha`(`estatus`, `actualizado_en`),
    INDEX `idx_resultados_medico_estatus`(`validado_por`, `estatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `interacciones` (
    `id` VARCHAR(36) NOT NULL,
    `paciente_id` VARCHAR(36) NOT NULL,
    `tramite_id` VARCHAR(36) NULL,
    `canal` ENUM('web', 'app', 'whatsapp', 'call_center', 'email') NOT NULL,
    `actor_tipo` ENUM('paciente', 'asesor_ia', 'asesor', 'asesor_pro', 'medico', 'revisor_tecnico', 'admin', 'sistema') NOT NULL,
    `actor_id` VARCHAR(64) NULL,
    `resumen` TEXT NOT NULL,
    `referencia_externa` VARCHAR(128) NULL,
    `metadatos` JSON NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_interacciones_paciente_fecha`(`paciente_id`, `creado_en`),
    INDEX `idx_interacciones_tramite_fecha`(`tramite_id`, `creado_en`),
    INDEX `idx_interacciones_canal_fecha`(`canal`, `creado_en`),
    UNIQUE INDEX `uq_interacciones_canal_ref`(`canal`, `referencia_externa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eventos` (
    `id` CHAR(36) NOT NULL,
    `tipo` VARCHAR(80) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `paciente_id` VARCHAR(36) NULL,
    `tramite_id` VARCHAR(36) NULL,
    `canal` ENUM('web', 'app', 'whatsapp', 'call_center', 'email') NOT NULL,
    `actor_tipo` ENUM('paciente', 'asesor_ia', 'asesor', 'asesor_pro', 'medico', 'revisor_tecnico', 'admin', 'sistema') NOT NULL,
    `actor_id` VARCHAR(64) NULL,
    `payload` JSON NOT NULL,
    `publicado_en` DATETIME(3) NULL,
    `intentos_publicacion` INTEGER NOT NULL DEFAULT 0,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_eventos_paciente_fecha`(`paciente_id`, `creado_en`),
    INDEX `idx_eventos_tramite_fecha`(`tramite_id`, `creado_en`),
    INDEX `idx_eventos_tipo_fecha`(`tipo`, `creado_en`),
    INDEX `idx_eventos_canal_fecha`(`canal`, `creado_en`),
    INDEX `idx_eventos_outbox_pendientes`(`publicado_en`, `creado_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tickets` (
    `id` VARCHAR(36) NOT NULL,
    `folio` VARCHAR(32) NOT NULL,
    `paciente_id` VARCHAR(36) NOT NULL,
    `tramite_id` VARCHAR(36) NULL,
    `canal_origen` ENUM('web', 'app', 'whatsapp', 'call_center', 'email') NOT NULL,
    `tipo` ENUM('duda', 'queja', 'error_servicio', 'acceso_cuenta', 'informacion_incorrecta', 'urgencia') NOT NULL,
    `prioridad` ENUM('baja', 'media', 'alta', 'critica') NOT NULL DEFAULT 'media',
    `estatus` ENUM('abierto', 'en_atencion', 'escalado', 'resuelto', 'cerrado') NOT NULL DEFAULT 'abierto',
    `nivel_escalamiento` ENUM('ia', 'asesor', 'asesor_pro') NOT NULL DEFAULT 'ia',
    `region` VARCHAR(60) NOT NULL,
    `asignado_a` VARCHAR(36) NULL,
    `resumen_ia` TEXT NULL,
    `motivo_escalamiento` VARCHAR(255) NULL,
    `sla_vence_en` DATETIME(3) NOT NULL,
    `sla_vencido` BOOLEAN NOT NULL DEFAULT false,
    `resuelto_en` DATETIME(3) NULL,
    `es_demo` BOOLEAN NOT NULL DEFAULT false,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tickets_folio_key`(`folio`),
    INDEX `idx_tickets_region_estatus_prioridad`(`region`, `estatus`, `prioridad`),
    INDEX `idx_tickets_asignado_estatus`(`asignado_a`, `estatus`),
    INDEX `idx_tickets_sla`(`estatus`, `sla_vence_en`),
    INDEX `idx_tickets_paciente`(`paciente_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auditoria` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `usuario_id` VARCHAR(36) NULL,
    `rol` ENUM('paciente', 'asesor_ia', 'asesor', 'asesor_pro', 'medico', 'revisor_tecnico', 'admin') NULL,
    `accion` ENUM('leer', 'crear', 'actualizar', 'eliminar', 'login', 'logout', 'verificar_otp', 'vincular_identidad', 'exportar', 'liberar_resultado') NOT NULL,
    `entidad` VARCHAR(60) NOT NULL,
    `entidad_id` VARCHAR(64) NOT NULL,
    `paciente_id` VARCHAR(36) NULL,
    `canal` ENUM('web', 'app', 'whatsapp', 'call_center', 'email') NOT NULL,
    `ip` VARCHAR(45) NULL,
    `exitoso` BOOLEAN NOT NULL DEFAULT true,
    `detalle_sin_pii` JSON NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_auditoria_usuario_fecha`(`usuario_id`, `creado_en`),
    INDEX `idx_auditoria_paciente_fecha`(`paciente_id`, `creado_en`),
    INDEX `idx_auditoria_entidad`(`entidad`, `entidad_id`),
    INDEX `idx_auditoria_canal_fecha`(`canal`, `creado_en`),
    INDEX `idx_auditoria_fecha`(`creado_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_rol_fkey` FOREIGN KEY (`rol`) REFERENCES `roles`(`clave`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pacientes` ADD CONSTRAINT `pacientes_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identidades_canal` ADD CONSTRAINT `identidades_canal_paciente_id_fkey` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consentimientos` ADD CONSTRAINT `consentimientos_paciente_id_fkey` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tramites` ADD CONSTRAINT `tramites_paciente_id_fkey` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tramites` ADD CONSTRAINT `tramites_estudio_id_fkey` FOREIGN KEY (`estudio_id`) REFERENCES `estudios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tramites` ADD CONSTRAINT `tramites_clinica_id_fkey` FOREIGN KEY (`clinica_id`) REFERENCES `clinicas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pasos_tramite` ADD CONSTRAINT `pasos_tramite_tramite_id_fkey` FOREIGN KEY (`tramite_id`) REFERENCES `tramites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `citas` ADD CONSTRAINT `citas_tramite_id_fkey` FOREIGN KEY (`tramite_id`) REFERENCES `tramites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `citas` ADD CONSTRAINT `citas_clinica_id_fkey` FOREIGN KEY (`clinica_id`) REFERENCES `clinicas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resultados` ADD CONSTRAINT `resultados_tramite_id_fkey` FOREIGN KEY (`tramite_id`) REFERENCES `tramites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resultados` ADD CONSTRAINT `resultados_estudio_id_fkey` FOREIGN KEY (`estudio_id`) REFERENCES `estudios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resultados` ADD CONSTRAINT `resultados_revisado_por_fkey` FOREIGN KEY (`revisado_por`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resultados` ADD CONSTRAINT `resultados_validado_por_fkey` FOREIGN KEY (`validado_por`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interacciones` ADD CONSTRAINT `interacciones_paciente_id_fkey` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interacciones` ADD CONSTRAINT `interacciones_tramite_id_fkey` FOREIGN KEY (`tramite_id`) REFERENCES `tramites`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos` ADD CONSTRAINT `eventos_paciente_id_fkey` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos` ADD CONSTRAINT `eventos_tramite_id_fkey` FOREIGN KEY (`tramite_id`) REFERENCES `tramites`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tickets` ADD CONSTRAINT `tickets_paciente_id_fkey` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tickets` ADD CONSTRAINT `tickets_tramite_id_fkey` FOREIGN KEY (`tramite_id`) REFERENCES `tramites`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tickets` ADD CONSTRAINT `tickets_asignado_a_fkey` FOREIGN KEY (`asignado_a`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditoria` ADD CONSTRAINT `auditoria_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
