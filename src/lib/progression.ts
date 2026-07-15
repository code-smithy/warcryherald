export type WarbandProgress = {
  id: string;
  warband_id: string;
  glory: number;
  reputation: number;
  notes: string;
  updated_at: string;
};

export type ProgressionDraft = {
  glory: string;
  reputation: string;
  notes: string;
};

export type ProgressionSummary = {
  glory: number;
  reputation: number;
  notes: string;
  hasProgression: boolean;
};

export function createProgressionDraft(progress?: Partial<WarbandProgress> | null): ProgressionDraft {
  return {
    glory: String(progress?.glory ?? 0),
    reputation: String(progress?.reputation ?? 0),
    notes: progress?.notes ?? ""
  };
}

export function validateProgressionDraft(draft: ProgressionDraft) {
  const normalized = {
    glory: parseWholeNumber(draft.glory),
    reputation: parseWholeNumber(draft.reputation),
    notes: draft.notes.trim()
  };
  const errors: string[] = [];

  if (normalized.glory === null || normalized.glory < 0) {
    errors.push("Glory must be a whole number of 0 or more.");
  }

  if (normalized.reputation === null || normalized.reputation < 0) {
    errors.push("Reputation must be a whole number of 0 or more.");
  }

  if (normalized.notes.length > 2000) {
    errors.push("Progression notes must be 2000 characters or fewer.");
  }

  return { normalized, errors };
}

export function summarizeProgression(progress?: Partial<WarbandProgress> | null): ProgressionSummary {
  return {
    glory: progress?.glory ?? 0,
    reputation: progress?.reputation ?? 0,
    notes: progress?.notes ?? "",
    hasProgression: Boolean(progress)
  };
}

function parseWholeNumber(value: string) {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}
