alter table public.encampment_definitions
add column if not exists source_document_id uuid references public.source_documents(id) on delete set null,
add column if not exists source_page text,
add column if not exists mechanics jsonb not null default '{}'::jsonb;

alter table public.quest_definitions
add column if not exists scope text not null default 'universal' check (scope in ('universal', 'grand_alliance', 'faction')),
add column if not exists grand_alliance_id uuid references public.grand_alliances(id) on delete set null,
add column if not exists faction_id uuid references public.factions(id) on delete set null,
add column if not exists source_document_id uuid references public.source_documents(id) on delete set null,
add column if not exists source_page text,
add column if not exists mechanics jsonb not null default '{}'::jsonb;

alter table public.artefact_definitions
add column if not exists category text not null default 'other' check (category in ('lesser_artefact', 'greater_artefact', 'campaign_reward', 'other')),
add column if not exists source_document_id uuid references public.source_documents(id) on delete set null,
add column if not exists source_page text,
add column if not exists mechanics jsonb not null default '{}'::jsonb;

alter table public.heroic_trait_definitions
add column if not exists source_document_id uuid references public.source_documents(id) on delete set null,
add column if not exists source_page text,
add column if not exists mechanics jsonb not null default '{}'::jsonb;
