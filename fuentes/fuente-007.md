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
• LegacyLens: migración asistida de archivos COBOL a SQL: Es una herramienta que lee copybooks de COBOL y archivos de ancho fijo como los que usan bancos y entidades públicas, genera automáticamente el esquema SQL y el código Python para cargar los datos, y usa IA para documentar qué significa cada campo. Ataca un problema real de la industria: hay muchísimos datos atrapados en formatos antiguos que casi nadie sabe leer.
• MemTutor: sandbox que explica errores de memoria en C: Es una plataforma web donde los estudiantes suben programas en C, que se ejecutan en un contenedor aislado con AddressSanitizer y Valgrind. La IA traduce los reportes a una explicación clara en español, señala la línea culpable y muestra cómo se aprovecharía ese error en un ataque real (por ejemplo, un buffer overflow). A diferencia de un analizador estático, encuentra los errores ejecutando el código de verdad.
• StackRadar Chile: lo que piden las empresas frente a lo que enseña la universidad: Es un pipeline que extrae ofertas laborales de TI publicadas en Chile, usa NLP para identificar qué lenguajes y herramientas piden y las cruza con las mallas curriculares de universidades chilenas. El resultado es un dashboard que muestra brechas y tendencias, por ejemplo cuánto se pide TypeScript, Go o COBOL. Le sirve a estudiantes y escuelas para decidir qué aprender o qué enseñar.


Tecnologías: Assembly, Fortran, Algol, COBOL, BASIC, C, Pascal, Ada, C++, Python, Java / JVM / bytecode, Rust, Go, Kotlin, TypeScript, JavaScript ES6, Node.js, Swift, Compiladores, Unix, Programación orientada a objetos, Tipado estático, Seguridad de memoria
