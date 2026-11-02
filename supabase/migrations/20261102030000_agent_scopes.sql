-- Agent tokens with scopes (add-agent-bridge, design decision 1): an MCP device reads by default;
-- writing tasks and running the bridge are granted only when the user asks for them. Clip and
-- desktop devices carry no scopes.

alter table public.devices
  add column scopes text[] not null default '{}'
  check (scopes <@ array['read', 'tasks.write', 'agent.run']::text[]);

update public.devices set scopes = '{read}' where kind = 'mcp' and scopes = '{}';
