# Documentación

| Documento | Contenido | Issue |
| --- | --- | --- |
| [Arquitectura de la solución](arquitectura/README.md) | Vistas C4 (contexto, contenedores, módulos), comunicación, pilares, recorrido de Ana, despliegue, seguridad, riesgos | #1 |
| [Decisiones de arquitectura (ADR)](arquitectura/adr/README.md) | Por qué se eligió cada tecnología y qué alternativas se descartaron | #1 |
| [Diagramas](arquitectura/diagramas/) | Fuentes Mermaid (`.mmd`) y exportaciones SVG/PNG | #1 |
| [Modelo de datos](modelo-datos/README.md) | Diagrama ER, esquema Prisma, migración inicial MySQL 8 y campos sensibles | #2 |
| [Catálogo de eventos](eventos.md) | Eventos omnicanal (Zod), payloads de ejemplo, emisores, consumidores y versionado | #3 |
| [Privacidad (LFPDPPP)](privacidad.md) | Aviso simplificado e integral, consentimiento, cifrado AES-256-GCM, enmascarado y derechos ARCO | #10 |
| [RBAC y credenciales demo](rbac-y-credenciales.md) | Matriz de permisos por rol y usuarios ficticios de prueba | #6 |
| [Datos demo y escenario](datos-demo.md) | 30 estudios, 10 clínicas, 15 pacientes ficticios y comandos `seed` / `demo:reset` | #17 |
| [Glosario médico en lenguaje sencillo](glosario.md) | Modo "Explícame fácil", preparaciones sencillas (ES/EN) y soporte base en náhuatl | #26 |
| [Normatividad y riesgos](normatividad-riesgos.md) | Mapeo NOM-024-SSA3, NOM-004-SSA3, LFPDPPP, ISO 27001/9001, trazabilidad y matriz de riesgos | #34 |
| [Operación, respaldos y monitoreo](operacion-respaldos.md) | Cron diario MySQL (7d/4s), simulacro de restauración, Uptime Kuma y logs estructurados | #36 |
| [Escalabilidad y pruebas de carga](escalabilidad-y-carga.md) | Caché Redis, escenarios k6 (200 VU / 100 rps / 300 sockets), resultados y escalado horizontal | #37 |
| [Accesibilidad y rendimiento web](accesibilidad-rendimiento.md) | Estándares WCAG 2.1 AA, Lighthouse CI y protocolo con lector de pantalla | #38 |
| [Checklist pre-demo e imprimible](checklist-demo.md) | Verificación previa, guion de 4 canales y plan B para el día del demo | #39 |
| Secuencias y flujo de datos | Diagramas de secuencia detallados entre canales | #41 (pendiente) |

## Cómo editar los diagramas

Las fuentes están en `arquitectura/diagramas/*.mmd`. GitHub muestra los SVG exportados; para regenerarlos después de editar una fuente:

```bash
npx -p @mermaid-js/mermaid-cli mmdc -i docs/arquitectura/diagramas/02-contenedores.mmd -o docs/arquitectura/diagramas/02-contenedores.svg -b white
npx -p @mermaid-js/mermaid-cli mmdc -i docs/arquitectura/diagramas/02-contenedores.mmd -o docs/arquitectura/diagramas/02-contenedores.png -b white -s 2
```

También puedes pegar el contenido del `.mmd` en <https://mermaid.live> para editarlo visualmente.
