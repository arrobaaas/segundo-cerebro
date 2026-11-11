"""
Conexión con la API de Claude (Anthropic), compartida por los scripts.

- Lee la API key desde .env (que está en .gitignore: nunca se sube).
- Centraliza el modelo y el manejo de errores, para no repetirlo en cada script.
- Muestra cuántos tokens se usaron y cuánto costó aproximadamente.
"""

from __future__ import annotations

import json
import sys

import anthropic
from dotenv import load_dotenv
from pydantic import BaseModel

from cerebro import RAIZ

# load_dotenv copia las variables de .env al entorno (os.environ).
# El SDK de Anthropic lee ANTHROPIC_API_KEY desde ahí automáticamente.
load_dotenv(RAIZ / ".env")

MODELO = "claude-opus-5-5"
# Precio en USD por millón de tokens (entrada, salida) para mostrar el costo
PRECIO_MTOK = (4.00, 20.00)

# "fallbacks" (beta): si el modelo rechaza la solicitud por sus filtros de
# seguridad (pasa a veces con falsos positivos), la API la reintenta sola con
# otro modelo adecuado dentro de la misma llamada.
BETAS = ["server-side-fallback-2026-07-01"]


class ErrorClaude(Exception):
    """Algo falló al hablar con Claude; el mensaje ya viene explicado."""


def _cliente() -> anthropic.Anthropic:
    return anthropic.Anthropic()


def _mostrar_uso(respuesta) -> None:
    uso = respuesta.usage
    costo = (uso.input_tokens * PRECIO_MTOK[0] + uso.output_tokens * PRECIO_MTOK[1]) / 1_000_000
    print(f"  (Claude: {uso.input_tokens} tokens de entrada, "
          f"{uso.output_tokens} de salida ≈ US${costo:.3f})")


def _llamar(**kwargs):
    """Hace la llamada y traduce los errores típicos a mensajes claros."""
    try:
        respuesta = _cliente().beta.messages.create(
            model=MODELO, betas=BETAS, fallbacks="default", **kwargs
        )
    except anthropic.AuthenticationError:
        raise ErrorClaude(
            "La API key no es válida o no está configurada.\n"
            "  Revisa ANTHROPIC_API_KEY: en tu .env (local) o en los secretos del repo (GitHub)."
        ) from None
    except anthropic.PermissionDeniedError as e:
        raise ErrorClaude(f"La key no tiene permiso: {e.message}") from None
    except anthropic.RateLimitError:
        raise ErrorClaude("Demasiadas solicitudes seguidas. Espera un minuto y reintenta.") from None
    except anthropic.BadRequestError as e:
        # Ej. sin saldo en la cuenta, o un texto demasiado largo
        raise ErrorClaude(f"Claude rechazó la solicitud: {e.message}") from None
    except anthropic.APIStatusError as e:
        raise ErrorClaude(f"Error del servidor de Anthropic ({e.status_code}). Reintenta más tarde.") from None
    except anthropic.APIConnectionError:
        raise ErrorClaude("No hay conexión con la API. Revisa tu internet.") from None
    except TypeError as e:
        # Sin key, el SDK lanza TypeError("Could not resolve authentication method...")
        if "authentication method" in str(e):
            raise ErrorClaude(
                "No encontré ANTHROPIC_API_KEY. Copia .env.example a .env y pon tu key,\n"
                "  o usa --manual para hacerlo gratis con tu cuenta de claude.ai."
            ) from None
        raise

    if respuesta.stop_reason == "refusal":
        raise ErrorClaude("Claude no quiso procesar este contenido (filtro de seguridad).")
    if respuesta.stop_reason == "max_tokens":
        raise ErrorClaude("La respuesta quedó cortada (se alcanzó el máximo de tokens).")

    _mostrar_uso(respuesta)
    return respuesta


def _texto(respuesta) -> str:
    """Junta los bloques de texto de la respuesta (ignora los de 'thinking')."""
    return "".join(b.text for b in respuesta.content if b.type == "text").strip()


def pedir_texto(system: str, mensaje: str, esfuerzo: str = "medium", max_tokens: int = 16000) -> str:
    """Pide una respuesta en texto libre (Markdown)."""
    respuesta = _llamar(
        max_tokens=max_tokens,
        system=system,
        output_config={"effort": esfuerzo},
        messages=[{"role": "user", "content": mensaje}],
    )
    return _texto(respuesta)


def pedir_estructurado(system: str, mensaje: str | list, modelo_salida: type[BaseModel],
                       esfuerzo: str = "medium", max_tokens: int = 16000) -> BaseModel:
    """Pide una respuesta que cumpla un esquema JSON (definido con Pydantic).

    "Structured outputs": la API garantiza que la respuesta es JSON válido con
    exactamente los campos del esquema. Así no hay que "adivinar" el formato.
    `mensaje` puede ser texto o una lista de bloques (ej. un PDF + instrucciones).
    """
    esquema = modelo_salida.model_json_schema()
    respuesta = _llamar(
        max_tokens=max_tokens,
        system=system,
        output_config={
            "effort": esfuerzo,
            "format": {"type": "json_schema", "schema": _esquema_estricto(esquema)},
        },
        messages=[{"role": "user", "content": mensaje}],
    )
    try:
        return modelo_salida.model_validate_json(_texto(respuesta))
    except ValueError as e:
        raise ErrorClaude(f"Claude devolvió un JSON inesperado: {e}") from None


def _esquema_estricto(esquema: dict) -> dict:
    """Structured outputs exige additionalProperties: false en cada objeto."""
    def recorrer(nodo):
        if isinstance(nodo, dict):
            if nodo.get("type") == "object":
                nodo["additionalProperties"] = False
            for valor in nodo.values():
                recorrer(valor)
        elif isinstance(nodo, list):
            for valor in nodo:
                recorrer(valor)
    copia = json.loads(json.dumps(esquema))
    recorrer(copia)
    return copia


def salir_con_error(e: Exception) -> int:
    print(f"✘ {e}", file=sys.stderr)
    return 1
