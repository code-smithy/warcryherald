import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../src/app/AppRoutes";

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
  it("renders the project foundation home page", () => {
    renderRoute("/");

    expect(
      screen.getByRole("heading", {
        name: /track the warbands, battles, and scars/i
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /campaigns/i })).toBeInTheDocument();
  });

  it("shows a useful configuration error when Supabase is missing", () => {
    renderRoute("/campaigns");

    expect(
      screen.getByRole("heading", { name: /supabase is not configured yet/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_URL is required/i)).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_ANON_KEY is required/i)).toBeInTheDocument();
  });

  it("renders a not found route", () => {
    renderRoute("/missing");

    expect(
      screen.getByRole("heading", { name: /this ledger page does not exist/i })
    ).toBeInTheDocument();
  });
});
