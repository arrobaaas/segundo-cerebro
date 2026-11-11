---
id: idea-010
titulo: 'SecLint: analizador estático de vulnerabilidades con IA'
tipo: idea
fecha: '2026-11-11'
fuente_url: null
padres:
- fuente-006
---

Una herramienta web que analiza código Python o JavaScript para detectar patrones inseguros, como inyección SQL, secretos en el código o uso de eval. Usa técnicas de compiladores (tokens y AST), y un LLM explica cada hallazgo y propone cómo corregirlo. Combina ciberseguridad, IA y desarrollo web.

MVP: Fase 1: una herramienta de línea de comandos en Python que recorre el AST con el módulo ast y detecta 5 reglas de seguridad, con pruebas en pytest y GitHub Actions. Fase 2: una API en FastAPI con un frontend donde pegas o subes código y ves los hallazgos. Fase 3: explicaciones con un LLM y una GitHub Action que comente los PR, desplegada en la nube.

Nació de la fuente: Qué se aprende en 5 años de Ingeniería Informática y cómo sacarle partido
