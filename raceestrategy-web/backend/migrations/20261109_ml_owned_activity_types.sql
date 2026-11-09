-- RaceEstrategy: migración incremental de la tabla IA sobre Supabase PostgreSQL.
-- Ejecutar en Supabase SQL Editor SOLO tras revisar el esquema de producción y hacer backup.
-- El servicio Express utiliza user_id BIGINT y timestamps en milisegundos.
CREATE TABLE IF NOT EXISTS public.ml_owned_activities (
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    sport TEXT NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    duration_minutes DOUBLE PRECISION NOT NULL,
    ascent_m DOUBLE PRECISION NOT NULL,
    attested_at BIGINT NOT NULL,
    activity_name TEXT NOT NULL DEFAULT 'Actividad',
    use_for_prediction INTEGER NOT NULL DEFAULT 1,
    activity_type TEXT NOT NULL DEFAULT 'sin_clasificar',
    type_source TEXT NOT NULL DEFAULT 'unset',
    CONSTRAINT ml_owned_activities_pkey PRIMARY KEY (user_id, content_id)
);

-- Si tu compañero ya creó la tabla, no altera las filas ni los campos existentes.
ALTER TABLE public.ml_owned_activities
    ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'sin_clasificar';
ALTER TABLE public.ml_owned_activities
    ADD COLUMN IF NOT EXISTS type_source TEXT NOT NULL DEFAULT 'unset';
ALTER TABLE public.ml_owned_activities
    ADD COLUMN IF NOT EXISTS activity_name TEXT NOT NULL DEFAULT 'Actividad';
ALTER TABLE public.ml_owned_activities
    ADD COLUMN IF NOT EXISTS use_for_prediction INTEGER NOT NULL DEFAULT 1;

-- Requerido para UPSERT por clave compuesta; si la tabla ya tiene PK, es redundante pero seguro.
CREATE UNIQUE INDEX IF NOT EXISTS ml_owned_user_content_unique
    ON public.ml_owned_activities(user_id, content_id);
CREATE INDEX IF NOT EXISTS ml_owned_user_date_idx
    ON public.ml_owned_activities(user_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS ml_owned_user_selected_idx
    ON public.ml_owned_activities(user_id, use_for_prediction);

-- Toda lectura/escritura en esta integración pasa por Express y una clave administrativa en el servidor.
-- Sin políticas para anon/authenticated, el acceso directo desde navegador queda bloqueado.
ALTER TABLE public.ml_owned_activities ENABLE ROW LEVEL SECURITY;

-- Verificación manual tras la migración:
-- SELECT column_name,data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='ml_owned_activities' ORDER BY ordinal_position;
-- SELECT COUNT(*) FROM public.ml_owned_activities;
