--! Previous: sha1:eafce160dd3a8ec859a47bc11b5c9117cc07fd8e
--! Hash: sha1:948b41151f0383d22e8be50eafa322b31a49a138

--! split: 1-current.sql
-- Enter migration here
-- Remove the old whitespace constraint from constrained_name domain
ALTER DOMAIN app_public.constrained_name DROP CONSTRAINT constrained_name_check;

-- Add new constraint that only disallows names with only whitespace
ALTER DOMAIN app_public.constrained_name ADD CONSTRAINT constrained_name_check CHECK (value !~ '^\s+$');

-- Update the domain comment
COMMENT ON DOMAIN app_public.constrained_name IS 'A field which must not contain only whitespace';
