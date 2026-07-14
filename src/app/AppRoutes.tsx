import { Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AuthProvider } from "../components/AuthProvider";
import { ConfigGate } from "../components/ConfigGate";
import { RequireAuth } from "../components/RequireAuth";
import { AuthCallbackPage } from "../pages/AuthCallbackPage";
import { CampaignsPlaceholderPage } from "../pages/CampaignsPlaceholderPage";
import { HomePage } from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ProfilePage } from "../pages/ProfilePage";

export function AppRoutes() {
  return (
    <Routes>
      <Route
        element={
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        }
      >
        <Route index element={<HomePage />} />
        <Route
          path="auth/callback"
          element={
            <ConfigGate>
              <AuthCallbackPage />
            </ConfigGate>
          }
        />
        <Route
          path="campaigns"
          element={
            <ConfigGate>
              <RequireAuth>
                <CampaignsPlaceholderPage />
              </RequireAuth>
            </ConfigGate>
          }
        />
        <Route
          path="profile"
          element={
            <ConfigGate>
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            </ConfigGate>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
