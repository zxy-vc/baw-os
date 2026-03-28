"""
BaW PMS — Router de Cotizaciones
Endpoints para generar cotizaciones LTR y STR
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.pricing import (
    CotizacionEngine, PropiedadConfig, STRConfig,
    Categoria, Nivel, Terraza, Remodelacion, Amueblado
)

router = APIRouter(prefix="/cotizaciones", tags=["cotizaciones"])
engine = CotizacionEngine()


class PropiedadRequest(BaseModel):
    depto_id: str
    categoria: Categoria
    nivel: Nivel
    terraza: Terraza
    remodelacion: Remodelacion
    amueblado: Amueblado
    agua_incluida: bool = True


class STRRequest(BaseModel):
    propiedad: PropiedadRequest
    personas: int
    noches: int
    es_corporativo: bool = False
    descuento_corporativo: Optional[float] = None


@router.post("/ltr")
async def cotizar_ltr(req: PropiedadRequest):
    """Generar cotización para renta larga (LTR)."""
    prop = PropiedadConfig(**req.model_dump())
    cot = engine.cotizar_ltr(prop)
    return {
        "depto_id": cot.depto_id,
        "precio_mensual": cot.precio_final,
        "agua_incluida": cot.agua_incluida,
        "desglose": cot.desglose,
    }


@router.post("/str")
async def cotizar_str(req: STRRequest):
    """Generar cotización para renta corta (STR)."""
    prop = PropiedadConfig(**req.propiedad.model_dump())
    try:
        cot = engine.cotizar_str(
            prop,
            personas=req.personas,
            noches=req.noches,
            es_corporativo=req.es_corporativo,
            descuento_corporativo=req.descuento_corporativo,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "depto_id": cot.depto_id,
        "personas": cot.personas,
        "noches": cot.noches,
        "precio_base_noche": cot.precio_base_noche,
        "descuento_pct": cot.descuento_duracion,
        "subtotal": cot.subtotal,
        "descuento_mxn": cot.descuento_mxn,
        "total": cot.total,
        "total_por_noche": cot.total_por_noche,
        "es_corporativo": cot.es_corporativo,
    }


@router.get("/str/config")
async def get_str_config():
    """Obtener configuración actual de STR (descuentos, mínimos)."""
    cfg = engine.str_config
    return {
        "precio_base_referencia": cfg.precio_base_referencia,
        "minimo_personas": cfg.minimo_personas,
        "minimo_noches": cfg.minimo_noches,
        "tarifa_minima_noche": cfg.tarifa_minima_noche,
        "descuentos_duracion": cfg.descuentos_duracion,
    }


@router.put("/str/config")
async def update_str_config(config: dict):
    """Actualizar configuración STR desde el panel (descuentos editables)."""
    if "descuentos_duracion" in config:
        engine.str_config.descuentos_duracion = {
            int(k): float(v) for k, v in config["descuentos_duracion"].items()
        }
    if "precio_base_referencia" in config:
        engine.str_config.precio_base_referencia = float(config["precio_base_referencia"])
    if "tarifa_minima_noche" in config:
        engine.str_config.tarifa_minima_noche = float(config["tarifa_minima_noche"])
    return {"updated": True, "config": engine.str_config.__dict__}
