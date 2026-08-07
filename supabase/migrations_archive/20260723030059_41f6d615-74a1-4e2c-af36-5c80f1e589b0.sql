DROP POLICY IF EXISTS "Block authenticated inserts" ON public.app_user_connections;
DROP POLICY IF EXISTS "Block authenticated updates" ON public.app_user_connections;

CREATE POLICY "Block authenticated inserts" 
    ON public.app_user_connections 
    FOR INSERT 
    TO authenticated 
    WITH CHECK (false);

CREATE POLICY "Block authenticated updates" 
    ON public.app_user_connections 
    FOR UPDATE 
    TO authenticated 
    USING (false) 
    WITH CHECK (false);
