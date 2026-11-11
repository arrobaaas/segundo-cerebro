---
id: idea-011
titulo: 'NetWatch: monitor de tráfico de red con detección de anomalías'
tipo: idea
fecha: '2026-11-11'
fuente_url: null
padres:
- fuente-006
---

Un dashboard web que captura tráfico de red (o lee archivos pcap), guarda los flujos en SQL y usa un modelo de machine learning para detectar comportamientos raros, como escaneos de puertos o picos anómalos. Aplica lo de redes de computadoras y combina datos, IA y ciberseguridad.

MVP: Fase 1: un script con Scapy que procesa archivos pcap y guarda los flujos en PostgreSQL, con pruebas unitarias. Fase 2: un dashboard web con gráficos de tráfico por IP y puerto. Fase 3: detección de anomalías con Isolation Forest sobre el dataset CIC-IDS, alertas automáticas y despliegue con Docker y CI/CD en la nube.

Nació de la fuente: Qué se aprende en 5 años de Ingeniería Informática y cómo sacarle partido
