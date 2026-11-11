---
id: idea-009
titulo: VoxelWeb con NPCs inteligentes
tipo: idea
fecha: '2026-11-11'
fuente_url: null
padres:
- fuente-005
---

Un clon de Minecraft que corre en el navegador (Three.js) con generación procedural y NPCs cuyos diálogos y misiones genera un LLM a partir del estado del mundo, con telemetría de jugadores para analizar el comportamiento.

MVP: Fase 1: un mundo de vóxeles con chunks, ruido Perlin para el terreno y poner/quitar bloques en Three.js. Fase 2: un backend en FastAPI que guarda los mundos y genera diálogos de NPCs vía LLM con un contexto limitado. Fase 3: eventos de juego enviados a una base de datos y un panel de análisis, desplegado en la nube con CI/CD.

Nació de la fuente: Mejora iterativa de un clon de Minecraft con IA generativa (100 iteraciones)
