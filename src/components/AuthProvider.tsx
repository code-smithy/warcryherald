import type { PropsWithChildren } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthContext } from "../lib/auth-context";
import type { EditableProfileFields, Profile } from "../lib/profiles";
import { normalizeProfileUpdate } from "../lib/profiles";
import { getOAuthRedirectUrl, getSupabaseClient } from "../lib/supabase";

export function AuthProvider({ children }: PropsWithChildren) {
  const client = getSupabaseClient();
  const [loading, setLoading] = useState(Boolean(client));
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(
    async (userId: string) => {
      if (!client) {
        setProfile(null);
        setProfileError(null);
        return;
      }

      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        setProfile(null);
        setProfileError(error.message);
        return;
      }

      setProfile(data as Profile);
      setProfileError(null);
    },
    [client]
  );

  const refreshSession = useCallback(async () => {
    if (!client) {
      setLoading(false);
      setSession(null);
      setProfile(null);
      setProfileError(null);
      return;
    }

    setLoading(true);
    const { data, error } = await client.auth.getSession();

    if (error) {
      setSession(null);
      setProfile(null);
      setProfileError(error.message);
      setLoading(false);
      return;
    }

    setSession(data.session);

    if (data.session?.user.id) {
      await loadProfile(data.session.user.id);
    } else {
      setProfile(null);
      setProfileError(null);
    }

    setLoading(false);
  }, [client, loadProfile]);

  useEffect(() => {
    if (!client) {
      void refreshSession();
      return undefined;
    }

    void refreshSession();

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (nextSession?.user.id) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
        setProfileError(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [client, loadProfile, refreshSession]);

  const value = useMemo(
    () => ({
      isConfigured: Boolean(client),
      loading,
      session,
      user: session?.user ?? null,
      profile,
      profileError,
      signInWithDiscord: async () => {
        if (!client) {
          throw new Error("Supabase is not configured.");
        }

        const { error } = await client.auth.signInWithOAuth({
          provider: "discord",
          options: {
            redirectTo: getOAuthRedirectUrl()
          }
        });

        if (error) {
          throw error;
        }
      },
      signOut: async () => {
        if (!client) {
          return;
        }

        const { error } = await client.auth.signOut();

        if (error) {
          throw error;
        }
      },
      updateProfile: async (fields: EditableProfileFields) => {
        if (!client || !session?.user.id) {
          throw new Error("You must be signed in to update your profile.");
        }

        const update = normalizeProfileUpdate(fields);
        const { data, error } = await client
          .from("profiles")
          .update(update)
          .eq("id", session.user.id)
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        setProfile(data as Profile);
        setProfileError(null);
      },
      refreshProfile: async () => {
        if (session?.user.id) {
          await loadProfile(session.user.id);
        }
      },
      refreshSession
    }),
    [client, loading, loadProfile, profile, profileError, refreshSession, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
