import { Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AuthProvider } from "../components/AuthProvider";
import { ConfigGate } from "../components/ConfigGate";
import { RequireAuth } from "../components/RequireAuth";
import { AuthCallbackPage } from "../pages/AuthCallbackPage";
import { CampaignDetailPage } from "../pages/CampaignDetailPage";
import { CampaignsPage } from "../pages/CampaignsPage";
import { HomePage } from "../pages/HomePage";
import { JoinInvitePage } from "../pages/JoinInvitePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ProfilePage } from "../pages/ProfilePage";
import { ReferencePage } from "../pages/ReferencePage";
import { StyleGuidePage } from "../pages/StyleGuidePage";

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
                <CampaignsPage />
              </RequireAuth>
            </ConfigGate>
          }
        />
        <Route
          path="campaigns/:campaignId"
          element={
            <ConfigGate>
              <RequireAuth>
                <CampaignDetailPage />
              </RequireAuth>
            </ConfigGate>
          }
        />
        <Route
          path="join/:inviteToken"
          element={
            <ConfigGate>
              <RequireAuth>
                <JoinInvitePage />
              </RequireAuth>
            </ConfigGate>
          }
        />
        <Route
          path="reference"
          element={
            <ConfigGate>
              <ReferencePage />
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
        <Route path="style-guide" element={<StyleGuidePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
