INSERT INTO public.user_roles (user_id, role)
VALUES ('23b874e2-a9f6-4d82-9a94-0426d7382fb4', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;