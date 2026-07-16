import type { SupabaseClient } from "@supabase/supabase-js";
import type { BattleFighter } from "./battles";
import type { WarbandFighterStatus } from "./warbands";

export type AftermathStepKey =
  | "award_glory"
  | "resolve_injuries"
  | "resolve_renown"
  | "update_quest"
  | "exploration"
  | "manage_warband"
  | "encampment_check"
  | "review";

export type AftermathSessionStatus = "pending" | "in_progress" | "completed";
export type AftermathStepStatus = "pending" | "completed" | "reopened";

export type AftermathFighterChangeDraft = {
  renownDelta: string;
  status: WarbandFighterStatus | "";
  injuryName: string;
  injuryDescription: string;
};

export type AftermathStepDraft = {
  diceResult: string;
  notes: string;
  gloryDelta: string;
  reputationDelta: string;
  fighterChanges: Record<string, AftermathFighterChangeDraft>;
};

export type AftermathStep = {
  id: string;
  aftermath_session_id: string;
  step_key: AftermathStepKey;
  position: number;
  status: AftermathStepStatus;
  instructions: string;
  input: Record<string, unknown>;
  consequences: Record<string, unknown>;
  completed_by: string | null;
  completed_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  correction_reason: string;
  created_at: string;
  updated_at: string;
};

export type AftermathSession = {
  id: string;
  battle_id: string;
  battle_participant_id: string;
  warband_id: string;
  status: AftermathSessionStatus;
  completed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  aftermath_steps?: AftermathStep[];
};

export const aftermathStepOrder: AftermathStepKey[] = [
  "award_glory",
  "resolve_injuries",
  "resolve_renown",
  "update_quest",
  "exploration",
  "manage_warband",
  "encampment_check",
  "review"
];

export const aftermathStepLabels: Record<AftermathStepKey, string> = {
  award_glory: "Award glory",
  resolve_injuries: "Resolve injuries",
  resolve_renown: "Resolve renown",
  update_quest: "Update quest",
  exploration: "Exploration",
  manage_warband: "Manage warband",
  encampment_check: "Encampment check",
  review: "Review"
};

export const aftermathStepInstructions: Record<AftermathStepKey, string> = {
  award_glory: "Enter the glory and reputation changes earned after the battle.",
  resolve_injuries: "Record injury rolls, lasting injuries, deaths, missing fighters, or recoveries.",
  resolve_renown: "Enter renown changes for fighters that earned advancement.",
  update_quest: "Record quest progress or completion notes that should be visible in the session log.",
  exploration: "Enter exploration dice and any rewards that change warband totals.",
  manage_warband: "Record recruitment, retirement, or other roster decisions handled after the battle.",
  encampment_check: "Record encampment checks or notes for administrator follow-up.",
  review: "Confirm that all prior aftermath decisions are correct."
};

export function getSortedAftermathSteps(session: Pick<AftermathSession, "aftermath_steps">) {
  return [...(session.aftermath_steps ?? [])].sort(
    (left, right) => left.position - right.position || left.step_key.localeCompare(right.step_key)
  );
}

export function getCurrentAftermathStep(session: Pick<AftermathSession, "aftermath_steps">) {
  return getSortedAftermathSteps(session).find((step) => step.status !== "completed") ?? null;
}

export function createAftermathStepDraft(
  step?: Pick<AftermathStep, "input" | "consequences"> | null
): AftermathStepDraft {
  const input = step?.input ?? {};
  const consequences = step?.consequences ?? {};

  return {
    diceResult: typeof input.diceResult === "string" ? input.diceResult : "",
    notes: typeof input.notes === "string" ? input.notes : "",
    gloryDelta: String(numberFromRecord(consequences, "gloryDelta")),
    reputationDelta: String(numberFromRecord(consequences, "reputationDelta")),
    fighterChanges: {}
  };
}

export function createEmptyFighterChangeDraft(): AftermathFighterChangeDraft {
  return {
    renownDelta: "0",
    status: "",
    injuryName: "",
    injuryDescription: ""
  };
}

export function validateAftermathStepDraft(draft: AftermathStepDraft) {
  const errors: string[] = [];
  const gloryDelta = parseIntegerDraft(draft.gloryDelta);
  const reputationDelta = parseIntegerDraft(draft.reputationDelta);

  if (gloryDelta === null) {
    errors.push("Glory change must be a whole number.");
  }

  if (reputationDelta === null) {
    errors.push("Reputation change must be a whole number.");
  }

  if (draft.diceResult.trim().length > 120) {
    errors.push("Dice result must be 120 characters or fewer.");
  }

  if (draft.notes.trim().length > 2000) {
    errors.push("Aftermath notes must be 2000 characters or fewer.");
  }

  for (const change of Object.values(draft.fighterChanges)) {
    if (parseIntegerDraft(change.renownDelta) === null) {
      errors.push("Renown changes must be whole numbers.");
      break;
    }

    if (change.injuryName.trim().length > 120) {
      errors.push("Injury names must be 120 characters or fewer.");
      break;
    }

    if (change.injuryDescription.trim().length > 1000) {
      errors.push("Injury descriptions must be 1000 characters or fewer.");
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

export function buildAftermathStepPayload(
  draft: AftermathStepDraft,
  battleFighters: BattleFighter[]
) {
  const validation = validateAftermathStepDraft(draft);

  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const gloryDelta = parseIntegerDraft(draft.gloryDelta) ?? 0;
  const reputationDelta = parseIntegerDraft(draft.reputationDelta) ?? 0;
  const renown = [];
  const fighterStatuses = [];
  const injuries = [];

  for (const fighter of battleFighters) {
    const change = draft.fighterChanges[fighter.warband_fighter_id];

    if (!change) {
      continue;
    }

    const renownDelta = parseIntegerDraft(change.renownDelta) ?? 0;

    if (renownDelta !== 0) {
      renown.push({
        fighterId: fighter.warband_fighter_id,
        delta: renownDelta,
        name: fighter.name
      });
    }

    if (change.status) {
      fighterStatuses.push({
        fighterId: fighter.warband_fighter_id,
        status: change.status,
        name: fighter.name
      });
    }

    if (change.injuryName.trim()) {
      injuries.push({
        fighterId: fighter.warband_fighter_id,
        name: change.injuryName.trim(),
        description: change.injuryDescription.trim()
      });
    }
  }

  return {
    input: {
      diceResult: draft.diceResult.trim(),
      notes: draft.notes.trim()
    },
    consequences: {
      gloryDelta,
      reputationDelta,
      renown,
      fighterStatuses,
      injuries
    }
  };
}

export function summarizeAftermathConsequences(consequences: Record<string, unknown>) {
  const parts: string[] = [];
  const gloryDelta = numberFromRecord(consequences, "gloryDelta");
  const reputationDelta = numberFromRecord(consequences, "reputationDelta");
  const renown = arrayFromRecord(consequences, "renown");
  const fighterStatuses = arrayFromRecord(consequences, "fighterStatuses");
  const injuries = arrayFromRecord(consequences, "injuries");

  if (gloryDelta !== 0) {
    parts.push(`Glory ${formatSigned(gloryDelta)}`);
  }

  if (reputationDelta !== 0) {
    parts.push(`Reputation ${formatSigned(reputationDelta)}`);
  }

  if (renown.length > 0) {
    parts.push(`${renown.length} renown change${renown.length === 1 ? "" : "s"}`);
  }

  if (fighterStatuses.length > 0) {
    parts.push(`${fighterStatuses.length} fighter status change${fighterStatuses.length === 1 ? "" : "s"}`);
  }

  if (injuries.length > 0) {
    parts.push(`${injuries.length} injur${injuries.length === 1 ? "y" : "ies"}`);
  }

  return parts.length > 0 ? parts.join(", ") : "No applied record changes.";
}

export async function initializeAftermathSessions(client: SupabaseClient, battleId: string) {
  const { error } = await client.rpc("initialize_aftermath_sessions", {
    target_battle_id: battleId
  });

  if (error) {
    throw error;
  }
}

export async function completeAftermathStep(
  client: SupabaseClient,
  stepId: string,
  draft: AftermathStepDraft,
  battleFighters: BattleFighter[]
) {
  const payload = buildAftermathStepPayload(draft, battleFighters);
  const { data, error } = await client.rpc("complete_aftermath_step", {
    target_step_id: stepId,
    step_input: payload.input,
    step_consequences: payload.consequences
  });

  if (error) {
    throw error;
  }

  return data as AftermathStep;
}

export async function reopenAftermathStep(
  client: SupabaseClient,
  stepId: string,
  correctionReason: string
) {
  const { data, error } = await client.rpc("reopen_aftermath_step", {
    target_step_id: stepId,
    correction_reason: correctionReason.trim()
  });

  if (error) {
    throw error;
  }

  return data as AftermathStep;
}

function parseIntegerDraft(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return 0;
  }

  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function arrayFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
