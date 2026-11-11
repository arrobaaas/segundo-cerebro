---
id: fuente-006
titulo: Qué se aprende en 5 años de Ingeniería Informática y cómo sacarle partido
tipo: fuente
fecha: '2026-11-11'
fuente_url: https://www.youtube.com/watch?v=U2cwkkKdjuE&t=45s
padres: []
categoria: carrera
origen: video
---

Ezequiel, un estudiante de último año, recorre la carrera de Ingeniería Informática año por año. Primero vienen las bases de matemática, lógica, sistema binario y programación en C. Después llegan punteros, C++, Java y circuitos, y luego bases de datos, servidores y sistemas operativos. En cuarto y quinto año dominan la gestión de proyectos, la calidad de software y el testing, junto con redes, patrones de diseño y compiladores. Su mensaje central es que la carrera no te enseña frameworks, sino los fundamentos que después te permiten aprender cualquier tecnología mucho más rápido. Para ti, que estás en 4.º año, la idea útil es convertir esos fundamentos (redes, sistemas operativos, compiladores, patrones) en proyectos de portafolio. Ojo con una crítica del video: él dice que el testing y la calidad de software no sirven en el trabajo, pero no es así. En la industria las pruebas automatizadas, el CI/CD y la revisión de calidad son prácticas diarias y suelen salir en las entrevistas de práctica.

Aprendizajes clave:
• La diferencia entre Ingeniería en Informática (más técnica: algoritmos, IA, teoría de la computación) e Ingeniería en Sistemas (gestión, análisis de sistemas, integración empresarial) depende del plan de estudios de cada universidad. Te sirve para decidir hacia qué perfil orientar tu práctica.
• Los ramos de fundamentos (jerarquía de memoria RAM/SSD/HDD, sistemas operativos, redes, compiladores) son los que más se valoran a largo plazo. Si muestras que los aplicaste en un proyecto real, te diferencias de quien solo sabe usar frameworks.
• Contra lo que dice el video, el testing de caja blanca y caja negra sí se usa en la industria. Hoy se aplica como pruebas unitarias, de integración y end-to-end automatizadas dentro de pipelines de CI/CD, y conviene que lo practiques en tus proyectos.
• Los patrones de diseño y la construcción de un compilador (análisis léxico, sintáctico y semántico) se pueden aplicar directamente a herramientas reales, como linters, analizadores de código o lenguajes de reglas.
• El proyecto de título suele obligarte a aprender de cero tecnologías que la carrera no cubre (en su caso, IA y realidad aumentada). Si practicas entregas incrementales semanales con metodología ágil, llegas mejor preparado.

Ideas de proyecto que inspira:
• SecLint: analizador estático de vulnerabilidades con IA: Una herramienta web que analiza código Python o JavaScript para detectar patrones inseguros, como inyección SQL, secretos en el código o uso de eval. Usa técnicas de compiladores (tokens y AST), y un LLM explica cada hallazgo y propone cómo corregirlo. Combina ciberseguridad, IA y desarrollo web. MVP: Fase 1: una herramienta de línea de comandos en Python que recorre el AST con el módulo ast y detecta 5 reglas de seguridad, con pruebas en pytest y GitHub Actions. Fase 2: una API en FastAPI con un frontend donde pegas o subes código y ves los hallazgos. Fase 3: explicaciones con un LLM y una GitHub Action que comente los PR, desplegada en la nube.
• NetWatch: monitor de tráfico de red con detección de anomalías: Un dashboard web que captura tráfico de red (o lee archivos pcap), guarda los flujos en SQL y usa un modelo de machine learning para detectar comportamientos raros, como escaneos de puertos o picos anómalos. Aplica lo de redes de computadoras y combina datos, IA y ciberseguridad. MVP: Fase 1: un script con Scapy que procesa archivos pcap y guarda los flujos en PostgreSQL, con pruebas unitarias. Fase 2: un dashboard web con gráficos de tráfico por IP y puerto. Fase 3: detección de anomalías con Isolation Forest sobre el dataset CIC-IDS, alertas automáticas y despliegue con Docker y CI/CD en la nube.
• MiniRules: un lenguaje de reglas para alertas de datos: Un pequeño lenguaje propio (un DSL) para escribir reglas como 'si ventas_dia < promedio_7d * 0.5 entonces alertar', con su propio compilador o intérprete. Se ejecuta sobre datos SQL desde una aplicación web. Lleva la experiencia de construir un compilador a un caso de uso real de datos. MVP: Fase 1: un lexer y un parser (con Lark o escritos a mano) que conviertan las reglas en un AST y las evalúen sobre un CSV, con buena cobertura de pruebas. Fase 2: traducir las reglas a consultas SQL y ejecutarlas de forma programada. Fase 3: un editor web con validación de sintaxis, un historial de alertas, autenticación y despliegue en la nube.

Tecnologías: C, C++, Java, Bases de datos, Sistemas operativos, Redes de computadoras, Compiladores, Patrones de diseño, Testing de caja blanca y caja negra, Calidad de software, Gestión de proyectos, Metodologías ágiles, Inteligencia artificial, Realidad aumentada, Deep learning, Sistema binario y hexadecimal, Álgebra de circuitos y compuertas lógicas
