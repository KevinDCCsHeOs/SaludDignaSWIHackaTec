# Datos Demo y Escenario de Prueba

> Issue: **17. [CORE] Catálogos y datos demo** (#17)
>
> **Aviso:** todos los registros son **100% ficticios** (`esDemo: true`), con correos bajo `@demo.saluddigna.local`, teléfonos inventados y precios/direcciones aproximadas. Nunca se utilizan datos de personas reales.

## 1. Cómo sembrar o reiniciar el entorno

Requisitos: MySQL 8 activo (local con `docker compose -f infra/docker-compose.dev.yml up -d` o en VPS) y `DATABASE_URL` configurada en `apps/api/.env`.

```bash
# Sembrado idempotente (puede ejecutarse múltiples veces sin duplicar registros)
npm run seed

# Reinicio rápido del escenario demo (borra registros esDemo=true y vuelve a sembrar)
npm run demo:reset
```

## 2. Resumen del conjunto sembrado

- **7 roles RBAC** con matriz de permisos cargada en `roles`.
- **11 usuarios demo**: los 7 roles del sistema + 5 médicos ficticios distribuidos en 3 regiones.
- **30 estudios** (`laboratorio`, `ultrasonido`, `rayos_x`, `mastografia`, `papanicolaou`, `electrocardiograma`, `densitometria`, `tomografia`, `resonancia`, `optometria`, `nutricion`) con precio aproximado, duración, vigencia y preparación.
- **10 clínicas en 3 regiones**: Puebla (`3`), CDMX (`4`) y Monterrey (`3`), incluyendo 2 clínicas con estatus `retraso` para demostrar banners de incidencias (#31).
- **15 pacientes ficticios**, incluyendo perfiles en español (`es`), inglés (`en`) y náhuatl (`nah`), todos con CURP y fecha de nacimiento cifrados en reposo con AES-256-GCM.

## 3. Credenciales de prueba

| Rol | Correo | Contraseña | Región | Notas |
| --- | --- | --- | --- | --- |
| `paciente` | `ana.lopez@demo.saluddigna.local` | `DemoPaciente2026!` | Puebla | Paciente estrella (`pac_ana_demo`, tel `+522221234567`) |
| `asesor_ia` | `ia.bot@demo.saluddigna.local` | `DemoIaSistema2026!` | — | Bot WhatsApp / IA |
| `asesor` | `asesor.puebla@demo.saluddigna.local` | `DemoAsesor2026!` | Puebla | Contact Center nivel 1 |
| `asesor_pro` | `asesor.pro@demo.saluddigna.local` | `DemoAsesorPro2026!` | Puebla | Tickets escalados y merge |
| `medico` | `medico.puebla@demo.saluddigna.local` | `DemoMedico2026!` | Puebla | Validación médica (hay 4 médicos adicionales en Puebla, CDMX y Monterrey) |
| `revisor_tecnico` | `revisor.lab@demo.saluddigna.local` | `DemoRevisor2026!` | Puebla | Revisión técnica |
| `admin` | `admin@demo.saluddigna.local` | `DemoAdmin2026!` | — | Auditoría, Patient Journey y KPIs |

## 4. Escenario estrella: recorrido de Ana López

1. **Web:** Ana (`pac_ana_demo`) inicia cotización del estudio `est_us_abd` (*Ultrasonido abdominal*, \$450) y elige la clínica `cli_09` (*Salud Digna Puebla Centro*), dejando `pendientes: ["confirmar_fecha", "aceptar_preparacion"]`. Cierra sin confirmar.
2. **WhatsApp:** escribe desde `+52 1 222 123 4567` → `POST /identidad/resolver` devuelve `requiere_verificacion` → verifica con OTP → consulta `GET /pacientes/pac_ana_demo/contexto` (obtiene el resumen automático sin repetir datos) → agenda cita (`POST /tramites/:id/avanzar` → `cita_agendada`).
3. **Call Center:** Ana llama con duda de preparación; el asesor verifica preguntas (`1995-04-12` + `4567`), ve el timeline completo (`GET /pacientes/pac_ana_demo/timeline`), atiende su ticket y confirma la cita (`cita_confirmada`).
4. **App y tiempo real:** la consola y la app reciben los eventos por Socket.IO en < 2 s y muestran la cita confirmada con trazabilidad completa Web → WhatsApp → Call Center → App.
