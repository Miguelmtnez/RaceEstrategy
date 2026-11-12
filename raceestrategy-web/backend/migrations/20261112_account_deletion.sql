-- Run in Supabase SQL Editor before deploying the account-deletion code.
-- Links local users to Supabase Auth users so Google-backed identities can be removed too.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS supabase_auth_id UUID;

UPDATE public.users AS local_user
SET supabase_auth_id = auth_user.id
FROM auth.users AS auth_user
WHERE local_user.supabase_auth_id IS NULL
  AND lower(local_user.email) = lower(auth_user.email);

CREATE UNIQUE INDEX IF NOT EXISTS users_supabase_auth_id_unique
    ON public.users (supabase_auth_id)
    WHERE supabase_auth_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.delete_raceestrategy_account(p_user_id BIGINT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    auth_id UUID;
BEGIN
    SELECT supabase_auth_id
    INTO auth_id
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RaceEstrategy user not found' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.password_resets WHERE user_id = p_user_id;
    DELETE FROM public.oauth_states WHERE user_id = p_user_id;
    DELETE FROM public.sessions WHERE user_id = p_user_id;
    DELETE FROM public.strava_events WHERE user_id = p_user_id;
    DELETE FROM public.strava_connections WHERE user_id = p_user_id;
    DELETE FROM public.imported_activity_heartrate WHERE user_id = p_user_id;
    DELETE FROM public.imported_activities WHERE user_id = p_user_id;
    DELETE FROM public.import_info WHERE user_id = p_user_id;
    DELETE FROM public.saved_routes WHERE user_id = p_user_id;
    DELETE FROM public.ml_owned_activities WHERE user_id = p_user_id;
    DELETE FROM public.users WHERE id = p_user_id;

    RETURN auth_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_raceestrategy_account(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_raceestrategy_account(BIGINT) TO service_role;
