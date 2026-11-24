# Documentación

| Documento | Contenido | Issue |
| --- | --- | --- |
| [Arquitectura de la solución](arquitectura/README.md) | Vistas C4 (contexto, contenedores, módulos), comunicación, pilares, recorrido de Ana, despliegue, seguridad, riesgos | #1 |
| [Decisiones de arquitectura (ADR)](arquitectura/adr/README.md) | Por qué se eligió cada tecnología y qué alternativas se descartaron | #1 |
| [Diagramas](arquitectura/diagramas/) | Fuentes Mermaid (`.mmd`) y exportaciones SVG/PNG | #1 |
| [Modelo de datos](modelo-datos/README.md) | Diagrama ER, esquema Prisma, migración inicial MySQL 8 y campos sensibles | #2 |
| Catálogo de eventos | Eventos, payloads, emisores y consumidores | #3 (pendiente) |
| Privacidad | Aviso, consentimiento, cifrado y derechos ARCO | #10 (pendiente) |
| Normatividad y riesgos | NOM, ISO y matriz de riesgos | #34 (pendiente) |
| Secuencias y flujo de datos | Diagramas de secuencia detallados entre canales | #41 (pendiente) |

## Cómo editar los diagramas

Las fuentes están en `arquitectura/diagramas/*.mmd`. GitHub muestra los SVG exportados; para regenerarlos después de editar una fuente:

```bash
npx -p @mermaid-js/mermaid-cli mmdc -i docs/arquitectura/diagramas/02-contenedores.mmd -o docs/arquitectura/diagramas/02-contenedores.svg -b white
npx -p @mermaid-js/mermaid-cli mmdc -i docs/arquitectura/diagramas/02-contenedores.mmd -o docs/arquitectura/diagramas/02-contenedores.png -b white -s 2
```

También puedes pegar el contenido del `.mmd` en <https://mermaid.live> para editarlo visualmente.
