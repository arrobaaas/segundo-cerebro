---
id: idea-008
titulo: Servidor MCP seguro para assets de juegos
tipo: idea
fecha: '2026-11-11'
fuente_url: null
padres:
- fuente-005
---

Un servidor MCP propio que expone herramientas acotadas (generar textura, buscar asset, validar formato) a un agente de IA, con autenticación, límites de uso, registro de auditoría y filtros contra la inyección de prompts. Así ves en la práctica la integración que usa el video, pero con el foco en seguridad.

MVP: Un servidor MCP en Python con 2-3 herramientas: generar una imagen con una API abierta o con Stable Diffusion local, redimensionarla a una textura de 16x16/64x64 y guardarla versionada. Un registro de cada llamada en SQL, una API key por cliente y un límite de llamadas. Pruebas unitarias y un pipeline de CI.

Nació de la fuente: Mejora iterativa de un clon de Minecraft con IA generativa (100 iteraciones)
