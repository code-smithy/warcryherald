import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../src/app/AppRoutes";
import {
  buildAftermathStepPayload,
  createAftermathStepDraft,
  summarizeAftermathConsequences
} from "../src/lib/aftermath";
import {
  createBattleDraft,
  getBattleParticipantPoints,
  getEligibleBattleFighters,
  normalizeBattleResultDrafts,
  validateBattleCompletion,
  validateBattleDraft,
  type Battle,
  type BattleParticipant
} from "../src/lib/battles";
import {
  getDefaultInviteExpiresAt,
  getInviteState,
  normalizeInviteDraft,
  validateCampaignDraft
} from "../src/lib/campaigns";
import { getErrorMessage } from "../src/lib/errors";
import { normalizeProfileUpdate } from "../src/lib/profiles";
import {
  createProgressionDraft,
  summarizeProgression,
  validateProgressionDraft
} from "../src/lib/progression";
import {
  filterFighterProfiles,
  getNewestRulesRelease,
  getSourceLabel,
  sortRulesReleases,
  type FighterProfile,
  type RulesRelease
} from "../src/lib/reference-data";
import { parseOAuthCallbackParams } from "../src/lib/supabase";
import {
  validateWarbandDraft,
  getWarbandFighterPoints,
  validateWarbandFighterAddition,
  validateWarbandRoster,
  type Warband
} from "../src/lib/warbands";

function renderRoute(initialEntry: string) {
  render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <AppRoutes />
    </MemoryRouter>
  );
}

describe("Warcry Herald shell", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the project foundation home page", () => {
    renderRoute("/");

    expect(
      screen.getByRole("heading", {
        name: /track the warbands, battles, and scars/i
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^campaigns$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^reference$/i })).toBeInTheDocument();
  });

  it("shows a useful configuration error when Supabase is missing", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");

    renderRoute("/campaigns");

    expect(
      screen.getByRole("heading", { name: /supabase is not configured yet/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_URL is required/i)).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_ANON_KEY is required/i)).toBeInTheDocument();
  });

  it("exposes the reference browser as a public configured route", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");

    renderRoute("/reference");

    expect(
      screen.getByRole("heading", { name: /supabase is not configured yet/i })
    ).toBeInTheDocument();
  });

  it("rejects a Supabase REST endpoint instead of the project root", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co/rest/v1");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");

    renderRoute("/campaigns");

    expect(
      screen.getByText(/must be the Supabase project root/i)
    ).toBeInTheDocument();
  });

  it("blocks protected routes for unauthenticated users", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");

    renderRoute("/campaigns");

    expect(
      await screen.findByRole("heading", { name: /discord login is required/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/campaign features start in phase 2/i)).not.toBeInTheDocument();
  });

  it("renders a not found route", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");

    renderRoute("/missing");

    expect(
      screen.getByRole("heading", { name: /this ledger page does not exist/i })
    ).toBeInTheDocument();
  });

  it("normalizes editable profile fields only", () => {
    expect(
      normalizeProfileUpdate({
        display_name: "  Sigrun  ",
        preferred_language: "de",
        timezone: "  "
      })
    ).toEqual({
      display_name: "Sigrun",
      preferred_language: "de",
      timezone: "UTC"
    });
  });

  it("extracts messages from plain Supabase error objects", () => {
    expect(
      getErrorMessage(
        {
          message: "new row violates row-level security policy",
          details: "Failing row contains campaign data.",
          code: "42501"
        },
        "Fallback"
      )
    ).toBe(
      "new row violates row-level security policy Failing row contains campaign data. 42501"
    );

    expect(getErrorMessage(null, "Fallback")).toBe("Fallback");
  });

  it("parses Supabase OAuth callback codes from hash-router URLs", () => {
    expect(
      parseOAuthCallbackParams(
        "http://127.0.0.1:5173/#/auth/callback?code=abc123"
      )
    ).toEqual({
      code: "abc123",
      accessToken: null,
      refreshToken: null,
      error: null,
      errorDescription: null
    });

    expect(
      parseOAuthCallbackParams(
        "http://127.0.0.1:5173/#/auth/callback?error=access_denied&error_description=Denied"
      )
    ).toEqual({
      code: null,
      accessToken: null,
      refreshToken: null,
      error: "access_denied",
      errorDescription: "Denied"
    });

    expect(
      parseOAuthCallbackParams(
        "https://code-smithy.github.io/warcryherald/#/auth/callback#access_token=token123&refresh_token=refresh123&token_type=bearer"
      )
    ).toEqual({
      code: null,
      accessToken: "token123",
      refreshToken: "refresh123",
      error: null,
      errorDescription: null
    });
  });

  it("validates campaign drafts before saving", () => {
    expect(
      validateCampaignDraft({
        name: "  Ash Road  ",
        description: "  Tuesday league  ",
        status: "active"
      })
    ).toEqual({
      normalized: {
        name: "Ash Road",
        description: "Tuesday league",
        status: "active"
      },
      errors: []
    });

    expect(
      validateCampaignDraft({
        name: "No",
        description: "",
        status: "draft"
      }).errors
    ).toContain("Campaign name must be at least 3 characters.");

    expect(
      validateCampaignDraft({
        name: "Ash Road",
        description: "",
        status: "draft",
        warbandFighterMinimum: "16",
        warbandFighterLimit: "15"
      }).errors
    ).toContain("Warband fighter minimum cannot exceed the fighter limit.");
  });

  it("normalizes invitation limits and reports invalid input", () => {
    const normalized = normalizeInviteDraft({
      maxUses: " 2 ",
      expiresAt: "2026-07-15T18:30"
    });

    expect(normalized.errors).toEqual([]);
    expect(normalized.normalized.maxUses).toBe(2);
    expect(normalized.normalized.expiresAt).toMatch(/^2026-07-15T/);

    expect(
      normalizeInviteDraft({
        maxUses: "0",
        expiresAt: "not-a-date"
      }).errors
    ).toEqual([
      "Maximum uses must be a whole number greater than zero.",
      "Expiration must be a valid date and time."
    ]);
  });

  it("defaults invite expiration to one week from now", () => {
    expect(getDefaultInviteExpiresAt(new Date("2026-07-14T10:02:00"))).toBe(
      "2026-07-21T10:05"
    );
  });

  it("classifies disabled expired and exhausted invites", () => {
    expect(
      getInviteState({
        disabled_at: "2026-07-14T10:00:00.000Z",
        expires_at: null,
        max_uses: null,
        use_count: 0
      })
    ).toBe("Disabled");

    expect(
      getInviteState({
        disabled_at: null,
        expires_at: "2000-01-01T00:00:00.000Z",
        max_uses: null,
        use_count: 0
      })
    ).toBe("Expired");

    expect(
      getInviteState({
        disabled_at: null,
        expires_at: null,
        max_uses: 1,
        use_count: 1
      })
    ).toBe("Exhausted");
  });

  it("filters reference fighters by search, release state, faction, and runemark", () => {
    const fighters: FighterProfile[] = [
      makeFighter({
        id: "current",
        stable_key: "current-fighter",
        name: "Current Fighter",
        factionKey: "iron-guild",
        factionName: "Iron Guild",
        allianceKey: "order",
        allianceName: "Order",
        runemarks: [{ id: "elite", stable_key: "elite", name: "Elite", category: "fighter" }],
        releaseStatus: "current",
        is_current: true
      }),
      makeFighter({
        id: "retired",
        stable_key: "retired-fighter",
        name: "Retired Fighter",
        factionKey: "ash-tribe",
        factionName: "Ash Tribe",
        allianceKey: "chaos",
        allianceName: "Chaos",
        runemarks: [],
        releaseStatus: "retired",
        is_current: false
      })
    ];

    expect(
      filterFighterProfiles(fighters, {
        search: "elite",
        factionKey: "iron-guild",
        grandAllianceKey: "order",
        runemarkKey: "elite",
        includeRetired: false
      }).map((fighter) => fighter.id)
    ).toEqual(["current"]);

    expect(
      filterFighterProfiles(fighters, {
        search: "",
        factionKey: "",
        grandAllianceKey: "",
        runemarkKey: "",
        includeRetired: true
      }).map((fighter) => fighter.id)
    ).toEqual(["current", "retired"]);
  });

  it("shows source release and document labels for reference fighters", () => {
    expect(
      getSourceLabel(
        makeFighter({
          id: "fighter",
          stable_key: "fighter",
          name: "Fighter",
          source_page: "12"
        })
      )
    ).toBe("Example Release - Example Source, p. 12");
  });

  it("validates warband drafts before creation", () => {
    expect(
      validateWarbandDraft({
        name: "  Ember Pact  ",
        factionId: "faction"
      })
    ).toEqual({
      normalized: {
        name: "Ember Pact",
        factionId: "faction"
      },
      errors: []
    });

    expect(validateWarbandDraft({ name: "A", factionId: "" }).errors).toEqual([
      "Warband name must be at least 2 characters.",
      "Choose a faction for this warband."
    ]);
  });

  it("prefers the newest current rules release as the default", () => {
    const releases = [
      makeRulesRelease({ id: "new-draft", status: "draft", release_date: "2026-07-14" }),
      makeRulesRelease({ id: "old-current", status: "current", release_date: "2025-01-01" }),
      makeRulesRelease({ id: "new-current", status: "current", release_date: "2026-01-01" })
    ];

    expect(sortRulesReleases(releases).map((release) => release.id)).toEqual([
      "new-current",
      "old-current",
      "new-draft"
    ]);
    expect(getNewestRulesRelease(releases)?.id).toBe("new-current");
  });

  it("validates battle-ready warband roster requirements", () => {
    const invalid = makeWarband({
      points_limit: 100,
      fighter_limit: 1,
      warband_fighters: [
        makeWarbandFighter({ id: "one", name: "Ash", points: 75, is_leader: false }),
        makeWarbandFighter({ id: "two", name: "Ash", points: 75, is_leader: false })
      ]
    });

    expect(validateWarbandRoster(invalid)).toMatchObject({
      valid: false,
      totalPoints: 150,
      fighterCount: 2,
      errors: [
        { code: "missing-leader" },
        { code: "points-limit" },
        { code: "fighter-limit" }
      ],
      warnings: [{ code: "duplicate-name" }]
    });

    expect(
      validateWarbandRoster(
        makeWarband({
          fighter_minimum: 2,
          warband_fighters: [
            makeWarbandFighter({ id: "leader", name: "Kara", points: 145, is_leader: true })
          ]
        })
      ).errors
    ).toContainEqual({ code: "missing-fighters", message: "Add at least 2 active fighters." });

    const valid = makeWarband({
      warband_fighters: [
        makeWarbandFighter({ id: "leader", name: "Kara", points: 145, is_leader: true }),
        makeWarbandFighter({ id: "fighter", name: "Morn", points: 80, is_leader: false })
      ]
    });

    expect(validateWarbandRoster(valid)).toMatchObject({
      valid: true,
      totalPoints: 225,
      fighterCount: 2,
      errors: [],
      warnings: []
    });
  });

  it("falls back to fighter profile points when snapshots are unavailable", () => {
    expect(
      validateWarbandRoster(
        makeWarband({
          warband_fighters: [
            makeWarbandFighter({
              id: "fighter",
              name: "Morn",
              points: 80,
              is_leader: false,
              includeSnapshot: false
            })
          ]
        })
      ).totalPoints
    ).toBe(80);

    expect(
      getWarbandFighterPoints(
        makeWarbandFighter({
          id: "fighter",
          name: "Morn",
          points: 80,
          is_leader: false,
          includeSnapshot: false
        })
      )
    ).toBe(80);
  });

  it("validates fighter additions against roster limits", () => {
    const warband = makeWarband({
      points_limit: 200,
      fighter_limit: 2,
      warband_fighters: [
        makeWarbandFighter({ id: "leader", name: "Kara", points: 145, is_leader: true }),
        makeWarbandFighter({ id: "fighter", name: "Morn", points: 40, is_leader: false })
      ]
    });

    expect(validateWarbandFighterAddition(warband, { points: 30 })).toEqual([
      { code: "fighter-limit", message: "Roster already has the maximum of 2 active fighters." },
      {
        code: "points-limit",
        message: "Adding this fighter would put the roster 15 points over the limit."
      }
    ]);
  });

});

function makeFighter(
  overrides: Partial<FighterProfile> & {
    factionKey?: string;
    factionName?: string;
    allianceKey?: string;
    allianceName?: string;
    releaseStatus?: "draft" | "current" | "retired";
    runemarks?: Array<{ id: string; stable_key: string; name: string; category: string }>;
  }
): FighterProfile {
  const runemarks = overrides.runemarks ?? [];

  return {
    id: overrides.id ?? "fighter",
    stable_key: overrides.stable_key ?? "fighter",
    name: overrides.name ?? "Fighter",
    movement: overrides.movement ?? 4,
    toughness: overrides.toughness ?? 4,
    wounds: overrides.wounds ?? 10,
    points: overrides.points ?? 100,
    base_size_mm: overrides.base_size_mm ?? null,
    is_leader: overrides.is_leader ?? false,
    is_current: overrides.is_current ?? true,
    source_page: overrides.source_page ?? null,
    factions: {
      id: "faction",
      stable_key: overrides.factionKey ?? "example-faction",
      name: overrides.factionName ?? "Example Faction",
      grand_alliances: {
        id: "alliance",
        stable_key: overrides.allianceKey ?? "example-alliance",
        name: overrides.allianceName ?? "Example Alliance"
      }
    },
    rules_releases: {
      id: "release",
      stable_key: "example-release",
      name: "Example Release",
      release_date: "2026-07-14",
      language: "en",
      status: overrides.releaseStatus ?? "current",
      source_url: null,
      source_documents: {
        title: "Example Source",
        source_url: null
      }
    },
    weapon_profiles: [],
    fighter_profile_runemarks: runemarks.map((runemark) => ({ runemarks: runemark })),
    ...overrides
  };
}

describe("warband progression helpers", () => {
  it("normalizes valid progression drafts", () => {
    expect(
      validateProgressionDraft({
        glory: " 3 ",
        reputation: "2",
        notes: "  Won a convergence. "
      })
    ).toEqual({
      normalized: { glory: 3, reputation: 2, notes: "Won a convergence." },
      errors: []
    });
  });

  it("rejects invalid progression totals and long notes", () => {
    expect(
      validateProgressionDraft({
        glory: "-1",
        reputation: "1.5",
        notes: "x".repeat(2001)
      }).errors
    ).toEqual([
      "Glory must be a whole number of 0 or more.",
      "Reputation must be a whole number of 0 or more.",
      "Progression notes must be 2000 characters or fewer."
    ]);
  });

  it("creates dashboard-friendly progression summaries", () => {
    expect(createProgressionDraft(null)).toEqual({
      glory: "0",
      reputation: "0",
      notes: ""
    });
    expect(summarizeProgression({ glory: 4, reputation: 1, notes: "Hidden camp" })).toEqual({
      glory: 4,
      reputation: 1,
      notes: "Hidden camp",
      hasProgression: true
    });
  });
});

describe("battle helpers", () => {
  it("creates and validates battle drafts", () => {
    expect(createBattleDraft(new Date("2026-07-16T08:02:00")).scheduledAt).toBe(
      "2026-07-16T08:15"
    );

    expect(
      validateBattleDraft({
        battleplanName: "  The Prize  ",
        locationName: "  Gnarlwood  ",
        scheduledAt: "2026-07-16T19:00",
        notes: "  Rival claimants. "
      })
    ).toEqual({
      normalized: {
        battleplanName: "The Prize",
        locationName: "Gnarlwood",
        scheduledAt: "2026-07-16T19:00",
        notes: "Rival claimants."
      },
      errors: []
    });

    expect(
      validateBattleDraft({
        battleplanName: "x".repeat(121),
        locationName: "x".repeat(121),
        scheduledAt: "not-a-date",
        notes: "x".repeat(2001)
      }).errors
    ).toEqual([
      "Battleplan name must be 120 characters or fewer.",
      "Location name must be 120 characters or fewer.",
      "Scheduled time must be a valid date and time.",
      "Battle notes must be 2000 characters or fewer."
    ]);
  });

  it("normalizes battle results and validates completion", () => {
    expect(
      normalizeBattleResultDrafts([
        { participantId: "one", result: "winner", score: " 3 ", notes: " Claimed objective. " },
        { participantId: "two", result: "loss", score: "", notes: "" }
      ])
    ).toEqual({
      normalized: [
        { participantId: "one", result: "winner", score: 3, notes: "Claimed objective." },
        { participantId: "two", result: "loss", score: 0, notes: "" }
      ],
      errors: []
    });

    expect(
      normalizeBattleResultDrafts([
        { participantId: "one", result: "winner", score: "-1", notes: "" }
      ]).errors
    ).toEqual(["Participant scores must be whole numbers of 0 or more."]);

    expect(validateBattleCompletion(makeBattle({ battle_participants: [] })).errors).toEqual([
      "Add at least one participating warband before completing the battle."
    ]);

    expect(
      validateBattleCompletion(
        makeBattle({
          battle_participants: [makeBattleParticipant({ id: "one", result: "unknown" })]
        })
      ).errors
    ).toEqual(["Record a result for every participating warband before completing the battle."]);

    expect(
      validateBattleCompletion(
        makeBattle({
          battle_participants: [makeBattleParticipant({ id: "one", result: "draw" })]
        })
      ).valid
    ).toBe(true);
  });

  it("summarizes selected fighter points and filters unavailable fighters", () => {
    const active = makeWarbandFighter({ id: "active", name: "Kara", points: 145, is_leader: true });
    const recovering = {
      ...makeWarbandFighter({ id: "recovering", name: "Morn", points: 80, is_leader: false }),
      status: "recovering" as const
    };
    const selected = makeWarbandFighter({ id: "selected", name: "Ash", points: 65, is_leader: false });
    const participant = makeBattleParticipant({
      id: "participant",
      battle_fighters: [
        { id: "bf-selected", warband_fighter_id: selected.id, points: 65 },
        { id: "bf-extra", warband_fighter_id: "extra", points: 40 }
      ]
    });
    const warband = makeWarband({ warband_fighters: [active, recovering, selected] });

    expect(getBattleParticipantPoints(participant)).toBe(105);
    expect(getEligibleBattleFighters(participant, warband, false).map((fighter) => fighter.id)).toEqual([
      "active"
    ]);
    expect(getEligibleBattleFighters(participant, warband, true).map((fighter) => fighter.id)).toEqual([
      "active",
      "recovering"
    ]);
  });
});

describe("aftermath helpers", () => {
  it("builds confirmed aftermath consequences from manual entries", () => {
    const fighter = makeBattleParticipant({
      id: "participant",
      battle_fighters: [{ id: "battle-fighter", warband_fighter_id: "fighter", name: "Kara" }]
    }).battle_fighters![0];

    const payload = buildAftermathStepPayload(
      {
        diceResult: "  6, 4  ",
        notes: "  Claimed the relic. ",
        gloryDelta: "2",
        reputationDelta: "-1",
        fighterChanges: {
          fighter: {
            renownDelta: "1",
            status: "recovering",
            injuryName: "Gouged arm",
            injuryDescription: "Misses the next battle."
          }
        }
      },
      [fighter]
    );

    expect(payload.input).toEqual({
      diceResult: "6, 4",
      notes: "Claimed the relic."
    });
    expect(payload.consequences).toMatchObject({
      gloryDelta: 2,
      reputationDelta: -1,
      renown: [{ fighterId: "fighter", delta: 1, name: "Kara" }],
      fighterStatuses: [{ fighterId: "fighter", status: "recovering", name: "Kara" }],
      injuries: [
        {
          fighterId: "fighter",
          name: "Gouged arm",
          description: "Misses the next battle."
        }
      ]
    });
    expect(summarizeAftermathConsequences(payload.consequences)).toBe(
      "Glory +2, Reputation -1, 1 renown change, 1 fighter status change, 1 injury"
    );
  });

  it("rejects invalid aftermath number drafts", () => {
    expect(() =>
      buildAftermathStepPayload(
        {
          ...createAftermathStepDraft(null),
          gloryDelta: "1.5"
        },
        []
      )
    ).toThrow("Glory change must be a whole number.");
  });
});

function makeRulesRelease(overrides: Partial<RulesRelease>): RulesRelease {
  return {
    id: "release",
    stable_key: "release",
    name: "Release",
    release_date: "2026-07-14",
    language: "en",
    status: "current",
    source_url: null,
    ...overrides
  };
}

function makeWarband(overrides: Partial<Warband>): Warband {
  return {
    id: "warband",
    campaign_id: "campaign",
    owner_id: "owner",
    rules_release_id: "release",
    faction_id: "faction",
    name: "Example Warband",
    status: "draft",
    points_limit: 1000,
    fighter_minimum: 1,
    fighter_limit: 15,
    created_at: "2026-07-14T00:00:00.000Z",
    updated_at: "2026-07-14T00:00:00.000Z",
    warband_fighters: [],
    ...overrides
  };
}

function makeWarbandFighter({
  id,
  name,
  points,
  is_leader,
  includeSnapshot = true
}: {
  id: string;
  name: string;
  points: number;
  is_leader: boolean;
  includeSnapshot?: boolean;
}): NonNullable<Warband["warband_fighters"]>[number] {
  return {
    id,
    warband_id: "warband",
    fighter_profile_snapshot_id: `${id}-snapshot`,
    fighter_profile_id: `${id}-profile`,
    name,
    status: "active",
    is_leader,
    sort_order: 0,
    created_at: "2026-07-14T00:00:00.000Z",
    updated_at: "2026-07-14T00:00:00.000Z",
    fighter_profiles: {
      id: `${id}-profile`,
      name: `${name} Profile`,
      movement: 4,
      toughness: 4,
      wounds: 10,
      points,
      is_leader
    },
    fighter_profile_snapshots: includeSnapshot ? {
      id: `${id}-snapshot`,
      fighter_profile_id: `${id}-profile`,
      rules_release_id: "release",
      faction_id: "faction",
      stable_key: `${id}-profile`,
      name: `${name} Profile`,
      movement: 4,
      toughness: 4,
      wounds: 10,
      points,
      base_size_mm: null,
      is_leader,
      weapons: [],
      runemarks: [],
      captured_at: "2026-07-14T00:00:00.000Z"
    } : null
  };
}

function makeBattle(overrides: Partial<Battle>): Battle {
  return {
    id: "battle",
    campaign_id: "campaign",
    status: "draft",
    battleplan_name: "The Prize",
    location_name: "Gnarlwood",
    scheduled_at: null,
    played_at: null,
    notes: "",
    confirmed_at: null,
    created_by: "user",
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
    battle_participants: [],
    battle_events: [],
    ...overrides
  };
}

function makeBattleParticipant(
  overrides: Omit<Partial<BattleParticipant>, "battle_fighters"> & {
    battle_fighters?: Array<Partial<NonNullable<BattleParticipant["battle_fighters"]>[number]>>;
  }
): BattleParticipant {
  const { battle_fighters, ...rest } = overrides;

  return {
    id: overrides.id ?? "participant",
    battle_id: "battle",
    warband_id: "warband",
    result: overrides.result ?? "unknown",
    score: overrides.score ?? 0,
    notes: overrides.notes ?? "",
    confirmed_at: overrides.confirmed_at ?? null,
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
    ...rest,
    battle_fighters: (battle_fighters ?? []).map((fighter, index) => ({
      id: fighter.id ?? `battle-fighter-${index}`,
      battle_id: "battle",
      battle_participant_id: overrides.id ?? "participant",
      warband_fighter_id: fighter.warband_fighter_id ?? `fighter-${index}`,
      fighter_profile_snapshot_id: "snapshot",
      name: fighter.name ?? `Fighter ${index}`,
      status_at_battle: fighter.status_at_battle ?? "active",
      is_leader: fighter.is_leader ?? false,
      points: fighter.points ?? 0,
      outcome: fighter.outcome ?? "unharmed",
      casualty_notes: fighter.casualty_notes ?? "",
      created_at: "2026-07-16T00:00:00.000Z",
      updated_at: "2026-07-16T00:00:00.000Z"
    }))
  };
}
