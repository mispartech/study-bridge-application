/** Bump when the data notice changes, so students can be asked again. */
export const CONSENT_VERSION = "2026-11-draft"

export const DATA_WE_STORE = [
  {
    what: "Your email address",
    why: "To sign you in and keep your account yours.",
  },
  {
    what: "Your nationality and travel document",
    why: "Visa rules depend on them, so we can tell you which countries are open to you.",
  },
  {
    what: "Your grades, test scores and work history",
    why: "To check which programmes you qualify for.",
  },
  {
    what: "Your budget and how you plan to pay",
    why: "To work out what you can afford.",
  },
  {
    what: "Your preferences, goals and saved programmes",
    why: "To rank your matches and keep your shortlist.",
  },
  {
    what: "Your advisor messages",
    why: "Sent to our AI provider to answer you. We count them for your daily limit but don't store the text.",
  },
] as const
