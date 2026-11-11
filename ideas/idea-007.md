---
id: idea-007
titulo: 'AgentForge: banco de pruebas de mejoras iterativas con IA'
tipo: idea
fecha: '2026-11-11'
fuente_url: null
padres:
- fuente-005
---

Una plataforma web que hace correr a un agente LLM en ciclos de 'mejora este proyecto' sobre un repositorio de código y en cada iteración mide la calidad: pruebas que pasan, cobertura, linters y hallazgos de seguridad (SAST). Así responde con datos lo que el video solo muestra de forma anecdótica: ¿la IA mejora o degrada el software con cada iteración? Combina IA, datos, web y ciberseguridad.

MVP: Fase 1: un script en Python que toma un repositorio pequeño (por ejemplo, un juego en JavaScript/Canvas), llama a la API de un LLM para proponer un parche, lo aplica en una rama de Git, ejecuta pytest/jest + Bandit/Semgrep y guarda las métricas en PostgreSQL. Fase 2: un panel web (FastAPI + gráficos) con la evolución por iteración y el diff de cada commit. Fase 3: CI/CD con GitHub Actions, sandbox con Docker para ejecutar el código generado de forma segura y despliegue en la nube.

Nació de la fuente: Mejora iterativa de un clon de Minecraft con IA generativa (100 iteraciones)
