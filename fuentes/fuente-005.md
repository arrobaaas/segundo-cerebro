---
id: fuente-005
titulo: Mejora iterativa de un clon de Minecraft con IA generativa (100 iteraciones)
tipo: fuente
fecha: '2026-11-11'
fuente_url: https://www.youtube.com/watch?v=GPJ6Y8ZDlUo
padres: []
categoria: ia
origen: video
---

Un creador hace un clon muy básico de Minecraft en Unity (vóxeles, mundo infinito procedural, poner y quitar bloques) y le pide a ChatGPT "mejóralo" 100 veces seguidas, casi sin darle contexto. Cada 10 iteraciones le suma una herramienta conectada por MCP (Model Context Protocol) a la plataforma Higgsfield: primero generación de imágenes (texturas, íconos), luego video (tutoriales dentro del juego) y al final modelos 3D, música y sonido. El agente va agregando sistemas por su cuenta: cuevas y minerales, inventario, crafteo, ciclo día/noche, mobs con IA simple que huyen de la luz, NPCs, agricultura, pesca, economía, clima y una interfaz más pulida. Hay errores típicos de agentes: ahorra recursos sin que se lo pidan, el reproductor de video sale mal hecho y aparecen bugs de física, como el jugador que no se puede hundir en el agua. Para tu carrera, el video muestra en la práctica el desarrollo asistido por agentes de IA, la integración de herramientas vía MCP, los pipelines de contenido generativo y los límites de iterar sin especificación, sin pruebas ni métricas de calidad. Ojo: el video es en parte un anuncio de Higgsfield.

Aprendizajes clave:
• MCP (Model Context Protocol) permite conectar un LLM a herramientas externas (generadores de imágenes, video, 3D, APIs) para que el agente las use él solo; conviene entender cómo se define un servidor MCP y qué permisos se le dan.
• Iterar con prompts vagos ('mejóralo') genera funcionalidades creativas pero desordenadas y bugs (física del agua, un reproductor de video deficiente). Sin pruebas automáticas ni criterios de aceptación no hay forma de detectar regresiones entre iteraciones.
• Los agentes toman decisiones implícitas que nadie les pidió (como ahorrar llamadas de generación de imágenes). Hay que fijar explícitamente el presupuesto, los objetivos y las restricciones, y revisar los registros de qué herramientas usó.
• La generación procedural (ruido para el terreno, cuevas, estructuras), el ciclo día/noche, las máquinas de estados para mobs/NPCs y los sistemas de inventario y crafteo son módulos separables que un buen diseño mantiene desacoplados para que el agente pueda modificarlos sin romper el resto.
• Los recursos generados por IA (texturas, íconos, video) aceleran el prototipado, pero exigen un pipeline de integración (formatos, resolución, consistencia de estilo) y control de versiones de los assets.

Ideas de proyecto que inspira:
• AgentForge: banco de pruebas de mejoras iterativas con IA: Una plataforma web que hace correr a un agente LLM en ciclos de 'mejora este proyecto' sobre un repositorio de código y en cada iteración mide la calidad: pruebas que pasan, cobertura, linters y hallazgos de seguridad (SAST). Así responde con datos lo que el video solo muestra de forma anecdótica: ¿la IA mejora o degrada el software con cada iteración? Combina IA, datos, web y ciberseguridad. MVP: Fase 1: un script en Python que toma un repositorio pequeño (por ejemplo, un juego en JavaScript/Canvas), llama a la API de un LLM para proponer un parche, lo aplica en una rama de Git, ejecuta pytest/jest + Bandit/Semgrep y guarda las métricas en PostgreSQL. Fase 2: un panel web (FastAPI + gráficos) con la evolución por iteración y el diff de cada commit. Fase 3: CI/CD con GitHub Actions, sandbox con Docker para ejecutar el código generado de forma segura y despliegue en la nube.
• Servidor MCP seguro para assets de juegos: Un servidor MCP propio que expone herramientas acotadas (generar textura, buscar asset, validar formato) a un agente de IA, con autenticación, límites de uso, registro de auditoría y filtros contra la inyección de prompts. Así ves en la práctica la integración que usa el video, pero con el foco en seguridad. MVP: Un servidor MCP en Python con 2-3 herramientas: generar una imagen con una API abierta o con Stable Diffusion local, redimensionarla a una textura de 16x16/64x64 y guardarla versionada. Un registro de cada llamada en SQL, una API key por cliente y un límite de llamadas. Pruebas unitarias y un pipeline de CI.
• VoxelWeb con NPCs inteligentes: Un clon de Minecraft que corre en el navegador (Three.js) con generación procedural y NPCs cuyos diálogos y misiones genera un LLM a partir del estado del mundo, con telemetría de jugadores para analizar el comportamiento. MVP: Fase 1: un mundo de vóxeles con chunks, ruido Perlin para el terreno y poner/quitar bloques en Three.js. Fase 2: un backend en FastAPI que guarda los mundos y genera diálogos de NPCs vía LLM con un contexto limitado. Fase 3: eventos de juego enviados a una base de datos y un panel de análisis, desplegado en la nube con CI/CD.

Tecnologías: Unity, ChatGPT, Agentes de IA, MCP (Model Context Protocol), Higgsfield, Generación de imágenes con IA, Generación de video con IA, Generación de modelos 3D, Generación procedural, Motor de vóxeles, Ciclo día/noche, IA de NPCs y mobs, Sistemas de inventario y crafteo
