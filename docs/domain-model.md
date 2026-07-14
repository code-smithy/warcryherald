# Domain Model

This document defines shared terminology for Warcry Herald.

## Tenancy

The campaign is the primary security and data boundary.

Users can create or join multiple campaigns. A user can have different roles in
different campaigns and can own multiple warbands in the same campaign.

Campaign roles:

- `owner`: full campaign administrator; cannot leave while sole owner.
- `campaign_admin`: can help manage campaign operations.
- `player`: participates with one or more warbands.

## Reference Data

Reference data is read-mostly rules definition data:

- Rules releases.
- Source documents.
- Grand alliances.
- Factions.
- Runemarks.
- Fighter profiles.
- Weapon profiles.
- Abilities.
- Reactions.
- Blessings.
- Artefacts.
- Heroic traits.
- Quests.
- Encampment definitions.
- Battleplan definitions.

A fighter profile is not a player-owned fighter. It is the reusable rules
definition for a fighter available in a specific rules release.

## Player Data

Player data is campaign-specific state:

- Campaigns.
- Campaign members.
- Invitations.
- Warbands.
- Named fighter instances.
- Roster snapshots.
- Progression.
- Injuries.
- Renown.
- Artefact ownership.
- Quests.
- Encampments.
- Battles.
- Results.
- Aftermath decisions.
- Campaign journal entries.

A warband fighter is a named campaign instance of a fighter profile.

## Historical Snapshots

Roster entries and battle records must preserve the profile information that was
true when the player saved the roster or played the battle. Later rules updates
must not silently rewrite historical campaign records.
