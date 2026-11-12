-- RaceEstrategy v1.11: frecuencia cardíaca para actividades de archivos manuales.
-- Ejecutar desde Supabase SQL Editor tras revisar el esquema, con copia de seguridad.
BEGIN;
ALTER TABLE public.imported_activities
  ADD COLUMN IF NOT EXISTS average_heartrate double precision,
  ADD COLUMN IF NOT EXISTS max_heartrate double precision;

CREATE TABLE IF NOT EXISTS public.imported_activity_heartrate (
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_id text NOT NULL,
  average_bpm integer,
  max_bpm integer,
  points jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_format text NOT NULL,
  updated_at bigint NOT NULL,
  CONSTRAINT imported_activity_heartrate_pkey PRIMARY KEY(user_id,activity_id),
  CONSTRAINT imported_activity_heartrate_avg_check CHECK (average_bpm IS NULL OR average_bpm BETWEEN 25 AND 250),
  CONSTRAINT imported_activity_heartrate_max_check CHECK (max_bpm IS NULL OR max_bpm BETWEEN 25 AND 250),
  CONSTRAINT imported_activity_heartrate_format_check CHECK (source_format IN ('fit','tcx','gpx'))
);
CREATE INDEX IF NOT EXISTS imported_activity_heartrate_user_idx
  ON public.imported_activity_heartrate(user_id);

-- Impedir que la clave pública pueda leer datos cardíacos directamente por PostgREST.
ALTER TABLE public.imported_activity_heartrate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imported_activity_heartrate FROM anon, authenticated;
-- La clave secreta de servidor tiene acceso a través del backend autenticado.
COMMIT;
NOTIFY pgrst, 'reload schema';
