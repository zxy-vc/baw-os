-- BaW OS — Fase 2a: unificar el directorio de personas (CRM ↔ occupants).
--
-- Problema: había DOS directorios paralelos — Contactos (`occupants`) y el
-- "Directorio" del CRM (`crm_contacts`) — y un botón que COPIABA personas de uno
-- a otro, generando la sensación de duplicado.
--
-- Solución (Party único): cada persona es UN `occupant` (la identidad durable), y
-- `crm_contacts` se vuelve su **capa comercial** 1:1 (estado, fuente, oportunidades).
-- Quedan en sync automáticamente; el botón de importar se elimina del UI.
--
-- Idempotente. NO destruye datos (solo crea/enlaza).

-- 1. crm_contacts "huérfanos" (sin occupant) → crear su occupant y enlazarlo.
--    Así todo registro de CRM existe también en el directorio.
DO $$
DECLARE r RECORD; new_id uuid;
BEGIN
  FOR r IN SELECT * FROM public.crm_contacts WHERE occupant_id IS NULL LOOP
    INSERT INTO public.occupants (org_id, name, phone, email)
    VALUES (r.org_id, COALESCE(NULLIF(r.name, ''), 'Sin nombre'), r.phone, r.email)
    RETURNING id INTO new_id;
    UPDATE public.crm_contacts SET occupant_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

-- 2. 1:1 — un occupant no puede estar dos veces en el CRM de una org.
--    (Si esto falla, hay registros CRM duplicados para una persona; avisar para limpiarlos.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_contacts_org_occupant
  ON public.crm_contacts (org_id, occupant_id);

-- 3. Backfill: cada occupant que aún no tiene registro CRM → crearlo.
--    is_client = true si la persona ya tiene al menos un contrato.
INSERT INTO public.crm_contacts (org_id, occupant_id, name, phone, email, source, status, is_client)
SELECT o.org_id, o.id, COALESCE(NULLIF(o.name, ''), 'Sin nombre'), o.phone, o.email, 'manual', 'nuevo',
       EXISTS (SELECT 1 FROM public.contracts c WHERE c.occupant_id = o.id)
FROM public.occupants o
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_contacts cc WHERE cc.org_id = o.org_id AND cc.occupant_id = o.id
);

-- 4. A futuro: cada occupant nuevo crea su registro CRM automáticamente (queda en sync).
CREATE OR REPLACE FUNCTION public.crm_contact_for_occupant() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.crm_contacts (org_id, occupant_id, name, phone, email, source, status, is_client)
  VALUES (NEW.org_id, NEW.id, COALESCE(NULLIF(NEW.name, ''), 'Sin nombre'), NEW.phone, NEW.email, 'manual', 'nuevo', false)
  ON CONFLICT (org_id, occupant_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_contact_for_occupant ON public.occupants;
CREATE TRIGGER trg_crm_contact_for_occupant
  AFTER INSERT ON public.occupants
  FOR EACH ROW EXECUTE FUNCTION public.crm_contact_for_occupant();
