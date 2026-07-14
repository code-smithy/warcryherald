import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignStatus = "draft" | "active" | "completed" | "archived";
export type CampaignMemberRole = "owner" | "campaign_admin" | "player";

export type Campaign = {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CampaignMember = {
  campaign_id: string;
  user_id: string;
  role: CampaignMemberRole;
  joined_at: string;
  updated_at: string;
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
    discord_user_id: string | null;
  } | null;
};

export type CampaignInvite = {
  id: string;
  campaign_id: string;
  token: string;
  created_by: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignDraft = {
  name: string;
  description: string;
  status: CampaignStatus;
};

export type InviteDraft = {
  maxUses: string;
  expiresAt: string;
};

export const campaignStatusLabels: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  archived: "Archived"
};

export const campaignRoleLabels: Record<CampaignMemberRole, string> = {
  owner: "Owner",
  campaign_admin: "Campaign admin",
  player: "Player"
};

export function normalizeCampaignDraft(draft: CampaignDraft): CampaignDraft {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    status: draft.status
  };
}

export function validateCampaignDraft(draft: CampaignDraft) {
  const normalized = normalizeCampaignDraft(draft);
  const errors: string[] = [];

  if (normalized.name.length < 3) {
    errors.push("Campaign name must be at least 3 characters.");
  }

  if (normalized.name.length > 80) {
    errors.push("Campaign name must be 80 characters or fewer.");
  }

  if (normalized.description.length > 2000) {
    errors.push("Campaign description must be 2000 characters or fewer.");
  }

  return { normalized, errors };
}

export function normalizeInviteDraft(draft: InviteDraft) {
  const maxUsesText = draft.maxUses.trim();
  const maxUses = maxUsesText ? Number(maxUsesText) : null;
  const expiresAtText = draft.expiresAt.trim();
  const errors: string[] = [];

  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    errors.push("Maximum uses must be a whole number greater than zero.");
  }

  if (expiresAtText && Number.isNaN(Date.parse(expiresAtText))) {
    errors.push("Expiration must be a valid date and time.");
  }

  const expiresAt =
    expiresAtText && errors.length === 0 ? new Date(expiresAtText).toISOString() : null;

  return { normalized: { maxUses, expiresAt }, errors };
}

export function getInviteState(invite: Pick<CampaignInvite, "disabled_at" | "expires_at" | "max_uses" | "use_count">) {
  if (invite.disabled_at) {
    return "Disabled";
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
    return "Expired";
  }

  if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
    return "Exhausted";
  }

  return "Open";
}

export function getCampaignJoinUrl(token: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = base ? `${base}/` : "/";

  return `${window.location.origin}${path}#/join/${token}`;
}

export async function listCampaigns(client: SupabaseClient) {
  const { data, error } = await client
    .from("campaigns")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as Campaign[];
}

export async function createCampaign(
  client: SupabaseClient,
  draft: CampaignDraft
) {
  const { normalized, errors } = validateCampaignDraft(draft);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  const { data, error } = await client.rpc("create_campaign", {
    campaign_name: normalized.name,
    campaign_description: normalized.description,
    campaign_status: normalized.status
  });

  if (error) {
    throw error;
  }

  return data as Campaign;
}

export async function getCampaign(client: SupabaseClient, campaignId: string) {
  const { data, error } = await client
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (error) {
    throw error;
  }

  return data as Campaign;
}

export async function updateCampaign(
  client: SupabaseClient,
  campaignId: string,
  draft: CampaignDraft
) {
  const { normalized, errors } = validateCampaignDraft(draft);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  const { data, error } = await client
    .from("campaigns")
    .update(normalized)
    .eq("id", campaignId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Campaign;
}

export async function archiveCampaign(client: SupabaseClient, campaignId: string) {
  const { data, error } = await client
    .from("campaigns")
    .update({ status: "archived" })
    .eq("id", campaignId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Campaign;
}

export async function listCampaignMembers(client: SupabaseClient, campaignId: string) {
  const { data, error } = await client
    .from("campaign_members")
    .select("*, profiles(display_name, avatar_url, discord_user_id)")
    .eq("campaign_id", campaignId)
    .order("joined_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as CampaignMember[];
}

export async function updateCampaignMemberRole(
  client: SupabaseClient,
  campaignId: string,
  userId: string,
  role: Exclude<CampaignMemberRole, "owner">
) {
  const { error } = await client
    .from("campaign_members")
    .update({ role })
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function removeCampaignMember(
  client: SupabaseClient,
  campaignId: string,
  userId: string
) {
  const { error } = await client
    .from("campaign_members")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function listCampaignInvites(client: SupabaseClient, campaignId: string) {
  const { data, error } = await client
    .from("campaign_invites")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as CampaignInvite[];
}

export async function createCampaignInvite(
  client: SupabaseClient,
  campaignId: string,
  draft: InviteDraft,
  userId: string
) {
  const { normalized, errors } = normalizeInviteDraft(draft);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  const { data, error } = await client
    .from("campaign_invites")
    .insert({
      campaign_id: campaignId,
      created_by: userId,
      max_uses: normalized.maxUses,
      expires_at: normalized.expiresAt
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as CampaignInvite;
}

export async function deactivateCampaignInvite(
  client: SupabaseClient,
  inviteId: string
) {
  const { error } = await client
    .from("campaign_invites")
    .update({ disabled_at: new Date().toISOString() })
    .eq("id", inviteId);

  if (error) {
    throw error;
  }
}

export async function acceptCampaignInvite(client: SupabaseClient, token: string) {
  const { data, error } = await client.rpc("accept_campaign_invite", {
    invite_token: token
  });

  if (error) {
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;

  if (!result || typeof result.campaign_id !== "string") {
    throw new Error("Campaign invitation did not return a campaign.");
  }

  return result as { campaign_id: string; role: CampaignMemberRole };
}
