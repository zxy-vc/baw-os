ALTER TABLE IF EXISTS expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS str_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_expenses" ON expenses;
CREATE POLICY "service_role_expenses" ON expenses FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_role_str_seasons" ON str_seasons;
CREATE POLICY "service_role_str_seasons" ON str_seasons FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_role_whatsapp" ON whatsapp_notifications;
CREATE POLICY "service_role_whatsapp" ON whatsapp_notifications FOR ALL TO service_role USING (true);
