# Glosario Médico en Lenguaje Sencillo — Salud Digna Omnicanal

Guía de referencia del modo **"Explícame fácil"** (Issue #26) utilizada por el asistente virtual (`apps/api/src/ia/glosario.ts`), el portal web y WhatsApp para explicar términos médicos y preparaciones sin tecnicismos.

> [!NOTE]
> Este glosario tiene fines exclusivamente informativos y de preparación previa a estudios. **Nunca sustituye una consulta médica, un diagnóstico ni una receta.**

## Términos de preparación frecuentes

| Término | Explicación sencilla (ES) | Plain-language explanation (EN) |
| --- | --- | --- |
| **Ayuno** | No comer alimentos ni tomar café, leche, jugos o refrescos durante las horas indicadas. Sí puedes tomar pequeños sorbos de agua simple salvo indicación contraria. | Do not eat food or drink coffee, milk, juice, or soda for the indicated hours. Small sips of plain water are usually fine unless told otherwise. |
| **Vejiga llena / Retener orina** | Tomar agua simple 1 hora antes del ultrasonido y aguantar las ganas de ir al baño hasta terminar. El líquido ayuda a que la imagen se vea clara. | Drink plain water 1 hour before the ultrasound and wait to use the restroom until the scan finishes so the image is clear. |
| **Frasco estéril** | Recipiente limpio y sellado (de farmacia o clínica) que solo se abre al momento de juntar la muestra para evitar contaminación. | A clean sealed cup from a pharmacy or clinic opened right before collecting the sample. |
| **Sin metales** | Acudir sin aretes, collares, relojes, cinturones o cierres metálicos para evitar interferencia con rayos X o imanes de resonancia. | Wear clothes without jewelry, watches, belts, or metal zippers so they do not interfere with X-rays or MRI magnets. |

## Estudios comunes explicados fácil

| Estudio | ¿Qué es en palabras sencillas? | Preparación en pasos fáciles |
| --- | --- | --- |
| **Ultrasonido abdominal** | Estudio sin dolor que usa ondas de sonido (no radiación) para ver órganos del abdomen como hígado, vesícula y riñones. | 6 horas sin comer; 1 hora antes toma 2 vasos de agua simple (500 ml) y no vayas al baño hasta terminar. |
| **Ultrasonido pélvico** | Estudio con ondas de sonido para revisar la zona pélvica sin dolor. | Toma 1 litro de agua simple 1 hora antes y aguanta las ganas de orinar. |
| **Biometría hemática completa (BH)** | Análisis de sangre común que cuenta glóbulos rojos (energía/anemia), glóbulos blancos (defensas) y plaquetas (coagulación). | 8 horas sin comer; se permite agua simple. |
| **Química sanguínea (6 / 27 elementos)** | Análisis de sangre para revisar glucosa (azúcar), grasas y funcionamiento renal/hepático. | 8 a 12 horas sin comer y evitar alcohol el día anterior. |
| **Hemoglobina glucosilada (HbA1c)** | Muestra el promedio de azúcar en tu sangre durante los últimos 3 meses. | No requiere ayuno estricto. |
| **Perfil de lípidos** | Mide grasas en sangre (colesterol bueno, malo y triglicéridos) para cuidar el corazón. | Cena ligera la noche anterior y 12 horas sin comer. |
| **Perfil tiroideo** | Revisa hormonas de la glándula tiroides (energía, peso y temperatura). | 8 horas sin comer; acudir antes de tomar levotiroxina si aplica. |
| **Examen general de orina (EGO)** | Analiza una muestra de orina para buscar infecciones o revisar riñones. | Junta la primera orina de la mañana en un frasco limpio nuevo. |
| **Antígeno prostático específico (PSA)** | Análisis de sangre preventivo para revisión de la próstata. | 2 días sin relaciones sexuales ni bicicleta antes de la toma. |
| **Mastografía digital** | Radiografía preventiva del pecho que dura pocos minutos. | Acudir recién bañada, sin desodorante, talco ni crema en pecho o axilas. |
| **Papanicolaou** | Estudio preventivo rápido para revisar células del cuello de la matriz. | Programar sin menstruación y sin duchas vaginales ni relaciones 48 h antes. |
| **Electrocardiograma (ECG)** | Registra el ritmo eléctrico del corazón con parches suaves; no duele ni da toques. | Sin café ni fumar 2 horas antes; sin crema en pecho o tobillos. |
| **Densitometría ósea** | Mide la fortaleza de tus huesos (cadera y columna) para prevenir osteoporosis. | Sin suplementos de calcio 24 horas antes y ropa sin metales. |
| **Tomografía (TAC)** | Radiografías detalladas del interior del cuerpo tomadas en pocos minutos. | Retirar objetos metálicos; si es de abdomen, 6 horas sin comer. |
| **Resonancia magnética (RMN)** | Imágenes detalladas usando imanes (sin radiación). | Sin ningún objeto metálico y avisar siempre si tienes marcapasos o implantes. |
| **Valoración nutricional (bioimpedancia)** | Báscula especial que estima peso, músculo, grasa y agua sin dolor. | Evitar comidas pesadas 3 horas antes y llevar ropa ligera. |

## Soporte base en náhuatl (extra #26)

El bot de WhatsApp y el asistente IA reconocen saludos y palabras clave en náhuatl (`niltze`, `pialli`, `cualli tonalli`, `tlazohcamati`) y responden con mensajes base en náhuatl (incluyendo aclaraciones en español para términos operativos y emergencias `911`). Los textos se mantienen en [`apps/whatsapp-bot/src/i18n/nah.json`](../apps/whatsapp-bot/src/i18n/nah.json) para facilitar revisión con un hablante nativo.
