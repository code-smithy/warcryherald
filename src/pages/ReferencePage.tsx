import { useEffect, useMemo, useState } from "react";
import {
  HeraldPanel,
  LedgerTable,
  RunemarkBadge,
  StatBlock
} from "../components/design-system";
import {
  filterFighterProfiles,
  formatWeaponRange,
  getFighterRunemarks,
  getSingle,
  getSourceLabel,
  listFactions,
  listFighterProfiles,
  listRulesReleases,
  listRunemarks,
  type Faction,
  type FighterProfile,
  type RulesRelease,
  type Runemark
} from "../lib/reference-data";
import { getSupabaseClient } from "../lib/supabase";

export function ReferencePage() {
  const [fighters, setFighters] = useState<FighterProfile[]>([]);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [runemarks, setRunemarks] = useState<Runemark[]>([]);
  const [releases, setReleases] = useState<RulesRelease[]>([]);
  const [selectedFighterId, setSelectedFighterId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [factionKey, setFactionKey] = useState("");
  const [grandAllianceKey, setGrandAllianceKey] = useState("");
  const [runemarkKey, setRunemarkKey] = useState("");
  const [includeRetired, setIncludeRetired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const client = getSupabaseClient();

    if (!client) {
      setLoading(false);
      setError("Supabase is not configured.");
      return;
    }

    const referenceClient = client;

    async function loadReferenceData() {
      setLoading(true);
      setError(null);

      try {
        const [nextReleases, nextFactions, nextRunemarks, nextFighters] =
          await Promise.all([
            listRulesReleases(referenceClient),
            listFactions(referenceClient),
            listRunemarks(referenceClient),
            listFighterProfiles(referenceClient)
          ]);

        if (!active) {
          return;
        }

        setReleases(nextReleases);
        setFactions(nextFactions);
        setRunemarks(nextRunemarks);
        setFighters(nextFighters);
        setSelectedFighterId(nextFighters[0]?.id ?? null);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Reference data failed to load.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReferenceData();

    return () => {
      active = false;
    };
  }, []);

  const grandAlliances = useMemo(() => {
    const map = new Map<string, { stable_key: string; name: string }>();

    for (const faction of factions) {
      const alliance = getSingle(faction.grand_alliances);

      if (alliance) {
        map.set(alliance.stable_key, alliance);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [factions]);

  const visibleFighters = useMemo(
    () =>
      filterFighterProfiles(fighters, {
        search,
        factionKey,
        grandAllianceKey,
        runemarkKey,
        includeRetired
      }),
    [fighters, search, factionKey, grandAllianceKey, runemarkKey, includeRetired]
  );

  const selectedFighter =
    visibleFighters.find((fighter) => fighter.id === selectedFighterId) ??
    visibleFighters[0] ??
    null;

  return (
    <main className="page">
      <section className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Reference library</p>
          <h1>Warcry reference data</h1>
          <p>
            Browse versioned rules releases, factions, fighter profiles,
            weapons, and runemarks. Reference data is readable without signing in.
          </p>
        </div>
        <div className="reference-release-summary">
          <strong>{releases.length}</strong>
          <span>Rules releases</span>
        </div>
      </section>

      <section className="panel reference-filters" aria-label="Reference filters">
        <label>
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, faction, runemark"
          />
        </label>
        <label>
          Grand alliance
          <select
            value={grandAllianceKey}
            onChange={(event) => setGrandAllianceKey(event.target.value)}
          >
            <option value="">All alliances</option>
            {grandAlliances.map((alliance) => (
              <option key={alliance.stable_key} value={alliance.stable_key}>
                {alliance.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Faction
          <select value={factionKey} onChange={(event) => setFactionKey(event.target.value)}>
            <option value="">All factions</option>
            {factions.map((faction) => (
              <option key={faction.stable_key} value={faction.stable_key}>
                {faction.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Runemark
          <select value={runemarkKey} onChange={(event) => setRunemarkKey(event.target.value)}>
            <option value="">All runemarks</option>
            {runemarks.map((runemark) => (
              <option key={runemark.stable_key} value={runemark.stable_key}>
                {runemark.name}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeRetired}
            onChange={(event) => setIncludeRetired(event.target.checked)}
          />
          Include retired profiles
        </label>
      </section>

      {loading ? <p className="muted">Loading reference data.</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!loading && !error ? (
        <section className="reference-layout">
          <div className="panel">
            <h2>Fighters</h2>
            {visibleFighters.length > 0 ? (
              <div className="reference-list">
                {visibleFighters.map((fighter) => {
                  const faction = getSingle(fighter.factions);
                  const release = getSingle(fighter.rules_releases);

                  return (
                    <button
                      className="reference-row"
                      key={fighter.id}
                      type="button"
                      aria-pressed={selectedFighter?.id === fighter.id}
                      onClick={() => setSelectedFighterId(fighter.id)}
                    >
                      <span>
                        <strong>{fighter.name}</strong>
                        <small>
                          {faction?.name ?? "Unknown faction"} - {release?.name ?? "Unknown release"}
                        </small>
                      </span>
                      <span className="status-pill">{fighter.points} pts</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="muted">
                No fighter profiles match the current filters. Import reviewed reference
                data to populate this library.
              </p>
            )}
          </div>

          <FighterDetail fighter={selectedFighter} />
        </section>
      ) : null}
    </main>
  );
}

function FighterDetail({ fighter }: { fighter: FighterProfile | null }) {
  if (!fighter) {
    return (
      <HeraldPanel>
        <h2>Fighter details</h2>
        <p className="muted">Select a fighter to inspect its profile.</p>
      </HeraldPanel>
    );
  }

  const faction = getSingle(fighter.factions);
  const alliance = getSingle(faction?.grand_alliances);
  const runemarks = getFighterRunemarks(fighter);
  const weapons = fighter.weapon_profiles ?? [];

  return (
    <HeraldPanel className="reference-detail" tone="steel">
      <div>
        <p className="eyebrow">{faction?.name ?? "Unknown faction"}</p>
        <h2>{fighter.name}</h2>
        <p className="muted">{getSourceLabel(fighter)}</p>
      </div>

      <StatBlock
        stats={[
          { label: "Move", value: fighter.movement },
          { label: "Toughness", value: fighter.toughness },
          { label: "Wounds", value: fighter.wounds },
          { label: "Points", value: fighter.points }
        ]}
      />

      <div className="tag-list" aria-label="Runemarks">
        {alliance ? <RunemarkBadge tone="steel">{alliance.name}</RunemarkBadge> : null}
        {fighter.is_leader ? <RunemarkBadge tone="ember">Leader</RunemarkBadge> : null}
        {runemarks.map((runemark) => (
          <RunemarkBadge key={runemark.id}>{runemark.name}</RunemarkBadge>
        ))}
      </div>

      <LedgerTable
        caption="Weapon profiles"
        columns={["Weapon", "Range", "Attacks", "Strength", "Damage"]}
        emptyMessage="No weapon profiles imported."
        rows={weapons.map((weapon) => ({
          id: weapon.id,
          cells: [
            weapon.name,
            formatWeaponRange(weapon),
            weapon.attacks,
            weapon.strength,
            `${weapon.damage}/${weapon.critical_damage}`
          ]
        }))}
      />
    </HeraldPanel>
  );
}
