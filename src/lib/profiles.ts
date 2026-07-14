export type Profile = {
  id: string;
  discord_user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  preferred_language: string;
  timezone: string;
  is_site_admin: boolean;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
};

export type EditableProfileFields = {
  display_name: string;
  preferred_language: string;
  timezone: string;
};

export const languageOptions = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" }
] as const;

export function normalizeProfileUpdate(
  fields: EditableProfileFields
): EditableProfileFields {
  return {
    display_name: fields.display_name.trim(),
    preferred_language: fields.preferred_language,
    timezone: fields.timezone.trim() || "UTC"
  };
}
