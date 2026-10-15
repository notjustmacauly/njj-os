-- Game Day templates: saved cards ("Badminton: Rally & Rank", "Team Rank", ...)
-- that start a session in one tap after picking the event.
create table if not exists public.game_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sport       text not null check (sport in ('badminton', 'pickleball', 'volleyball')),
  ruleset     text not null default 'rally_rank' check (ruleset in ('casual', 'rally_rank')),
  format      text check (format is null or format in ('classic', 'team', 'double', 'rivalry')),
  courts      integer not null default 3 check (courts between 1 and 8),
  team_size   integer not null default 2 check (team_size between 1 and 6),
  blurb       text,
  sort        integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.game_templates enable row level security;
drop policy if exists game_templates_staff on public.game_templates;
create policy game_templates_staff on public.game_templates for all to authenticated
  using (coalesce(public.current_user_role()::text, '') in ('owner', 'partner', 'manager', 'staff'))
  with check (coalesce(public.current_user_role()::text, '') in ('owner', 'partner', 'manager'));

insert into public.game_templates (name, sport, ruleset, format, courts, team_size, blurb, sort)
select * from (values
  ('Rally & Rank',    'badminton', 'rally_rank', 'classic', 3, 2, 'Rotating partners. LP up to 100.', 1),
  ('Team Rank',       'badminton', 'rally_rank', 'team',    3, 2, 'Three squads, A v B, B v C, C v A. Top squad +10, second +5.', 2),
  ('Double Damage',   'badminton', 'rally_rank', 'double',  3, 2, 'Rally & Rank rules, LP doubled.', 3),
  ('Duo Destruction', 'badminton', 'rally_rank', 'rivalry', 3, 2, 'Fixed pairs and a bracket. Champions +20, runners up +10.', 4)
) v(name, sport, ruleset, format, courts, team_size, blurb, sort)
where not exists (select 1 from public.game_templates);

-- Sessions remember which card started them (shown on the board and leaderboard).
alter table public.game_sessions
  add column if not exists template_id uuid references public.game_templates(id),
  add column if not exists title text;

-- Public event tab: fall back to the template name when there's no linked event.
create or replace view public.web_rr_event
with (security_invoker = false) as
  select e.session_id, e.sport, e.format, e.session_date, e.season,
         coalesce(ev.name, gs.title) as event_name,
         (e.status = 'finalized') as final,
         row_number() over (
           partition by e.session_id
           order by e.lp desc, (e.w::numeric / nullif(e.n, 0)) desc nulls last, e.w desc, e.n desc,
                    (e.pd::numeric / nullif(e.n, 0)) desc nulls last, e.player_id
         )::int as rank,
         e.player_id, public.rr_public_name(p.display_name) as name,
         round(p.rating, 2) as rating, s.provisional,
         e.lp, e.n as matches, e.w as wins, e.n - e.w as losses,
         case when e.n > 0 then round(100 * e.w::numeric / e.n, 1) end as win_rate,
         (e.n > 0 and e.n < 4) as prorated, e.squad, e.bonus,
         gs.title
  from rr_event_player e
  join game_sessions gs on gs.id = e.session_id
  left join events ev on ev.id = gs.event_id
  join game_players p on p.id = e.player_id
  join rr_player_status s on s.player_id = e.player_id;
revoke all on public.web_rr_event from public;
grant select on public.web_rr_event to anon, authenticated;
