import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotEnv();

const requiredEnv = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "PHASE2_USER_A_ACCESS_TOKEN",
  "PHASE2_USER_B_ACCESS_TOKEN"
];

const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const supabaseUrl = normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL);
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const userAToken = process.env.PHASE2_USER_A_ACCESS_TOKEN;
const userBToken = process.env.PHASE2_USER_B_ACCESS_TOKEN;
const userAId = getJwtSub(userAToken);
const userBId = getJwtSub(userBToken);
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

const results = [];

await check("profiles table is available to authenticated users", async () => {
  await request("GET", "/profiles?select=id&limit=1", userAToken);
});

const campaignA = await check("user A can create a campaign and becomes owner", async () => {
  const campaign = await rpc("create_campaign", userAToken, {
    campaign_name: `Phase 2 verification ${runId}`,
    campaign_description: "Temporary campaign created by scripts/verify-phase2.mjs.",
    campaign_status: "draft"
  });
  const row = Array.isArray(campaign) ? campaign[0] : campaign;

  if (!row?.id) {
    throw new Error("create_campaign did not return a campaign id.");
  }

  const members = await request(
    "GET",
    `/campaign_members?select=role&campaign_id=eq.${row.id}&user_id=eq.${userAId}`,
    userAToken
  );

  if (members[0]?.role !== "owner") {
    throw new Error("campaign creator was not inserted as owner.");
  }

  return row;
});

await check("a non-member cannot read campaign data", async () => {
  const rows = await request(
    "GET",
    `/campaigns?select=id&id=eq.${campaignA.id}`,
    userBToken
  );

  if (rows.length !== 0) {
    throw new Error("non-member read returned campaign rows.");
  }
});

await check("a non-member cannot create campaign invites", async () => {
  await expectFailure(() =>
    request("POST", "/campaign_invites", userBToken, {
      campaign_id: campaignA.id,
      created_by: userBId,
      max_uses: 1
    })
  );
});

const openInvite = await check("campaign owner can create an invite", async () => {
  const rows = await request(
    "POST",
    "/campaign_invites?select=*",
    userAToken,
    {
      campaign_id: campaignA.id,
      created_by: userAId,
      max_uses: 2
    },
    { Prefer: "return=representation" }
  );

  if (!rows[0]?.token) {
    throw new Error("invite creation did not return a token.");
  }

  return rows[0];
});

await check("a second user can join through an open invite", async () => {
  await rpc("accept_campaign_invite", userBToken, {
    invite_token: openInvite.token
  });

  const rows = await request(
    "GET",
    `/campaign_members?select=role&campaign_id=eq.${campaignA.id}&user_id=eq.${userBId}`,
    userBToken
  );

  if (rows[0]?.role !== "player") {
    throw new Error("joined user was not inserted as player.");
  }
});

await check("the same user cannot join the same campaign twice", async () => {
  await expectFailure(() =>
    rpc("accept_campaign_invite", userBToken, {
      invite_token: openInvite.token
    })
  );
});

await check("a player cannot self-promote", async () => {
  await expectFailure(() =>
    request(
      "PATCH",
      `/campaign_members?campaign_id=eq.${campaignA.id}&user_id=eq.${userBId}`,
      userBToken,
      { role: "campaign_admin" }
    )
  );
});

await check("campaign owner can promote a player to campaign administrator", async () => {
  await request(
    "PATCH",
    `/campaign_members?campaign_id=eq.${campaignA.id}&user_id=eq.${userBId}`,
    userAToken,
    { role: "campaign_admin" }
  );

  const rows = await request(
    "GET",
    `/campaign_members?select=role&campaign_id=eq.${campaignA.id}&user_id=eq.${userBId}`,
    userAToken
  );

  if (rows[0]?.role !== "campaign_admin") {
    throw new Error("player was not promoted to campaign administrator.");
  }
});

await check("campaign administrator can create invites", async () => {
  const rows = await request(
    "POST",
    "/campaign_invites?select=id",
    userBToken,
    {
      campaign_id: campaignA.id,
      created_by: userBId,
      max_uses: 1
    },
    { Prefer: "return=representation" }
  );

  if (!rows[0]?.id) {
    throw new Error("campaign administrator invite creation did not return an id.");
  }
});

await check("disabled invites are rejected", async () => {
  const invite = await createInvite({
    campaign_id: campaignA.id,
    created_by: userAId,
    disabled_at: new Date().toISOString()
  });

  await expectFailure(() =>
    rpc("accept_campaign_invite", userAToken, {
      invite_token: invite.token
    })
  );
});

await check("expired invites are rejected", async () => {
  const invite = await createInvite({
    campaign_id: campaignA.id,
    created_by: userAId,
    expires_at: "2000-01-01T00:00:00.000Z"
  });

  await expectFailure(() =>
    rpc("accept_campaign_invite", userAToken, {
      invite_token: invite.token
    })
  );
});

await check("exhausted invites are rejected", async () => {
  const invite = await createInvite({
    campaign_id: campaignA.id,
    created_by: userAId,
    max_uses: 1,
    use_count: 1
  });

  await expectFailure(() =>
    rpc("accept_campaign_invite", userAToken, {
      invite_token: invite.token
    })
  );
});

await check("the sole owner cannot leave or be removed", async () => {
  await expectFailure(() =>
    request(
      "DELETE",
      `/campaign_members?campaign_id=eq.${campaignA.id}&user_id=eq.${userAId}`,
      userAToken
    )
  );
});

const campaignB = await check("campaign switching does not leak data", async () => {
  const campaign = await rpc("create_campaign", userBToken, {
    campaign_name: `Phase 2 isolation ${runId}`,
    campaign_description: "Temporary isolation campaign created by scripts/verify-phase2.mjs.",
    campaign_status: "draft"
  });
  const row = Array.isArray(campaign) ? campaign[0] : campaign;
  const rows = await request("GET", `/campaigns?select=id&id=eq.${row.id}`, userAToken);

  if (rows.length !== 0) {
    throw new Error("user A could read user B's unrelated campaign.");
  }

  return row;
});

await check("campaign owner can permanently delete a campaign", async () => {
  await rpc("delete_campaign", userAToken, {
    target_campaign_id: campaignA.id
  });

  const rows = await request("GET", `/campaigns?select=id&id=eq.${campaignA.id}`, userAToken);

  if (rows.length !== 0) {
    throw new Error("deleted campaign was still visible to the owner.");
  }
});

await check("isolation campaign owner can clean up their campaign", async () => {
  await rpc("delete_campaign", userBToken, {
    target_campaign_id: campaignB.id
  });
});

console.log(`\nPhase 2 verification passed: ${results.length} checks.`);

async function createInvite(body) {
  const rows = await request("POST", "/campaign_invites?select=*", userAToken, body, {
    Prefer: "return=representation"
  });

  if (!rows[0]?.token) {
    throw new Error("invite creation did not return a token.");
  }

  return rows[0];
}

async function check(label, fn) {
  try {
    const value = await fn();
    results.push(label);
    console.log(`ok - ${label}`);
    return value;
  } catch (error) {
    console.error(`not ok - ${label}`);
    console.error(getErrorMessage(error));
    process.exit(1);
  }
}

async function expectFailure(fn) {
  try {
    await fn();
  } catch {
    return;
  }

  throw new Error("operation unexpectedly succeeded.");
}

async function rpc(name, token, body) {
  return request("POST", `/rpc/${name}`, token, body);
}

async function request(method, path, token, body, extraHeaders = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      payload?.message ??
        payload?.details ??
        `${method} ${path} failed with ${response.status}`
    );
  }

  return payload;
}

function normalizeSupabaseUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/rest\/v1\/?$/, "/");
  return url.toString().replace(/\/$/, "");
}

function getJwtSub(token) {
  const [, payload] = token.split(".");

  if (!payload) {
    throw new Error("access token is not a JWT.");
  }

  const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
  const parsed = JSON.parse(Buffer.from(normalizedPayload, "base64").toString("utf8"));

  if (!parsed.sub) {
    throw new Error("access token is missing sub claim.");
  }

  return parsed.sub;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");

  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue = ""] = match;

    if (process.env[key]) {
      continue;
    }

    process.env[key] = parseDotEnvValue(rawValue);
  }
}

function parseDotEnvValue(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}
