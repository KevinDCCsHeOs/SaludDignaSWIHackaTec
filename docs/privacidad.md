# Privacidad y Protección de Datos (LFPDPPP)

> Issue: **10. [SEC] Privacidad y protección de datos (LFPDPPP)** (#10) · Versión de aviso vigente: `v1.0-2026`
>
> **Alcance:** propuesta técnica y documental para el prototipo académico (datos 100% ficticios con `esDemo: true`). No sustituye una auditoría legal formal.

## 1. Marco de cumplimiento (LFPDPPP)

En la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), los datos relacionados con el estado de salud y resultados clínicos son **datos personales sensibles**, lo que exige:

1. **Consentimiento expreso** registrado con fecha, versión de aviso y canal (`tabla consentimientos`).
2. **Medidas de seguridad administrativas, técnicas y físicas reforzadas**: cifrado en reposo (AES-256-GCM), TLS en tránsito, verificación de identidad previa (OTP / preguntas de seguridad) y control de acceso por rol (RBAC).
3. **Minimización de datos**: ningún canal ni rol recibe campos innecesarios; los logs nunca almacenan datos personales ni contenido de mensajes.
4. **Atención de derechos ARCO**: mecanismos definidos para Acceso, Rectificación, Cancelación y Oposición.

## 2. Aviso de privacidad para el demo (`v1.0-2026`)

Disponible en vivo vía `GET /privacidad/aviso`.

### 2.1 Aviso simplificado (primer contacto Web / App / WhatsApp)

> *"Utilizamos tus datos de contacto y del trámite únicamente para dar continuidad a tu atención entre Web, App, WhatsApp y Call Center, validar tu identidad con códigos de un solo uso y resguardar tus resultados clínicos bajo cifrado. Puedes ejercer tus derechos ARCO o revocar tu consentimiento en cualquier momento."*

- En **WhatsApp**, el primer contacto muestra el aviso simplificado con el botón **`Acepto el aviso de privacidad`** antes de vincular o almacenar datos del trámite, registrando `POST /privacidad/consentimientos` y emitiendo el evento `consentimiento.otorgado`.

### 2.2 Aviso integral (resumen estructurado)

- **Responsable:** Prototipo Académico Salud Digna Omnicanal (InnovaTecNM 2026 — únicamente registros demo ficticios).
- **Datos tratados:**
  - *Identificación y contacto:* nombre, apellidos, teléfono E.164, correo electrónico, región e idioma preferido.
  - *Sensibles (cifrados en reposo):* CURP, fecha de nacimiento, datos fiscales (RFC, régimen, CP) y resultados clínicos / URL de PDF.
- **Finalidades primarias:** reconocimiento de identidad entre canales, persistencia de avance de trámites, agendamiento y confirmación de citas, atención de tickets en Contact Center y liberación controlada de resultados.
- **Uso de IA (minimización):** el proveedor de LLM (ADR 0009) recibe únicamente un resumen operativo sin teléfono, correo, CURP ni fecha de nacimiento.
- **Conservación y auditoría:** las lecturas y escrituras sobre expedientes se registran en la bitácora inmutable `auditoria` sin almacenar PII en los metadatos.

## 3. Controles técnicos implementados

| Control | Implementación en código | Qué garantiza |
| --- | --- | --- |
| Cifrado en reposo **AES-256-GCM** | `apps/api/src/privacidad/cifrado.service.ts` + extensión Prisma en `apps/api/src/common/prisma/prisma.service.ts` | IV aleatorio de 12 bytes + AuthTag de 16 bytes; llave en `ENCRYPTION_KEY` (entorno, nunca en el repo). |
| Búsqueda sin descifrar (`curp_hash`) | `CifradoService.hashCurp()` (`HMAC-SHA256` + `CURP_HASH_PEPPER`) | Permite `WHERE curp_hash = ?` en MySQL sin exponer la CURP en texto plano (ADR 0002). |
| Enmascarado y minimización por rol | `mask()` y `proyectarPacientePorRol()` en `apps/api/src/privacidad/enmascarado.ts` | Asesor ve `CURP: ****1234`, teléfono `******4567`, correo `a***@dominio`; `asesor_ia` no recibe identificadores directos. |
| Sanitización de logs | `sanitizarTextoParaLog()`, `sanitizarObjetoParaLog()` y `SanitizedLogger` en `apps/api/src/privacidad/sanitizador-logs.ts` | Elimina teléfonos, correos, CURPs, contraseñas, tokens, OTP y contenido de mensajes antes de imprimir cualquier log. |
| Registro de consentimiento | `ConsentimientoService` (`POST /privacidad/consentimientos`) | Guarda `pacienteId`, `tipo`, `versionAviso`, `canal`, `otorgadoEn` e `ip`, y emite `consentimiento.otorgado`. |
| Transporte seguro (TLS) | Nginx con HTTPS/WSS + HSTS (#35) | Todo tráfico entre canales, webhook de Meta y API viaja cifrado. |

### Campos cifrados en reposo

1. `pacientes.fecha_nac_cifrada`
2. `pacientes.curp_cifrado` (con índice de búsqueda en `pacientes.curp_hash`)
3. `pacientes.datos_fiscales_cifrados`
4. `resultados.contenido_cifrado`
5. `resultados.archivo_url_cifrada`

## 4. Procedimiento de atención de Derechos ARCO

| Derecho | Cómo lo solicita el paciente | Cómo responde la plataforma |
| --- | --- | --- |
| **Acceso** | Portal web, app o Call Center (previa verificación OTP o preguntas de seguridad). | Entrega un resumen de sus datos, consentimientos otorgados y línea de tiempo (`GET /pacientes/:id/timeline`), dejando registro en `auditoria`. |
| **Rectificación** | Solicitud directa en perfil o ticket `informacion_incorrecta` en Contact Center. | Actualiza el dato normalizado/cifrado tras validar identidad, recalcula `curp_hash` si aplica y emite evento auditable. |
| **Cancelación** | Solicitud de baja/anonimización en portal o con `asesor_pro` / `admin`. | Revoca consentimientos (`revocado_en`), elimina/anonimiza campos personales y bloquea cuentas activas **sin borrar** registros históricos de `auditoria` (conservando trazabilidad sin PII). |
| **Oposición** | Preferencias de privacidad o comando en WhatsApp/App. | Marca `revocado_en` sobre consentimientos de `notificaciones` o usos secundarios, deteniendo envíos promocionales/preventivos de inmediato. |
