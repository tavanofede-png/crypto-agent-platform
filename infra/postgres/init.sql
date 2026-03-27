-- Run once on first Postgres startup
-- Sets timezone and enables useful extensions

SET TIME ZONE 'UTC';

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
