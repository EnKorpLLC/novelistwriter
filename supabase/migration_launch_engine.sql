-- Launch engine (Studio). Safe to run again as later launch parts add to this file.
-- Run after migration_challenges.sql.

-- L1: the launch countdown. { "done": { stepId: isoDate }, "arcTarget": 15 }
alter table public.projects add column if not exists launch_plan jsonb not null default '{}'::jsonb;
