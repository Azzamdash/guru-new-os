
GRANT USAGE ON SCHEMA auth TO sandbox_exec;
GRANT SELECT, REFERENCES ON auth.users TO sandbox_exec;
SELECT has_schema_privilege('sandbox_exec','auth','USAGE') AS usage_ok,
       has_table_privilege('sandbox_exec','auth.users','REFERENCES') AS ref_ok;
