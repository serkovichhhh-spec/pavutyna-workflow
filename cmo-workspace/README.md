# PAVUTYNA CMO Workspace

Private task workspace using verified Supabase Auth identities and server-enforced roles. No task exports, personal account details or privileged keys belong in this repository.

Deploy this directory as the Vercel project root, framework **Other**, no build command. Set `CMO_SUPABASE_URL` and `CMO_SUPABASE_PUBLISHABLE_KEY`. Only a publishable key is needed; never configure a service-role key here. `api/config.js` returns the public connection settings.

The database schema is private `cmo`. `api.cmo_workspace` is a SECURITY INVOKER wrapper. Its private implementation verifies `auth.uid()`, confirmed email and active database membership on every request. Members are provisioned separately from source code; registration by itself does not grant access. Existing TYAMA tables and API functions are not modified.

Roles: owner manages all tasks and accepts results; intake creates tasks and works on assigned tasks; executor cannot create or change task conditions. Executors see assigned tasks only. Transfers require an explanation; review requires a result; blocked requires a reason. Completion requires owner approval from Review. Original import payload and snapshot are preserved separately from runtime changes. Every mutation checks the card version and writes an event in the same transaction.

Tests: `npm test`. Database authorization tests must verify confirmed / unconfirmed / nonmember users, executor create denial, cross-assignee denial, concurrent version conflicts, and snapshot preservation in a rollback transaction before production use.

This first task module does not replace every existing CMO Space section. Scheduled notifications, CMO/Notion migration and integration with the old Workflow are separate migration phases. Old free-text deadlines are preserved; only ISO dates participate in automatic overdue counts. No notifications or invitations are sent automatically.
