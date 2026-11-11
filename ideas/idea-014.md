---
id: idea-014
titulo: 'MemTutor: sandbox que explica errores de memoria en C'
tipo: idea
fecha: '2026-11-11'
fuente_url: null
padres:
- fuente-007
categoria: ciberseguridad
---

Es una plataforma web donde los estudiantes suben programas en C, que se ejecutan en un contenedor aislado con AddressSanitizer y Valgrind. La IA traduce los reportes a una explicación clara en español, señala la línea culpable y muestra cómo se aprovecharía ese error en un ataque real (por ejemplo, un buffer overflow). A diferencia de un analizador estático, encuentra los errores ejecutando el código de verdad.

MVP: Fase 1: una API que compile y ejecute C en Docker con límites de CPU, memoria y red, y devuelva el reporte de ASan. Fase 2: una explicación con LLM y un catálogo de cinco errores clásicos con ejemplos. Fase 3: un frontend con editor y un historial por usuario, más pruebas de seguridad del propio sandbox para evitar que alguien escape del contenedor.

Tecnologías: Docker, GCC con AddressSanitizer, Python (FastAPI), JavaScript con Monaco Editor, API de un LLM, Cloud Run

Nació de la fuente: Historia de los lenguajes de programación: de Assembly a Python
