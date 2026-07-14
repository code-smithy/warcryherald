import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../src/app/AppRoutes";
import { normalizeProfileUpdate } from "../src/lib/profiles";

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
});
