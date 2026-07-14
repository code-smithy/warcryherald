# Security Model

Warcry Herald treats the frontend as untrusted. Authorization must be enforced
in Supabase through Row-Level Security, constraints, triggers, and database
functions where appropriate.

## Boundaries

- Campaign data is private to campaign members.
- Campaign role checks must happen in database policies or functions.
- Profiles are private to their owning authenticated user.
- Reference data is public read-mostly data, but ordinary users cannot mutate it.
- Supabase service-role keys and other secrets must never be exposed to the
  frontend.

## Phase 1 Profile Rules

- `profiles.id` is owned by `auth.users`.
- Profiles are created and refreshed by a database trigger on `auth.users`.
- Users can select only their own profile.
- Users can update only `display_name`, `preferred_language`, and `timezone`.
- Discord identifiers, avatar URLs, timestamps, and `is_site_admin` are not
  frontend-editable columns.

## Sensitive Operations

Use database functions for multi-table or sensitive operations, including:

- Accepting campaign invitations.
- Completing aftermath steps.
- Finalizing battles.
- Transferring campaign ownership.

## Required RLS Test Areas

- Non-member reads.
- Cross-campaign reads.
- Cross-campaign updates.
- Self-promotion to administrator.
- Changing another player's warband.
- Modifying completed aftermath.
- Repeated invite consumption.
- Direct insertion into protected reference tables.
- Storage access for battle images when storage is enabled.
