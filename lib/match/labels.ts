export const FIELDS = [
  { value: "computer_data_science", label: "Computer & data science" },
  { value: "business_finance", label: "Business & finance" },
  { value: "engineering", label: "Engineering" },
  { value: "public_health", label: "Public health" },
  { value: "project_management", label: "Project management" },
  { value: "law", label: "Law" },
] as const

export const fieldLabel = (field: string) => FIELDS.find((f) => f.value === field)?.label ?? field

export const BAND_LABEL: Record<string, string> = {
  first: "First",
  upper_second: "2:1",
  lower_second: "2:2",
  third: "Third",
  pass: "Pass",
}

export const ACCOMMODATION_LABEL: Record<string, string> = {
  university_halls: "University halls",
  private_studio: "Private studio",
  shared_flat: "Shared flat",
  homestay: "Homestay",
  off_campus_shared: "Off-campus shared",
}

export const COUNTRY_LABEL: Record<string, string> = { UK: "UK", CA: "Canada", US: "USA" }

export const TERM_LABEL: Record<string, string> = { fall: "Fall", winter: "Winter", spring: "Spring", summer: "Summer" }

/** The academic cycle that a student applying now would enter: from September on, next year's. */
export function nextCycle(now: Date, offset = 0): string {
  const year = now.getUTCFullYear() + (now.getUTCMonth() >= 8 ? 1 : 0) + offset
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`
}
