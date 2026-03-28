-- ============================================================
-- BaW PMS — pricing_config
-- Todas las variables de cotización LTR + STR en una tabla
-- ============================================================

CREATE TABLE IF NOT EXISTS pricing_config (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria   text NOT NULL,   -- ltr_base, ltr_m2, ltr_nivel, ltr_hab, ltr_terraza, ltr_remodel, ltr_amueblado, str_base, str_min, str_desc
    clave       text NOT NULL,
    etiqueta    text NOT NULL,
    valor       numeric NOT NULL,
    tipo        text NOT NULL CHECK (tipo IN ('mxn', 'pct', 'num')),
    orden       int  DEFAULT 0,
    activo      boolean DEFAULT true,
    updated_at  timestamptz DEFAULT now(),
    UNIQUE (categoria, clave)
);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pricing_config_updated_at
    BEFORE UPDATE ON pricing_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── SEED: valores iniciales ──────────────────────────────────

INSERT INTO pricing_config (categoria, clave, etiqueta, valor, tipo, orden) VALUES

-- LTR Base
('ltr_base',     'base',              'Precio base mensual',        8000,  'mxn', 0),

-- LTR Categoría (m²)
('ltr_m2',       'cat01',             '102 m² (Cat 01)',            -600,  'mxn', 1),
('ltr_m2',       'cat02',             '122 m² (Cat 02)',            -200,  'mxn', 2),
('ltr_m2',       'cat03',             '131 m² (Cat 03)',               0,  'mxn', 3),
('ltr_m2',       'cat04',             '149 m² (Cat 04)',             400,  'mxn', 4),

-- LTR Nivel (piso)
('ltr_nivel',    'nivel_1',           'Piso 1',                      200,  'mxn', 1),
('ltr_nivel',    'nivel_2',           'Piso 2',                      100,  'mxn', 2),
('ltr_nivel',    'nivel_3',           'Piso 3',                        0,  'mxn', 3),
('ltr_nivel',    'nivel_4',           'Piso 4',                     -400,  'mxn', 4),

-- LTR Habitaciones
('ltr_hab',      'hab_3',             '3 habitaciones',                0,  'mxn', 1),
('ltr_hab',      'hab_4',             '4 habitaciones',              800,  'mxn', 2),

-- LTR Terraza
('ltr_terraza',  'sin_terraza',       'Sin terraza / < 5 m²',          0,  'mxn', 1),
('ltr_terraza',  'chica',             'Terraza 5-10 m²',             200,  'mxn', 2),
('ltr_terraza',  'mediana',           'Terraza 10-15 m²',            400,  'mxn', 3),
('ltr_terraza',  'grande',            'Terraza > 15 m²',             600,  'mxn', 4),

-- LTR Remodelación
('ltr_remodel',  'completa',          'Remodelación completa',          0,  'mxn', 1),
('ltr_remodel',  'parcial',           'Remodelación parcial',        -500,  'mxn', 2),
('ltr_remodel',  'minima',            'Remodelación mínima',         -800,  'mxn', 3),
('ltr_remodel',  'sin_remodelar',     'Sin remodelar',              -1200,  'mxn', 4),

-- LTR Amueblado
('ltr_amueblado','sin_amueblar',      'Sin amueblar',                   0,  'mxn', 1),
('ltr_amueblado','basico',            'Amueblado básico',            1000,  'mxn', 2),
('ltr_amueblado','estandar',          'Amueblado estándar',          1500,  'mxn', 3),
('ltr_amueblado','completo',          'Amueblado completo',          2000,  'mxn', 4),
('ltr_amueblado','completo_tv',       'Amueblado completo + TV',     2500,  'mxn', 5),

-- STR Base y mínimos
('str_base',     'precio_referencia', 'Precio base / persona / noche (depto referencia)', 300, 'mxn', 1),
('str_min',      'personas_min',      'Personas mínimas',               4,  'num', 1),
('str_min',      'noches_min',        'Noches mínimas',                 3,  'num', 2),
('str_min',      'tarifa_min_noche',  'Tarifa mínima por noche',     1200,  'mxn', 3),

-- STR Descuentos por duración (editables)
('str_desc',     '7_noches',          '1 semana (7 noches)',           15,  'pct', 1),
('str_desc',     '14_noches',         '2 semanas (14 noches)',         20,  'pct', 2),
('str_desc',     '28_noches',         '1 mes (28-30 noches)',          30,  'pct', 3),
('str_desc',     'meses_consecutivos','Varios meses consecutivos',     40,  'pct', 4)

ON CONFLICT (categoria, clave) DO UPDATE
    SET valor = EXCLUDED.valor,
        etiqueta = EXCLUDED.etiqueta,
        updated_at = now();

-- Vista para admin UI (agrupada por categoría)
CREATE OR REPLACE VIEW v_pricing_config AS
SELECT
    categoria,
    clave,
    etiqueta,
    valor,
    tipo,
    CASE tipo
        WHEN 'mxn' THEN concat('$', valor::text, ' MXN')
        WHEN 'pct' THEN concat(valor::text, '%')
        ELSE valor::text
    END AS valor_display,
    orden,
    updated_at
FROM pricing_config
WHERE activo = true
ORDER BY categoria, orden;

-- RLS: solo usuarios autenticados como admin pueden editar
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_pricing" ON pricing_config
    FOR SELECT USING (true);  -- lectura pública para el motor de cotizaciones

CREATE POLICY "admin_write_pricing" ON pricing_config
    FOR ALL USING (auth.role() = 'service_role');
