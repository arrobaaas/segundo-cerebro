---
id: idea-015
titulo: 'StackRadar Chile: lo que piden las empresas frente a lo que enseña la universidad'
tipo: idea
fecha: '2026-11-11'
fuente_url: null
padres:
- fuente-007
categoria: datos
---

Es un pipeline que extrae ofertas laborales de TI publicadas en Chile, usa NLP para identificar qué lenguajes y herramientas piden y las cruza con las mallas curriculares de universidades chilenas. El resultado es un dashboard que muestra brechas y tendencias, por ejemplo cuánto se pide TypeScript, Go o COBOL. Le sirve a estudiantes y escuelas para decidir qué aprender o qué enseñar.

MVP: Fase 1: un scraper de dos portales de empleo que guarde las ofertas en una base de datos. Fase 2: extracción de tecnologías con un diccionario más un LLM, con pruebas sobre un conjunto etiquetado a mano. Fase 3: un dashboard web público con series de tiempo y una comparación con dos mallas curriculares, actualizado a diario con un job programado.

Tecnologías: Python, Playwright, PostgreSQL, spaCy o API de un LLM, Streamlit, GitHub Actions (cron)

Nació de la fuente: Historia de los lenguajes de programación: de Assembly a Python
