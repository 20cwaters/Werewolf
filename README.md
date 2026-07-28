# One Night Ultimate Werewolf

A real-time multiplayer web version of the single-round social deduction game. Built to be played on
phones, in the same room, with the app acting as the narrator that keeps every player's private
information private.

- **Frontend** — React 19 + TypeScript + Tailwind CSS 4 (Vite)
- **Backend** — Node.js + Express + Socket.IO
- **State** — entirely in memory; games are single-round and short-lived, so there is no database
- **Deploy** — one Render web service that builds the client and serves it from the same process

## Quick start

```bash
npm install
```

Run the server and the Vite dev server together (Vite proxies `/socket.io` to port 3000):

```bash
npm run dev
```

Then open http://localhost:5173.

Production build and run, exactly as Render does it:

```bash
npm run build && npm start
```

That serves the whole app — client and websocket — on http://localhost:3000.

## Tests

```bash
npm test
```

85 tests covering the parts where a subtle mistake would silently corrupt a game:

| Area | What is checked |
| --- | --- |
| `tests/deck.test.ts` | Deck size math (`players + 3`), printed card limits, preset legality for 3–10 players, hostile input sanitising |
| `tests/deal.test.ts` | One card per seat plus three center cards, card-multiset conservation, seeded determinism |
| `tests/night.test.ts` | Night ordering, decoy steps, per-role action legality, information boundaries, **role-swap resolution chains** |
| `tests/resolve.test.ts` | Vote tallying and ties, the Hunter's chain kill, win conditions on final roles, the Tanner override |
| `tests/round.test.ts` | 320 complete bot-vs-bot rounds across every table size, asserting card conservation, vote legality and win-condition consistency |

Type checking across all three workspaces:

```bash
npm run typecheck
```

## Deploying to Render

`render.yaml` is a ready blueprint. If you would rather click through the dashboard, create a **Web
Service** pointed at this repo with:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/healthz`

The server binds `process.env.PORT`, which Render sets automatically. Nothing else is required — no
database, no environment variables, no second static-site service.

One caveat worth knowing on Render's free tier: instances sleep when idle and **all game state lives
in memory**, so a cold start drops any room in progress. That is fine for pick-up games; use a paid
instance if you want rooms to survive quiet periods.

## Project layout

```
shared/     Game engine + types, shared by client and server
  roles.ts      Role definitions, night wake order, teams
  deck.ts       Deck building, presets, validation
  deal.ts       Shuffling and dealing
  positions.ts  Card positions and the single swap primitive
  night.ts      Night sequencing and night action resolution
  resolve.ts    Vote tallying, Hunter rule, win conditions
server/     Socket.IO server
  Room.ts       Per-room state machine and phase timers
  RoomManager.ts  Room registry, codes, idle sweeping
  bots.ts       Bot memory, night decisions, vote heuristics
client/     React app
  lib/          Socket wiring, game state reducer, countdown hook
  components/   Backdrop SVG, UI primitives, rules, deck editor, journal
  screens/      Join, lobby, reveal, night, day, voting, results
tests/      Vitest suites (engine + bots)
```

## How the rules are implemented

### Cards live in positions, not on players

This is the design decision the whole build rests on. A card sits in a **position** — either a
player's seat (`p:<id>`) or one of the three center slots (`c:0`–`c:2`). Every swap in the game
routes through a single `swapCards` primitive in `shared/src/positions.ts`.

Two separate maps are kept:

- `originalRoles` — the card each player was **dealt**. This never changes and it decides *which
  night action a player takes*. A Seer who gets robbed still wakes as the Seer.
- `cards` — the **current** layout. A player's final role is whatever card is in their seat when the
  night ends, and that is what every win condition is judged against.

So a Robber who steals the Werewolf card genuinely *is* the Werewolf, and the player who was dealt
Werewolf is now a Robber on the Village team. `tests/night.test.ts` pins down multi-step chains
(Robber → Troublemaker → Drunk) including the case where the Drunk unknowingly trades away a Werewolf
card it was handed moments earlier.

### Night order

Werewolf → Minion → Mason → Seer → Robber → Troublemaker → Drunk → Insomniac. Only roles in the deck
get a step.

**A step still runs when every copy of that card is in the center**, with no actors and a randomised
3.5–7 second delay. Skipping such a step would tell the whole table that, for example, the Seer is in
the center — which is exactly the information the night phase exists to hide. This matches how a
human narrator runs the game.

### Hidden information

The server never sends role assignments to clients. Per-round it sends:

- `role:dealt` — privately, to each player, their own dealt card only
- `night:turn` — privately, to the acting player(s) only
- `night:result` — privately, whatever that action revealed
- `room:state` — to everyone, containing the *deck list* (public knowledge in this game), the current
  night **step number**, and optionally the acting **role name** — never who holds it

The `announceNightRoles` host setting controls that last part: on, everyone sees "the Seer is awake";
off, everyone sees only "Night step 3 of 7".

Note the Drunk deliberately receives no reveal and no `ownRole` update — not knowing is the role.

### Voting and win conditions

Votes are private until they all reveal at once; only the *fact* that someone has voted is broadcast.
Everyone tied for the most votes is killed. If a player whose **final** role is Hunter dies, whoever
they voted for dies too, regardless of vote count (resolved to a fixed point, so a Hunter shot by
another Hunter also fires).

- At least one player who is currently a Werewolf is killed → **Village wins**
- No such player is killed, including when nobody is a Werewolf at all because both Werewolf cards are
  in the center → **Werewolf team wins** (Werewolves + Minion)
- A killed Tanner → **Tanner wins alone**, overriding both of the above. The results screen still
  reports which team "technically" met its condition.

### Bots

Any empty seat can be filled with a bot from the lobby, so a single player can test end to end
against 2–9 bots.

Bots run in the server process but are fed **exactly the payloads a human client receives** — their
`night:turn` and their action result — and decide from that memory alone. They never read the card
layout directly, so they cannot cheat. A bot that robs the Werewolf card learns it from its own action
result and starts playing for the Werewolf team.

Voting heuristics are deliberately shallow, because a single night round genuinely does not give an
uninformed villager much to go on: Werewolf-side bots protect wolves they know about and prefer to
frame someone they have seen is not a wolf; village-side bots vote hard information when they have it
and otherwise spread out; the Tanner sometimes votes for itself. Bots act on a 1.2–2.8 second delay
so a solo game is watchable.

### Disconnects

A player who drops mid-game keeps their seat. Anything the table is waiting on for them auto-resolves
after two seconds — optional night actions pass, the Drunk's mandatory swap picks a random center card,
and a missing vote becomes a random one — so a round never stalls. Reconnecting (or just refreshing)
reclaims the seat via a token in `localStorage` and re-sends every private payload that player is
entitled to, including a night turn that is still open. Host status moves to another connected player
if the host drops.

## Onboarding

- **Tutorial mode** is opt-in per player on the join screen and can be switched off from the header at
  any time. It adds role-specific guidance at reveal, contextual prompts on your night turn, and
  explanations of voting and win conditions during the day and voting phases.
- **Rules reference** is available from the header in every phase — full role list with abilities,
  the night order, and how winning works. It is a local overlay, so opening it cannot disturb anyone
  else's game.
- **Night notes** keep a private log of everything you learned, since information from early in the
  night matters most during discussion.

## Mobile

Mobile is the primary target, not an afterthought:

- Single-column layouts capped at `max-w-md`, safe-area padding for notches and home indicators
- Minimum 44–48px tap targets throughout; number steppers are 44px squares
- No hover-dependent affordances — every control has a visible pressed/selected state
- `viewport-fit=cover`, `theme-color`, and web-app meta tags for a full-bleed installed feel
- Timers are driven off server timestamps, so a backgrounded phone resyncs instead of drifting
- `prefers-reduced-motion` disables the ambient animation and the card flip transition

## Extending with expansion roles

Adding a role from an expansion set (Doppelgänger, Curator, Bodyguard, …) is mostly a matter of
touching `shared/`:

1. Add the id to `RoleId` and an entry to `ROLES` in `shared/src/roles.ts`, giving it a `nightOrder`
   (or `null`) and a `team`. The night sequence, rules reference, deck editor and role cards are all
   generated from this table, so they pick it up automatically.
2. If it needs a new kind of choice, add a variant to `ChoiceKind` and `NightAction` in
   `shared/src/types.ts`, then handle it in `choiceKindFor`, `copyFor` and the `applyNightAction`
   switch in `shared/src/night.ts`.
3. Add a case to `ChoicePanel` in `client/src/screens/NightPhase.tsx` for the new choice shape.
4. Teach the bots about it in `server/src/bots.ts` (`decideBotNightAction`, plus `rememberTurn` /
   `rememberResult` if it grants information).

The Doppelgänger is the one that needs more than that, since it copies another role and acts twice —
it would need the night sequence to be rebuilt after its step rather than computed once up front.
