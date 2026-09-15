-- ============================================================================
--  Ardoise — schéma complet
--  À coller tel quel dans Supabase  ▸  SQL Editor  ▸  New query  ▸  Run.
--  Le script est idempotent : vous pouvez le relancer sans rien casser.
--
--  Ce qu'il fait, dans l'ordre :
--    1. les types et les tables
--    2. la fonction qui dit « à quel foyer appartient l'utilisateur connecté »
--    3. la Row Level Security — activée sur TOUTES les tables, sans exception
--    4. les fonctions métier (cocher une tâche, annuler une coche)
--    5. le temps réel
--    6. la création de VOTRE foyer  ← la seule partie à personnaliser
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TYPES ET TABLES
-- ----------------------------------------------------------------------------

do $$ begin
  create type public.task_nature as enum ('bricolage', 'artisan', 'entretien');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum ('a_faire', 'devis', 'planifie', 'fait');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum ('basse', 'normale', 'haute');
exception when duplicate_object then null; end $$;

-- Le foyer. Il n'y en a qu'un dans votre cas, mais tout est clefé dessus :
-- c'est lui qui rend la RLS simple et sûre.
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  created_at  timestamptz not null default now()
);

-- Qui appartient à quel foyer. La clef primaire est user_id : une personne
-- appartient à un seul foyer. C'est volontaire et ça simplifie tout le reste.
create table if not exists public.household_members (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  household_id  uuid not null references public.households (id) on delete cascade,
  prenom        text not null,
  created_at    timestamptz not null default now()
);
create index if not exists household_members_household_idx
  on public.household_members (household_id);

-- Les pièces de la maison. C'est l'unité d'organisation principale de l'app,
-- donc une vraie table : pas de doublon par faute de frappe, ordre maîtrisé.
create table if not exists public.rooms (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  nom           text not null check (length(btrim(nom)) between 1 and 60),
  position      smallint not null default 100,
  created_at    timestamptz not null default now()
);
create unique index if not exists rooms_household_nom_idx
  on public.rooms (household_id, lower(btrim(nom)));
create index if not exists rooms_household_position_idx
  on public.rooms (household_id, position, nom);

-- Le carnet d'adresses.
create table if not exists public.artisans (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  nom           text not null check (length(btrim(nom)) between 1 and 120),
  metier        text,
  telephone     text,
  email         text,
  notes         text,
  deja_utilise  boolean not null default false,
  appreciation  smallint check (appreciation between 1 and 5),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists artisans_household_idx
  on public.artisans (household_id, deja_utilise desc, nom);

-- Les tâches : petit bricolage, entretien récurrent et gros chantiers vivent
-- dans la même table. C'est la colonne « nature » qui les distingue, et c'est
-- ce qui permet de tout voir au même endroit dans l'onglet Tout.
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  titre            text not null check (length(btrim(titre)) between 1 and 200),
  notes            text,
  room_id          uuid references public.rooms (id) on delete set null,
  nature           public.task_nature   not null default 'bricolage',
  statut           public.task_status   not null default 'a_faire',
  priorite         public.task_priority not null default 'normale',
  echeance         date,
  -- null = tâche ponctuelle ; 3 = « tous les 3 mois ».
  recurrence_mois  smallint check (recurrence_mois is null or recurrence_mois between 1 and 120),
  cout_estime      numeric(10, 2) check (cout_estime is null or cout_estime >= 0),
  cout_reel        numeric(10, 2) check (cout_reel   is null or cout_reel   >= 0),
  assigne_a        uuid references auth.users (id) on delete set null,
  artisan_id       uuid references public.artisans (id) on delete set null,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create index if not exists tasks_household_echeance_idx
  on public.tasks (household_id, statut, echeance nulls last);
create index if not exists tasks_household_nature_idx
  on public.tasks (household_id, nature, statut);
create index if not exists tasks_household_room_idx
  on public.tasks (household_id, room_id);

-- L'historique des passages. Une tâche récurrente cochée n'est pas archivée :
-- son échéance avance et elle repasse à faire. C'est ici qu'on garde la trace
-- de chaque fois où elle a été faite, par qui, et pour combien.
create table if not exists public.task_completions (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.tasks (id) on delete cascade,
  household_id     uuid not null references public.households (id) on delete cascade,
  fait_le          timestamptz not null default now(),
  fait_par         uuid references auth.users (id) on delete set null,
  echeance_prevue  date,           -- l'échéance qui était affichée au moment de la coche
  cout_reel        numeric(10, 2)  -- ce que ce passage-là a coûté
);
create index if not exists task_completions_task_idx
  on public.task_completions (task_id, fait_le desc);
create index if not exists task_completions_household_idx
  on public.task_completions (household_id, fait_le desc);

-- updated_at tenu à jour côté base, pour ne pas dépendre du client.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists artisans_touch_updated_at on public.artisans;
create trigger artisans_touch_updated_at
  before update on public.artisans
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. « À QUEL FOYER APPARTIENT L'UTILISATEUR CONNECTÉ ? »
--
-- security definer est indispensable ici : la fonction lit household_members,
-- or household_members est elle-même protégée par RLS. Sans definer, la
-- policy s'appellerait elle-même et Postgres partirait en récursion infinie.
-- La fonction ne prend aucun paramètre et ne lit que auth.uid() : elle ne
-- peut donc pas servir à consulter le foyer de quelqu'un d'autre.
-- ----------------------------------------------------------------------------

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id
  from public.household_members
  where user_id = (select auth.uid());
$$;

revoke all on function public.current_household_id() from public, anon;
grant execute on function public.current_household_id() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
--
-- Le dépôt est public et la clef anon est dans le code : c'est normal, elle
-- n'ouvre rien par elle-même. Ce sont EXCLUSIVEMENT ces policies qui
-- protègent vos données. Une table sans policy correcte = lisible par
-- n'importe qui sur Internet. D'où le « enable row level security » sur
-- chacune, y compris celles qui paraissent anodines.
-- ----------------------------------------------------------------------------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.rooms             enable row level security;
alter table public.artisans          enable row level security;
alter table public.tasks             enable row level security;
alter table public.task_completions  enable row level security;

-- households : lecture seule, et seulement le sien. La création du foyer se
-- fait depuis l'éditeur SQL (section 6), jamais depuis l'app.
drop policy if exists "foyer visible par ses membres" on public.households;
create policy "foyer visible par ses membres"
  on public.households for select to authenticated
  using (id = public.current_household_id());

-- household_members : lecture seule également. Aucune policy d'écriture,
-- donc personne ne peut s'ajouter, se retirer, ni changer de foyer depuis
-- l'app. Ajouter le second compte se fait depuis l'éditeur SQL (voir README).
drop policy if exists "membres du foyer visibles entre eux" on public.household_members;
create policy "membres du foyer visibles entre eux"
  on public.household_members for select to authenticated
  using (household_id = public.current_household_id());

-- rooms / artisans / tasks : tout est permis à l'intérieur du foyer,
-- rien à l'extérieur. « using » filtre ce qu'on voit et ce qu'on modifie,
-- « with check » empêche d'écrire une ligne dans le foyer du voisin.
do $$
declare t text;
begin
  foreach t in array array['rooms', 'artisans', 'tasks'] loop
    execute format('drop policy if exists "lecture foyer" on public.%I', t);
    execute format(
      'create policy "lecture foyer" on public.%I for select to authenticated
         using (household_id = public.current_household_id())', t);

    execute format('drop policy if exists "insertion foyer" on public.%I', t);
    execute format(
      'create policy "insertion foyer" on public.%I for insert to authenticated
         with check (household_id = public.current_household_id())', t);

    execute format('drop policy if exists "mise a jour foyer" on public.%I', t);
    execute format(
      'create policy "mise a jour foyer" on public.%I for update to authenticated
         using (household_id = public.current_household_id())
         with check (household_id = public.current_household_id())', t);

    execute format('drop policy if exists "suppression foyer" on public.%I', t);
    execute format(
      'create policy "suppression foyer" on public.%I for delete to authenticated
         using (household_id = public.current_household_id())', t);
  end loop;
end $$;

-- task_completions : l'historique se lit et s'écrit, mais ne se modifie pas.
-- Une ligne d'historique fausse est plus gênante qu'une ligne manquante.
drop policy if exists "historique lecture foyer" on public.task_completions;
create policy "historique lecture foyer"
  on public.task_completions for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists "historique insertion foyer" on public.task_completions;
create policy "historique insertion foyer"
  on public.task_completions for insert to authenticated
  with check (household_id = public.current_household_id());

drop policy if exists "historique suppression foyer" on public.task_completions;
create policy "historique suppression foyer"
  on public.task_completions for delete to authenticated
  using (household_id = public.current_household_id());

-- ----------------------------------------------------------------------------
-- 4. FONCTIONS MÉTIER
--
-- Cocher une tâche n'est pas un simple update : il faut écrire l'historique
-- ET recalculer l'échéance si la tâche est récurrente. Le faire côté base
-- garantit que les deux téléphones aboutissent au même résultat, même s'ils
-- cochent au même moment.
--
-- Ces fonctions sont en security INVOKER (le défaut) : la RLS s'applique
-- normalement, donc on ne peut cocher que les tâches de son propre foyer.
-- ----------------------------------------------------------------------------

create or replace function public.complete_task(
  p_task_id   uuid,
  p_cout_reel numeric default null
)
returns public.tasks
language plpgsql
set search_path = public
as $$
declare
  t         public.tasks;
  v_cout    numeric(10, 2);
  v_next    date;
  v_garde   int := 0;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Tâche introuvable, ou elle n''appartient pas à votre foyer.'
      using errcode = 'no_data_found';
  end if;

  v_cout := coalesce(p_cout_reel, t.cout_reel);

  insert into public.task_completions
    (task_id, household_id, fait_par, echeance_prevue, cout_reel)
  values
    (t.id, t.household_id, (select auth.uid()), t.echeance, v_cout);

  if t.recurrence_mois is null then
    -- Ponctuelle : elle est terminée, elle sort des listes.
    update public.tasks
       set statut = 'fait', completed_at = now(), cout_reel = v_cout
     where id = t.id
    returning * into t;
  else
    -- Récurrente : elle n'est jamais archivée, son échéance avance.
    -- On avance d'autant de cycles que nécessaire pour retomber dans le
    -- futur : une tâche trimestrielle oubliée pendant huit mois ne doit pas
    -- réapparaître en retard juste après avoir été faite.
    v_next := coalesce(t.echeance, current_date);
    loop
      v_next  := (v_next + make_interval(months => t.recurrence_mois))::date;
      v_garde := v_garde + 1;
      exit when v_next > current_date or v_garde > 1000;
    end loop;

    update public.tasks
       set statut       = 'a_faire',
           completed_at = null,
           echeance     = v_next,
           cout_reel    = v_cout
     where id = t.id
    returning * into t;
  end if;

  return t;
end;
$$;

-- Annuler une coche : on se trompe de ligne un jour sur dix, et il faut
-- pouvoir revenir en arrière sans passer par l'éditeur SQL.
create or replace function public.uncomplete_task(p_task_id uuid)
returns public.tasks
language plpgsql
set search_path = public
as $$
declare
  t        public.tasks;
  v_last   public.task_completions;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Tâche introuvable, ou elle n''appartient pas à votre foyer.'
      using errcode = 'no_data_found';
  end if;

  select * into v_last
  from public.task_completions
  where task_id = t.id
  order by fait_le desc
  limit 1;

  if found then
    delete from public.task_completions where id = v_last.id;
  end if;

  update public.tasks
     set statut       = 'a_faire',
         completed_at = null,
         echeance     = coalesce(v_last.echeance_prevue, t.echeance)
   where id = t.id
  returning * into t;

  return t;
end;
$$;

revoke all on function public.complete_task(uuid, numeric)   from public, anon;
revoke all on function public.uncomplete_task(uuid)          from public, anon;
grant execute on function public.complete_task(uuid, numeric) to authenticated;
grant execute on function public.uncomplete_task(uuid)        to authenticated;

-- ----------------------------------------------------------------------------
-- 5. TEMPS RÉEL
--
-- replica identity full : sans ça, une suppression n'envoie que l'id, et
-- Supabase ne peut pas vérifier que la ligne supprimée appartenait bien à
-- votre foyer — il n'enverrait donc l'événement à personne.
-- ----------------------------------------------------------------------------

alter table public.tasks    replica identity full;
alter table public.rooms    replica identity full;
alter table public.artisans replica identity full;

do $$
declare t text;
begin
  foreach t in array array['tasks', 'rooms', 'artisans'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
--  6. VOTRE FOYER  ←←← LA SEULE PARTIE À PERSONNALISER
--
--  Remplacez le nom du foyer si vous voulez, puis lancez ce bloc.
--  Il crée le foyer et ses pièces. Il ne crée AUCUN compte : vous vous
--  rattacherez au foyer après votre première connexion dans l'app
--  (la marche à suivre est dans le README, section « Rattacher les comptes »).
--
--  Relancer ce bloc ne crée pas de doublon.
-- ============================================================================

do $$
declare
  v_household uuid;
  v_nom_foyer text := 'Maison';   -- ← mettez le nom que vous voulez
begin
  select id into v_household from public.households where nom = v_nom_foyer;
  if v_household is null then
    insert into public.households (nom) values (v_nom_foyer) returning id into v_household;
  end if;

  insert into public.rooms (household_id, nom, position)
  select v_household, nom, position
  from (values
      ('Cuisine',        10),
      ('Salon',          20),
      ('Salle à manger', 30),
      ('Chambre',        40),
      ('Salle de bain',  50),
      ('Toilettes',      60),
      ('Entrée',         70),
      ('Couloir',        80),
      ('Bureau',         90),
      ('Buanderie',     100),
      ('Cave',          110),
      ('Grenier',       120),
      ('Combles',       130),
      ('Garage',        140),
      ('Toiture',       150),
      ('Façade',        160),
      ('Jardin',        170),
      ('Terrasse',      180),
      ('Chauffage',     190),
      ('Électricité',   200),
      ('Plomberie',     210)
  ) as seed(nom, position)
  on conflict do nothing;

  raise notice 'Foyer « % » prêt. Son identifiant est : %', v_nom_foyer, v_household;
end $$;

-- Pour retrouver l'identifiant de votre foyer plus tard :
--   select id, nom from public.households;
