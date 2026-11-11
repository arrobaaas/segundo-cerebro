---
id: idea-012
titulo: 'MiniRules: un lenguaje de reglas para alertas de datos'
tipo: idea
fecha: '2026-11-11'
fuente_url: null
padres:
- fuente-006
---

Un pequeño lenguaje propio (un DSL) para escribir reglas como 'si ventas_dia < promedio_7d * 0.5 entonces alertar', con su propio compilador o intérprete. Se ejecuta sobre datos SQL desde una aplicación web. Lleva la experiencia de construir un compilador a un caso de uso real de datos.

MVP: Fase 1: un lexer y un parser (con Lark o escritos a mano) que conviertan las reglas en un AST y las evalúen sobre un CSV, con buena cobertura de pruebas. Fase 2: traducir las reglas a consultas SQL y ejecutarlas de forma programada. Fase 3: un editor web con validación de sintaxis, un historial de alertas, autenticación y despliegue en la nube.

Nació de la fuente: Qué se aprende en 5 años de Ingeniería Informática y cómo sacarle partido
