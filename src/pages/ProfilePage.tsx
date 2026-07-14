import { useEffect, useState } from "react";
import { languageOptions } from "../lib/profiles";
import { useAuth } from "../lib/auth-context";

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function ProfilePage() {
  const { profile, profileError, updateProfile, user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [timezone, setTimezone] = useState(browserTimezone);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) {
      return;
    }

    setDisplayName(profile.display_name ?? "");
    setPreferredLanguage(profile.preferred_language);
    setTimezone(profile.timezone);
  }, [profile]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setError(null);

    try {
      await updateProfile({
        display_name: displayName,
        preferred_language: preferredLanguage,
        timezone
      });
      setStatus("Profile saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Profile could not be saved."
      );
    }
  }

  return (
    <main className="page page--narrow">
      <section className="notice profile-card">
        <p className="eyebrow">Profile</p>
        <h1>Player settings.</h1>
        {profile?.avatar_url ? (
          <img
            className="profile-avatar"
            src={profile.avatar_url}
            alt=""
            referrerPolicy="no-referrer"
          />
        ) : null}
        <dl className="profile-meta">
          <div>
            <dt>Account</dt>
            <dd>{user?.email ?? user?.id}</dd>
          </div>
          <div>
            <dt>Discord ID</dt>
            <dd>{profile?.discord_user_id ?? "Pending Discord metadata"}</dd>
          </div>
        </dl>
        {profileError ? <p className="form-error">{profileError}</p> : null}
        <form className="profile-form" onSubmit={handleSubmit}>
          <label>
            Display name
            <input
              autoComplete="nickname"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Campaign display name"
            />
          </label>
          <label>
            Preferred language
            <select
              value={preferredLanguage}
              onChange={(event) => setPreferredLanguage(event.target.value)}
            >
              {languageOptions.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Timezone
            <input
              autoComplete="off"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="UTC"
            />
          </label>
          <button className="button" type="submit">
            Save profile
          </button>
          {status ? <p className="form-success">{status}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
