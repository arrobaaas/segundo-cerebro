---
id: fuente-007
titulo: 'Historia de los lenguajes de programación: de Assembly a Python'
tipo: fuente
fecha: '2026-11-11'
fuente_url: https://www.youtube.com/watch?v=IAZP3_FkfIk
padres: []
categoria: otros
origen: video
---

El video recorre la evolución de los lenguajes de programación y muestra cómo cada uno nació para resolver un problema concreto. Parte de Assembly y del código máquina, pasa por los primeros lenguajes de alto nivel con compilador (Fortran, Algol, COBOL, BASIC), sigue con C y Pascal, Ada y C++, y llega a Python, Java y su máquina virtual, Rust, Go, Kotlin, TypeScript, Node.js/ES6 y Swift. También cuenta los juicios de Java (Sun contra Microsoft y Oracle contra Google), que terminaron en el fallo de 2021 que reconoció como uso legítimo la reimplementación de APIs. Para tu carrera sirve para entender conceptos que aparecen en entrevistas técnicas y en el trabajo diario: compilación frente a interpretación, bytecode y portabilidad, tipado estático y dinámico, seguridad de memoria, y por qué en bancos y gobiernos sigue habiendo código antiguo (COBOL, Fortran) que alguien tiene que mantener o migrar. Además, sugiere proyectos de compiladores, análisis de código y modernización de sistemas antiguos, que combinan IA, datos, web y ciberseguridad.

Aprendizajes clave:
• Un compilador traduce código de alto nivel a instrucciones de máquina. Fortran (John Backus, IBM, 1957) demostró que una línea de alto nivel podía reemplazar decenas de instrucciones de Assembly sin perder rendimiento, y por eso se usa en ciencia desde hace décadas.
• C (Dennis Ritchie, 1972) nació para que Unix funcionara en distintas computadoras: al separar el código del hardware permitió portarlo de una máquina a otra. Java llevó esa idea más lejos con el bytecode y la JVM ('escríbelo una vez, ejecútalo en cualquier parte').
• La seguridad de memoria es un problema central en ciberseguridad: C y C++ dan control total, pero eso facilita errores graves (desbordamientos de búfer, uso de memoria ya liberada). Rust se creó para evitarlos sin perder rendimiento, y Ada para sistemas críticos con tipado fuerte y chequeos en tiempo de ejecución.
• El tipado estático escala mejor en proyectos grandes. TypeScript (2012) agregó tipos a JavaScript para que las bases de código grandes no se desmoronen, y ES6 (2015) trajo let/const, funciones flecha, clases y módulos. Con Node.js (2009), JavaScript pasó también al backend.
• El código antiguo sigue en producción ('si funciona, no lo toques'). COBOL todavía corre en bancos y gobiernos, y migrarlo o mantenerlo es un nicho con demanda. Además, el caso Oracle contra Google (2021) dejó un precedente: reimplementar una API puede considerarse uso legítimo.

Ideas de proyecto que inspira (cada una es una estrella propia):
• LegacyLens: analizador y migrador asistido por IA de COBOL a Python: Plataforma web que recibe programas COBOL, los analiza (estructura, variables, flujo de control y dependencias de datos) y usa un LLM para explicarlos y proponer una traducción a Python con pruebas que verifican que el resultado sea el mismo. Ataca un problema real de bancos y gobiernos: código antiguo que pocos entienden.
• MemGuard: escáner de vulnerabilidades de memoria en C con explicación por IA: Herramienta que analiza repositorios en C/C++, detecta patrones inseguros (strcpy, gets, desbordamientos de búfer, uso de memoria ya liberada) combinando análisis estático propio con herramientas existentes, y usa IA para explicar cada hallazgo y sugerir una corrección o su equivalente seguro en Rust. Combina ciberseguridad, IA y web.
• MiniLang Playground: un compilador propio a bytecode con entorno web seguro: Un lenguaje educativo pequeño (al estilo de BASIC o Pascal) con lexer, parser, compilador a bytecode y una máquina virtual propia, ejecutable desde un playground web que muestra los tokens, el árbol sintáctico y el bytecode paso a paso. Enseña de primera mano los conceptos del video (compilación, bytecode, VM) y obliga a resolver la seguridad de ejecutar código ajeno.

Tecnologías: Assembly, Fortran, Algol, COBOL, BASIC, C, Pascal, Ada, C++, Python, Java / JVM / bytecode, Rust, Go, Kotlin, TypeScript, JavaScript ES6, Node.js, Swift, Compiladores, Unix, Programación orientada a objetos, Tipado estático, Seguridad de memoria
