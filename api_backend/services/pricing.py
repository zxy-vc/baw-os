"""
BaW PMS — Módulo de Cotizaciones: Pricing LTR + STR
Edificio ALM809P: D101–D404 (16 deptos, 4 niveles × 4 por nivel)
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# ─── ENUMS ───────────────────────────────────────────────────────────────────

class Categoria(str, Enum):
    CAT01 = "cat01"  # 102 m² — 3 hab
    CAT02 = "cat02"  # 122 m² — 3 hab
    CAT03 = "cat03"  # 131 m² — 3 hab
    CAT04 = "cat04"  # 149 m² — 4 hab

class Nivel(int, Enum):
    UNO   = 1
    DOS   = 2
    TRES  = 3
    CUATRO = 4

class Terraza(str, Enum):
    SIN_TERRAZA = "sin_terraza"    # o < 5 m²
    CHICA       = "chica"          # 5-10 m²
    MEDIANA     = "mediana"        # 10-15 m²
    GRANDE      = "grande"         # > 15 m²

class Remodelacion(str, Enum):
    COMPLETA    = "completa"
    PARCIAL     = "parcial"
    MINIMA      = "minima"
    SIN_REMODEL = "sin_remodelar"

class Amueblado(str, Enum):
    SIN_AMUEBLAR   = "sin_amueblar"
    BASICO         = "basico"
    ESTANDAR       = "estandar"
    COMPLETO       = "completo"
    COMPLETO_TV    = "completo_tv"


# ─── AJUSTES LTR (MXN) ───────────────────────────────────────────────────────

LTR_BASE = 8_000

LTR_AJUSTE_CATEGORIA = {
    Categoria.CAT01: -600,
    Categoria.CAT02: -200,
    Categoria.CAT03:    0,
    Categoria.CAT04: +400,
}

LTR_AJUSTE_NIVEL = {
    Nivel.UNO:    +200,
    Nivel.DOS:    +100,
    Nivel.TRES:      0,
    Nivel.CUATRO: -400,
}

LTR_AJUSTE_HABITACIONES = {
    3: 0,
    4: +800,
}

LTR_AJUSTE_TERRAZA = {
    Terraza.SIN_TERRAZA:    0,
    Terraza.CHICA:       +200,
    Terraza.MEDIANA:     +400,
    Terraza.GRANDE:      +600,
}

LTR_AJUSTE_REMODELACION = {
    Remodelacion.COMPLETA:      0,
    Remodelacion.PARCIAL:    -500,
    Remodelacion.MINIMA:     -800,
    Remodelacion.SIN_REMODEL: -1_200,
}

LTR_AJUSTE_AMUEBLADO = {
    Amueblado.SIN_AMUEBLAR:    0,
    Amueblado.BASICO:      +1_000,
    Amueblado.ESTANDAR:    +1_500,
    Amueblado.COMPLETO:    +2_000,
    Amueblado.COMPLETO_TV: +2_500,
}

# Habitaciones por categoría
HABITACIONES_POR_CATEGORIA = {
    Categoria.CAT01: 3,
    Categoria.CAT02: 3,
    Categoria.CAT03: 3,
    Categoria.CAT04: 4,
}


# ─── CONFIG STR (editables desde PMS) ────────────────────────────────────────

@dataclass
class STRConfig:
    """Configuración editable del módulo STR — no hardcoded."""
    precio_base_referencia: float = 300.0  # MXN/persona/noche (depto más equipado)
    minimo_personas: int = 4
    minimo_noches: int = 3
    tarifa_minima_noche: float = 1_200.0
    descuentos_duracion: dict = field(default_factory=lambda: {
        7:  0.15,   # 1 semana
        14: 0.20,   # 2 semanas
        28: 0.30,   # 1 mes
        # >28 noches: hasta 40%, campo libre / criterio del operador
    })


# ─── MODELOS ─────────────────────────────────────────────────────────────────

@dataclass
class PropiedadConfig:
    """Características de un depto del edificio ALM809P."""
    depto_id: str           # Ej: "D104", "D302"
    categoria: Categoria
    nivel: Nivel
    terraza: Terraza
    remodelacion: Remodelacion
    amueblado: Amueblado
    agua_incluida: bool = True
    notas: str = ""

    @property
    def habitaciones(self) -> int:
        return HABITACIONES_POR_CATEGORIA[self.categoria]


@dataclass
class CotizacionLTR:
    depto_id: str
    precio_base: float
    ajuste_categoria: float
    ajuste_nivel: float
    ajuste_habitaciones: float
    ajuste_terraza: float
    ajuste_remodelacion: float
    ajuste_amueblado: float
    precio_final: float
    agua_incluida: bool
    desglose: dict

    def resumen(self) -> str:
        agua = "incluida" if self.agua_incluida else "no incluida"
        return (
            f"Cotización LTR — {self.depto_id}\n"
            f"  Base:            $8,000 MXN\n"
            f"  Categoría:       {'+' if self.ajuste_categoria >= 0 else ''}{self.ajuste_categoria:,.0f}\n"
            f"  Nivel:           {'+' if self.ajuste_nivel >= 0 else ''}{self.ajuste_nivel:,.0f}\n"
            f"  Habitaciones:    {'+' if self.ajuste_habitaciones >= 0 else ''}{self.ajuste_habitaciones:,.0f}\n"
            f"  Terraza:         {'+' if self.ajuste_terraza >= 0 else ''}{self.ajuste_terraza:,.0f}\n"
            f"  Remodelación:    {'+' if self.ajuste_remodelacion >= 0 else ''}{self.ajuste_remodelacion:,.0f}\n"
            f"  Amueblado:       {'+' if self.ajuste_amueblado >= 0 else ''}{self.ajuste_amueblado:,.0f}\n"
            f"  ─────────────────────────────\n"
            f"  TOTAL MENSUAL:   ${self.precio_final:,.0f} MXN\n"
            f"  Agua:            {agua}"
        )


@dataclass
class CotizacionSTR:
    depto_id: str
    personas: int
    noches: int
    precio_base_noche: float
    descuento_duracion: float
    subtotal: float
    descuento_mxn: float
    total: float
    total_por_noche: float
    es_corporativo: bool = False
    notas: str = ""

    def resumen(self) -> str:
        pct = self.descuento_duracion * 100
        return (
            f"Cotización STR — {self.depto_id}\n"
            f"  Personas:        {self.personas}\n"
            f"  Noches:          {self.noches}\n"
            f"  Base/persona/noche: ${self.precio_base_noche:,.0f} MXN\n"
            f"  Subtotal:        ${self.subtotal:,.0f} MXN\n"
            f"  Descuento {pct:.0f}%:    -${self.descuento_mxn:,.0f} MXN (tarifa mínima aplicada si aplica)\n"
            f"  ─────────────────────────────\n"
            f"  TOTAL:           ${self.total:,.0f} MXN\n"
            f"  Por noche:       ${self.total_por_noche:,.0f} MXN/noche"
        )


# ─── MOTOR DE COTIZACIÓN ──────────────────────────────────────────────────────

class CotizacionEngine:

    def __init__(self, str_config: Optional[STRConfig] = None):
        self.str_config = str_config or STRConfig()

    # --- LTR ---

    def cotizar_ltr(self, prop: PropiedadConfig) -> CotizacionLTR:
        adj_cat  = LTR_AJUSTE_CATEGORIA[prop.categoria]
        adj_niv  = LTR_AJUSTE_NIVEL[prop.nivel]
        adj_hab  = LTR_AJUSTE_HABITACIONES[prop.habitaciones]
        adj_ter  = LTR_AJUSTE_TERRAZA[prop.terraza]
        adj_rem  = LTR_AJUSTE_REMODELACION[prop.remodelacion]
        adj_amue = LTR_AJUSTE_AMUEBLADO[prop.amueblado]

        precio_final = (
            LTR_BASE + adj_cat + adj_niv + adj_hab +
            adj_ter + adj_rem + adj_amue
        )

        return CotizacionLTR(
            depto_id=prop.depto_id,
            precio_base=LTR_BASE,
            ajuste_categoria=adj_cat,
            ajuste_nivel=adj_niv,
            ajuste_habitaciones=adj_hab,
            ajuste_terraza=adj_ter,
            ajuste_remodelacion=adj_rem,
            ajuste_amueblado=adj_amue,
            precio_final=precio_final,
            agua_incluida=prop.agua_incluida,
            desglose={
                "base": LTR_BASE,
                "categoria": adj_cat,
                "nivel": adj_niv,
                "habitaciones": adj_hab,
                "terraza": adj_ter,
                "remodelacion": adj_rem,
                "amueblado": adj_amue,
                "total": precio_final,
            }
        )

    # --- STR ---

    def cotizar_str(
        self,
        prop: PropiedadConfig,
        personas: int,
        noches: int,
        es_corporativo: bool = False,
        descuento_corporativo: Optional[float] = None,
    ) -> CotizacionSTR:
        cfg = self.str_config

        # Validaciones mínimas (excepto corporativo)
        if not es_corporativo:
            if personas < cfg.minimo_personas:
                raise ValueError(f"Mínimo {cfg.minimo_personas} personas para STR")
            if noches < cfg.minimo_noches:
                raise ValueError(f"Mínimo {cfg.minimo_noches} noches para STR")

        # Precio base ajustado por características del depto
        # El depto referencia (más equipado: Cat04, nivel 1, terraza grande, remodelación completa,
        # amueblado completo+TV) tiene precio_base_referencia.
        # Los demás ajustan proporcionalmente usando la lógica LTR.
        cot_ltr = self.cotizar_ltr(prop)
        # Referencia LTR del depto más equipado:
        ref_prop = PropiedadConfig(
            depto_id="REF",
            categoria=Categoria.CAT04,
            nivel=Nivel.UNO,
            terraza=Terraza.GRANDE,
            remodelacion=Remodelacion.COMPLETA,
            amueblado=Amueblado.COMPLETO_TV,
        )
        ref_ltr = self.cotizar_ltr(ref_prop)
        ratio = cot_ltr.precio_final / ref_ltr.precio_final
        precio_base_noche = cfg.precio_base_referencia * ratio

        subtotal = precio_base_noche * personas * noches

        # Descuento por duración
        if es_corporativo and descuento_corporativo is not None:
            descuento = descuento_corporativo
        else:
            descuento = 0.0
            for umbral in sorted(cfg.descuentos_duracion.keys(), reverse=True):
                if noches >= umbral:
                    descuento = cfg.descuentos_duracion[umbral]
                    break

        descuento_mxn = subtotal * descuento
        total = subtotal - descuento_mxn
        total_por_noche = total / noches

        # Aplicar tarifa mínima
        if not es_corporativo and total_por_noche < cfg.tarifa_minima_noche:
            total = cfg.tarifa_minima_noche * noches
            total_por_noche = cfg.tarifa_minima_noche

        return CotizacionSTR(
            depto_id=prop.depto_id,
            personas=personas,
            noches=noches,
            precio_base_noche=round(precio_base_noche, 2),
            descuento_duracion=descuento,
            subtotal=round(subtotal, 2),
            descuento_mxn=round(descuento_mxn, 2),
            total=round(total, 2),
            total_por_noche=round(total_por_noche, 2),
            es_corporativo=es_corporativo,
        )


# ─── EJEMPLO DE USO ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    engine = CotizacionEngine()

    # Depto D104 — Cat04, Nivel 1, terraza grande, remodelación completa, completo+TV
    d104 = PropiedadConfig(
        depto_id="D104",
        categoria=Categoria.CAT04,
        nivel=Nivel.UNO,
        terraza=Terraza.GRANDE,
        remodelacion=Remodelacion.COMPLETA,
        amueblado=Amueblado.COMPLETO_TV,
        agua_incluida=True,
    )

    # Depto D303 — Cat03, Nivel 3, sin terraza, parcial, estándar
    d303 = PropiedadConfig(
        depto_id="D303",
        categoria=Categoria.CAT03,
        nivel=Nivel.TRES,
        terraza=Terraza.SIN_TERRAZA,
        remodelacion=Remodelacion.PARCIAL,
        amueblado=Amueblado.ESTANDAR,
        agua_incluida=True,
    )

    print("=" * 50)
    cot_ltr_d104 = engine.cotizar_ltr(d104)
    print(cot_ltr_d104.resumen())

    print()
    cot_ltr_d303 = engine.cotizar_ltr(d303)
    print(cot_ltr_d303.resumen())

    print()
    print("=" * 50)
    # STR: D104, 4 personas, 7 noches (descuento 15%)
    cot_str = engine.cotizar_str(d104, personas=4, noches=7)
    print(cot_str.resumen())

    print()
    # STR: D303, 5 personas, 30 noches (descuento 30%)
    cot_str_mes = engine.cotizar_str(d303, personas=5, noches=30)
    print(cot_str_mes.resumen())
