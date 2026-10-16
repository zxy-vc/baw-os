-- =============================================================================
-- BAW-18 · Fase B1 · REVERSA de UN lote del punto de corte
-- =============================================================================
-- Proyecto: zlcgxmllaeweypyodvzk (prod). LO CORRE FRAN, A MANO, EN EL SQL EDITOR,
-- SOLO si hay que deshacer docs/audits/BAW-18-fase-b.sql.
--
-- Qué hace: lee de audit_log las filas del lote (metadata.run_id) y deshace
-- exactamente lo que ese lote hizo, sin DELETE:
--   · UPDATE de contratos, cargos y unidades → restaura SOLO las columnas que el
--     lote cambió (diferencia before_data vs after_data), con su valor anterior.
--   · Cargos que el lote insertó (pagos de D301) → status 'void'.
--   · Contrato que el lote insertó (D301 nuevo) → estatus terminado + archived_at.
--   · Occupant que el lote insertó → archived_at; su crm_contact → 'descartado'.
--
-- Anti-pisotón (todo se valida DESPUÉS de bloquear las filas, y se revalida al escribir):
--   · Cargos: el dinero debe seguir exactamente como lo dejó el lote (status, amount,
--     rent_amount, water_fee, amount_paid, confirmed_at, reference, paid_date) y no
--     debe haber abonos, bitácora ni CFDI. Si alguien cobró después, se detiene.
--   · Contratos/unidades actualizados: las columnas que tocó el lote siguen igual.
--   · Contrato, occupant y crm_contact insertados: siguen idénticos a como los creó
--     el lote (salvo updated_at). Los cargos que el cron les haya generado después
--     detienen la reversa; con v_anular_cargos_posteriores se anulan SOLO si no
--     tienen dinero.
--
-- Mismo mecanismo que BAW-3: un bloque DO; dry-run = termina en excepción con el
-- resumen (nada se guarda); aplicar = v_aplicar := true.
--
-- Pasos para Fran:
--   1. Pegar el run_id del lote (sale en la tabla final del script de la Fase B1, o:
--      SELECT metadata->>'run_id', created_at FROM audit_log WHERE action = 'baw18.fase_b.lote';)
--      en v_run, copiar el archivo completo y Run. Debe salir en ROJO:
--        DRY-RUN OK (nada se guardó) · lote=… · conflictos=0 · … · veredicto=OK
--   2. Cambiar v_aplicar := true y Run. Debe salir UNA fila con veredicto = OK.
--   Con «DETENTE: …» no se guardó nada: pegar el mensaje en el PR.
-- =============================================================================

DO $baw18r$
DECLARE
  v_aplicar  boolean := false;  -- ← DRY-RUN. true SOLO en el paso 2.
  v_run      uuid    := NULL;   -- ← pegar aquí el run_id del lote a deshacer
  v_actor    text    := 'fran@zxy.vc';
  v_st_terminado text := 'terminated';     -- estatus para el contrato que el lote creó
  v_anular_cargos_posteriores boolean := false;  -- true = anular (void) cargos SIN dinero que el cron haya
                                                 -- generado después del lote para el contrato creado

  c_dinero CONSTANT text[] := ARRAY['status', 'amount', 'rent_amount', 'water_fee', 'amount_paid',
                                    'confirmed_at', 'reference', 'paid_date'];

  v_org uuid;
  v_tag text;
  a record;
  v_cur jsonb;
  v_patch jsonb;
  v_after jsonb;
  v_txt text;
  v_n bigint;
  v_con_dinero bigint;
  v_conflictos text[] := ARRAY[]::text[];
  v_restaurados integer := 0;
  v_anulados_insertados integer := 0;
  v_anulados_posteriores integer := 0;
  v_contratos_archivados integer := 0;
  v_ocupantes_archivados integer := 0;
  v_crm_descartados integer := 0;
  v_veredicto text;
  v_resumen text;
BEGIN
  IF v_run IS NULL THEN
    RAISE EXCEPTION 'DETENTE: falta v_run (run_id del lote). Nada se guardó.';
  END IF;
  SELECT org_id INTO v_org FROM public.audit_log
   WHERE action = 'baw18.fase_b.lote' AND metadata->>'run_id' = v_run::text;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'DETENTE: no existe el lote % en audit_log. Nada se guardó.', v_run;
  END IF;
  IF EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'baw18.fase_b.reversa' AND metadata->>'run_id' = v_run::text) THEN
    RAISE EXCEPTION 'DETENTE: el lote % ya se revirtió. Nada se guardó.', v_run;
  END IF;
  v_tag := 'BAW-18 reversa del lote ' || left(v_run::text, 8);

  -- Las filas del lote, en una tabla temporal (orden de aplicación = created_at, id).
  CREATE TEMP TABLE _b18r_lote ON COMMIT DROP AS
  SELECT * FROM public.audit_log
   WHERE metadata->>'run_id' = v_run::text AND action LIKE 'baw18.fase_b.%'
     AND action <> 'baw18.fase_b.lote' AND action NOT LIKE 'baw18.fase_b.reversa%';

  -- ═══════════════ 0. BLOQUEO (antes de validar; se mantiene hasta el final) ═══════════════
  -- Bloquear los cargos también impide colgarles abonos/bitácora/CFDI nuevos (FKs).
  PERFORM 1 FROM public.payments
   WHERE id IN (SELECT entity_id FROM _b18r_lote WHERE entity_type = 'payment')
      OR contract_id IN (SELECT entity_id FROM _b18r_lote WHERE action = 'baw18.fase_b.contract.insert')
   FOR UPDATE;
  PERFORM 1 FROM public.contracts WHERE id IN (SELECT entity_id FROM _b18r_lote WHERE entity_type = 'contract') FOR UPDATE;
  PERFORM 1 FROM public.units     WHERE id IN (SELECT entity_id FROM _b18r_lote WHERE entity_type = 'unit') FOR UPDATE;
  PERFORM 1 FROM public.occupants WHERE id IN (SELECT entity_id FROM _b18r_lote WHERE entity_type = 'occupant') FOR UPDATE;
  IF EXISTS (SELECT 1 FROM _b18r_lote WHERE entity_type = 'crm_contact') THEN
    PERFORM 1 FROM public.crm_contacts WHERE id IN (SELECT entity_id FROM _b18r_lote WHERE entity_type = 'crm_contact') FOR UPDATE;
  END IF;

  -- ═══════════════ 1. CONFLICTOS (sin tocar nada todavía) ═══════════════
  FOR a IN SELECT * FROM _b18r_lote ORDER BY created_at, id LOOP
    v_cur := CASE a.entity_type
      WHEN 'payment'     THEN (SELECT to_jsonb(x) FROM public.payments x  WHERE x.id = a.entity_id)
      WHEN 'contract'    THEN (SELECT to_jsonb(x) FROM public.contracts x WHERE x.id = a.entity_id)
      WHEN 'unit'        THEN (SELECT to_jsonb(x) FROM public.units x     WHERE x.id = a.entity_id)
      WHEN 'occupant'    THEN (SELECT to_jsonb(x) FROM public.occupants x WHERE x.id = a.entity_id)
      WHEN 'crm_contact' THEN (SELECT to_jsonb(x) FROM public.crm_contacts x WHERE x.id = a.entity_id)
    END;
    IF v_cur IS NULL THEN
      v_conflictos := v_conflictos || format('%s %s ya no existe', a.entity_type, a.entity_id);
      CONTINUE;
    END IF;

    IF a.entity_type = 'payment' THEN
      -- Dinero intacto respecto de lo que dejó el lote, y sin movimientos colgados.
      SELECT string_agg(k, ',') INTO v_txt FROM unnest(c_dinero) k
       WHERE v_cur->k IS DISTINCT FROM a.after_data->k;
      IF v_txt IS NOT NULL THEN
        v_conflictos := v_conflictos || format('cargo %s cambió después del lote en: %s', a.entity_id, v_txt);
      END IF;
      IF EXISTS (SELECT 1 FROM public.payment_receipts x WHERE x.payment_id = a.entity_id)
         OR EXISTS (SELECT 1 FROM public.payment_ledger l WHERE l.payment_id = a.entity_id)
         OR EXISTS (SELECT 1 FROM public.invoices f WHERE f.payment_id = a.entity_id AND COALESCE(f.status, '') <> 'cancelled') THEN
        v_conflictos := v_conflictos || format('cargo %s tiene abonos, bitácora o CFDI', a.entity_id);
      END IF;
    END IF;

    IF a.before_data IS NOT NULL THEN
      -- UPDATE del lote: cada columna que cambió debe seguir con el valor que dejó el lote.
      SELECT string_agg(k, ',') INTO v_txt
        FROM jsonb_object_keys(a.after_data) k
       WHERE k <> 'updated_at'
         AND a.before_data->k IS DISTINCT FROM a.after_data->k
         AND v_cur->k IS DISTINCT FROM a.after_data->k;
      IF v_txt IS NOT NULL THEN
        v_conflictos := v_conflictos || format('%s %s cambió después del lote en: %s', a.entity_type, a.entity_id, v_txt);
      END IF;
    ELSIF a.entity_type IN ('contract', 'occupant', 'crm_contact') THEN
      -- INSERT del lote: la fila sigue idéntica a como se creó.
      SELECT string_agg(k, ',') INTO v_txt
        FROM (SELECT jsonb_object_keys(a.after_data || v_cur) AS k) z
       WHERE k <> 'updated_at' AND v_cur->k IS DISTINCT FROM a.after_data->k;
      IF v_txt IS NOT NULL THEN
        v_conflictos := v_conflictos || format('%s insertado %s cambió después del lote en: %s', a.entity_type, a.entity_id, v_txt);
      END IF;
      IF a.entity_type = 'contract' THEN
        -- Cargos del contrato que NO son del lote (p. ej. el cron del día 1).
        SELECT count(*), count(*) FILTER (WHERE
                 COALESCE(py.amount_paid, 0) <> 0 OR py.status::text IN ('paid', 'partial')
                 OR py.confirmed_at IS NOT NULL OR COALESCE(py.reference, '') LIKE 'pi\_%'
                 OR EXISTS (SELECT 1 FROM public.payment_receipts x WHERE x.payment_id = py.id)
                 OR EXISTS (SELECT 1 FROM public.payment_ledger l WHERE l.payment_id = py.id)
                 OR EXISTS (SELECT 1 FROM public.invoices f WHERE f.payment_id = py.id AND COALESCE(f.status, '') <> 'cancelled'))
          INTO v_n, v_con_dinero
          FROM public.payments py
         WHERE py.contract_id = a.entity_id AND py.status::text <> 'void'
           AND py.id NOT IN (SELECT entity_id FROM _b18r_lote WHERE action = 'baw18.fase_b.payment.insert');
        IF v_n > 0 AND (v_con_dinero > 0 OR NOT v_anular_cargos_posteriores) THEN
          v_conflictos := v_conflictos || format('contrato insertado %s tiene %s cargo(s) posteriores al lote (%s con dinero)%s',
            a.entity_id, v_n, v_con_dinero,
            CASE WHEN v_con_dinero = 0 THEN '; usa v_anular_cargos_posteriores := true' ELSE '; revisar a mano' END);
        END IF;
      ELSIF a.entity_type = 'occupant' THEN
        SELECT count(*) INTO v_n FROM public.contracts c
         WHERE c.occupant_id = a.entity_id
           AND c.id NOT IN (SELECT entity_id FROM _b18r_lote WHERE action = 'baw18.fase_b.contract.insert');
        IF v_n > 0 THEN
          v_conflictos := v_conflictos || format('occupant %s ya tiene %s contrato(s) fuera del lote', a.entity_id, v_n);
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF cardinality(v_conflictos) > 0 THEN
    RAISE EXCEPTION 'DETENTE: % conflicto(s); no se revierte nada. Nada se guardó. · %',
      cardinality(v_conflictos), array_to_string(v_conflictos, ' | ');
  END IF;

  -- ═══════════════ 2. REVERTIR (orden inverso; cada escritura afecta exactamente 1 fila) ═══════════════
  FOR a IN SELECT * FROM _b18r_lote ORDER BY created_at DESC, id DESC LOOP
    v_after := NULL;
    IF a.before_data IS NOT NULL THEN
      -- Solo las columnas que el lote cambió, con su valor anterior.
      SELECT COALESCE(jsonb_object_agg(k, a.before_data->k), '{}'::jsonb) INTO v_patch
        FROM jsonb_object_keys(a.after_data) k
       WHERE k <> 'updated_at' AND a.before_data->k IS DISTINCT FROM a.after_data->k;
      IF a.entity_type = 'payment' THEN
        UPDATE public.payments p
           SET status      = (jsonb_populate_record(p, v_patch)).status,
               notes       = (jsonb_populate_record(p, v_patch)).notes,
               amount      = (jsonb_populate_record(p, v_patch)).amount,
               rent_amount = (jsonb_populate_record(p, v_patch)).rent_amount,
               water_fee   = (jsonb_populate_record(p, v_patch)).water_fee,
               updated_at  = now()
         WHERE p.id = a.entity_id
           AND p.status::text = a.after_data->>'status'
           AND p.amount_paid IS NOT DISTINCT FROM (a.after_data->>'amount_paid')::numeric
        RETURNING to_jsonb(p) INTO v_after;
      ELSIF a.entity_type = 'contract' THEN
        UPDATE public.contracts c
           SET status             = (jsonb_populate_record(c, v_patch)).status,
               end_date           = (jsonb_populate_record(c, v_patch)).end_date,
               billing_start_date = (jsonb_populate_record(c, v_patch)).billing_start_date,
               monthly_amount     = (jsonb_populate_record(c, v_patch)).monthly_amount,
               notes              = (jsonb_populate_record(c, v_patch)).notes
         WHERE c.id = a.entity_id AND c.status::text = a.after_data->>'status'
        RETURNING to_jsonb(c) INTO v_after;
      ELSIF a.entity_type = 'unit' THEN
        UPDATE public.units u
           SET status = (jsonb_populate_record(u, v_patch)).status
         WHERE u.id = a.entity_id AND u.status::text = a.after_data->>'status'
        RETURNING to_jsonb(u) INTO v_after;
      END IF;
      v_restaurados := v_restaurados + 1;

    ELSIF a.entity_type = 'payment' THEN  -- cargo insertado por el lote → void
      UPDATE public.payments p
         SET status = (jsonb_populate_record(p, '{"status":"void"}'::jsonb)).status,
             notes  = concat_ws(' · ', NULLIF(p.notes, ''), v_tag),
             updated_at = now()
       WHERE p.id = a.entity_id AND p.status::text = a.after_data->>'status'
      RETURNING to_jsonb(p) INTO v_after;
      v_anulados_insertados := v_anulados_insertados + 1;

    ELSIF a.entity_type = 'contract' THEN  -- contrato insertado → terminado + archivado
      IF v_anular_cargos_posteriores THEN
        WITH antes AS (
          SELECT py.id, to_jsonb(py) AS before_data FROM public.payments py
           WHERE py.contract_id = a.entity_id AND py.status::text <> 'void'
             AND py.id NOT IN (SELECT entity_id FROM _b18r_lote WHERE action = 'baw18.fase_b.payment.insert')
        ), upd AS (
          UPDATE public.payments p
             SET status = (jsonb_populate_record(p, '{"status":"void"}'::jsonb)).status,
                 notes  = concat_ws(' · ', NULLIF(p.notes, ''), v_tag || ': cargo posterior del contrato revertido'),
                 updated_at = now()
            FROM antes
           WHERE p.id = antes.id
             -- revalidación de la guarda de dinero (ya validada en el paso 1, con las filas bloqueadas)
             AND COALESCE(p.amount_paid, 0) = 0 AND p.status::text NOT IN ('paid', 'partial')
             AND p.confirmed_at IS NULL AND COALESCE(p.reference, '') NOT LIKE 'pi\_%'
             AND NOT EXISTS (SELECT 1 FROM public.payment_receipts x WHERE x.payment_id = p.id)
             AND NOT EXISTS (SELECT 1 FROM public.payment_ledger l WHERE l.payment_id = p.id)
             AND NOT EXISTS (SELECT 1 FROM public.invoices f WHERE f.payment_id = p.id AND COALESCE(f.status, '') <> 'cancelled')
          RETURNING p.id, to_jsonb(p) AS after_data
        )
        INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
        SELECT v_org, 'human', v_actor, 'baw18.fase_b.reversa.payment.void', 'payment', upd.id, antes.before_data, upd.after_data,
               jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18')
          FROM upd JOIN antes ON antes.id = upd.id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_anulados_posteriores := v_anulados_posteriores + v_n;
      END IF;
      UPDATE public.contracts c
         SET status = (jsonb_populate_record(c, jsonb_build_object('status', v_st_terminado))).status,
             archived_at = now(),
             notes = concat_ws(' · ', NULLIF(c.notes, ''), v_tag)
       WHERE c.id = a.entity_id AND c.status::text = a.after_data->>'status' AND c.archived_at IS NULL
      RETURNING to_jsonb(c) INTO v_after;
      v_contratos_archivados := v_contratos_archivados + 1;

    ELSIF a.entity_type = 'occupant' THEN
      UPDATE public.occupants o SET archived_at = now()
       WHERE o.id = a.entity_id AND o.archived_at IS NULL
      RETURNING to_jsonb(o) INTO v_after;
      v_ocupantes_archivados := v_ocupantes_archivados + 1;

    ELSIF a.entity_type = 'crm_contact' THEN
      UPDATE public.crm_contacts cc SET status = 'descartado'
       WHERE cc.id = a.entity_id AND cc.status = a.after_data->>'status'
      RETURNING to_jsonb(cc) INTO v_after;
      v_crm_descartados := v_crm_descartados + 1;
    END IF;

    IF v_after IS NULL THEN
      RAISE EXCEPTION 'DETENTE: % % no se pudo revertir (cambió durante la reversa). Nada se guardó.', a.entity_type, a.entity_id;
    END IF;
    INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
    VALUES (v_org, 'human', v_actor, replace(a.action, 'baw18.fase_b.', 'baw18.fase_b.reversa.'), a.entity_type, a.entity_id,
            a.after_data, v_after, jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'revierte', a.id));
  END LOOP;

  v_veredicto := 'OK';
  v_resumen := format('lote=%s · conflictos=0 · columnas_restauradas_en=%s filas · cargos_insertados_anulados=%s · '
                      'cargos_posteriores_anulados=%s · contratos_archivados=%s · ocupantes_archivados=%s · crm_descartados=%s · veredicto=%s',
                      v_run, v_restaurados, v_anulados_insertados, v_anulados_posteriores, v_contratos_archivados,
                      v_ocupantes_archivados, v_crm_descartados, v_veredicto);

  INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (v_org, 'human', v_actor, 'baw18.fase_b.reversa', 'lote', v_run, NULL, NULL,
          jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'resumen', v_resumen));

  IF NOT v_aplicar THEN
    RAISE EXCEPTION 'DRY-RUN OK (nada se guardó) · %', v_resumen;
  END IF;

  DROP TABLE IF EXISTS pg_temp._b18_reversa;
  CREATE TEMP TABLE _b18_reversa AS SELECT v_veredicto AS veredicto, v_run AS run_id, v_resumen AS resumen;
END
$baw18r$;

SELECT * FROM pg_temp._b18_reversa;
