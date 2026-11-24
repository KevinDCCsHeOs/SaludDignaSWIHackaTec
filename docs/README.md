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
| Normatividad y riesgos | NOM, ISO y matriz de riesgos | #34 (pendiente) |
| Secuencias y flujo de datos | Diagramas de secuencia detallados entre canales | #41 (pendiente) |

## Cómo editar los diagramas

Las fuentes están en `arquitectura/diagramas/*.mmd`. GitHub muestra los SVG exportados; para regenerarlos después de editar una fuente:

```bash
npx -p @mermaid-js/mermaid-cli mmdc -i docs/arquitectura/diagramas/02-contenedores.mmd -o docs/arquitectura/diagramas/02-contenedores.svg -b white
npx -p @mermaid-js/mermaid-cli mmdc -i docs/arquitectura/diagramas/02-contenedores.mmd -o docs/arquitectura/diagramas/02-contenedores.png -b white -s 2
```

También puedes pegar el contenido del `.mmd` en <https://mermaid.live> para editarlo visualmente.
