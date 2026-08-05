GRANT USAGE ON SCHEMA auth TO sandbox_exec;
GRANT REFERENCES, SELECT ON auth.users TO sandbox_exec;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO sandbox_exec;