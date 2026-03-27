# BaW OS — Pricing v1.0
*Recibido de Alicia Cervantes (COO BaW), 27 marzo 2026*

---

## Fórmula LTR (Renta Mensual)

```
PRECIO = $8,000 + Categoría + Nivel + Habitaciones + Terraza + Modificadores + Agua $250
```

### Variables

| Variable | Valores |
|----------|---------|
| Base | $8,000 |
| Categoría | Básico -$600 / Confort -$200 / Clásico $0 / Superior +$400 |
| Nivel | N1 +$200 / N2 +$100 / N3 $0 / N4 -$400 |
| Habitaciones | 3 hab $0 / 4 hab +$800 |
| Terraza | <5m² $0 / 5-10m² +$200 / 10-15m² +$400 / >15m² +$600 |
| Sin cocina (D102) | -$500 |
| Agua | +$250 (siempre incluida) |

### Precios LTR por depto (con agua)

| Depto | Cat | Nivel | $/mes |
|-------|-----|-------|-------|
| D401 | Básico | N4 | $6,050 |
| D402 | Confort | N4 | $6,450 |
| D403 | Clásico | N4 | $7,850 |
| D404 | Superior | N4 | $7,850 |
| D203 | Clásico | N2 | $7,150 |
| D204 | Superior | N2 | $8,350 |
| D301 | Básico | N3 | $7,650 |
| D302 | Confort | N3 | $8,050 |
| D303 | Clásico | N3 | $9,250 |
| D304 | Superior | N3 | $11,950 |
| D201 | Básico | N2 | $8,450 |
| D202 | Confort | N2 | $9,850 |
| D102 | Confort | N1 | $8,350 (sin cocina) |
| D103 | Clásico | N1 | $9,450 |
| D101 | Básico | N1 | $10,450 |
| D104 | Superior | N1 | $12,350 |

### Reglas LTR
- Contrato mínimo 6 meses
- Depósito: 1 mes
- Pago día 5 | Mora +3% desde día 10
- Incremento anual: INPC o 5% (el mayor)
- Máx descuento por negociación: -15% combinado
- Colaboradores: -15% a -20%
- Legacy: máx +15% semestral

---

## STR Pricing v1.0 — Precio por persona/noche

### Precios STR

| Depto | Cat | Nivel | $/persona/noche | Base 4 pers/noche |
|-------|-----|-------|-----------------|-------------------|
| D104 | Superior | N1 | $300 | $1,200 |
| D304 | Superior | N3 | $290 | $1,160 |
| D101 | Básico | N1 (terraza grande) | $255 | $1,020 |
| D103 | Clásico | N1 | $230 | $920 |
| D303 | Clásico | N3 | $225 | $900 |
| D201 | Básico | N2 | $205 | $820 |

### Reglas STR
- Mínimo 4 personas (precio = $/pers × 4, aunque sean menos)
- Mínimo 3 noches
- Personas adicionales (>4): +$250/persona/noche
- Modo corporativo: tarifa especial con respaldo renta mensual mínima garantizada por empresa

---

## Motor de Cotizaciones — Input/Output

**Input:** depto + noches + personas + modalidad (STR/LTR/corporativo)
**Output:** precio total con desglose por concepto
