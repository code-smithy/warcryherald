import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { EditableProfileFields, Profile } from "./profiles";

export type AuthContextValue = {
  isConfigured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileError: string | null;
  signInWithDiscord: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (fields: EditableProfileFields) => Promise<void>;
  refreshProfile: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
