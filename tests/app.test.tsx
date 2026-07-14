import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../src/app/AppRoutes";
import {
  getDefaultInviteExpiresAt,
  getInviteState,
  normalizeInviteDraft,
  validateCampaignDraft
} from "../src/lib/campaigns";
import { getErrorMessage } from "../src/lib/errors";
import { normalizeProfileUpdate } from "../src/lib/profiles";
import { parseOAuthCallbackParams } from "../src/lib/supabase";

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

});
