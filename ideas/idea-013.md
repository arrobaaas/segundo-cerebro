---
id: idea-013
titulo: 'LegacyLens: migración asistida de archivos COBOL a SQL'
tipo: idea
fecha: '2026-11-11'
fuente_url: null
padres:
- fuente-007
categoria: datos
---

Es una herramienta que lee copybooks de COBOL y archivos de ancho fijo como los que usan bancos y entidades públicas, genera automáticamente el esquema SQL y el código Python para cargar los datos, y usa IA para documentar qué significa cada campo. Ataca un problema real de la industria: hay muchísimos datos atrapados en formatos antiguos que casi nadie sabe leer.

MVP: Fase 1: un parser de copybooks (PIC X, PIC 9, COMP-3) que genere un esquema PostgreSQL y cargue un archivo de ejemplo. Fase 2: pruebas de equivalencia que comparen los totales y registros originales con los migrados. Fase 3: una interfaz web para subir archivos y ver la documentación generada por un LLM. Cada fase se integra con CI en GitHub Actions y se despliega en la nube.

Tecnologías: Python, PostgreSQL, FastAPI, pytest, API de un LLM, GitHub Actions

Nació de la fuente: Historia de los lenguajes de programación: de Assembly a Python
