-- Adds optional per-user photos. No existing user values are changed.
BEGIN;
ALTER TABLE public.users_master ADD COLUMN IF NOT EXISTS profile_photo text
CHECK (profile_photo IS NULL OR (
    length(profile_photo) <= 100000 AND
    profile_photo ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$'
));
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='users_master' AND column_name='profile_photo') AS profile_photo_installed;
