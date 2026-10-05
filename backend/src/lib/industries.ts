// Every industry a company can be listed under. One list for the API (validation, auto-fill) and
// the database check in init_database.sql. Keep in step with src/lib/industries.ts (the labels).
// Keys are stable: existing companies keep theirs; new ones only ever get added.
export const INDUSTRIES = [
  // Technology
  "software", "it_services", "ai_ml", "cybersecurity", "cloud", "semiconductors", "electronics", "robotics", "iot", "gaming", "crypto", "gcc",
  // Finance
  "fintech", "payments", "bfsi", "lending", "insurtech", "wealth", "accounting",
  // Commerce and consumer
  "ecommerce", "quick_commerce", "d2c", "retail", "fmcg", "fashion", "beauty", "food_beverage", "foodtech",
  // Health
  "healthtech", "hospitals", "pharma", "medical_devices", "fitness",
  // Education and people
  "edtech", "education", "hrtech", "staffing",
  // Media and marketing
  "media", "entertainment", "publishing", "advertising", "social",
  // Industry and infrastructure
  "manufacturing", "automotive", "aerospace", "chemicals", "metals_mining", "textiles", "construction", "real_estate", "energy", "renewables", "oil_gas", "climate", "agritech",
  // Movement and places
  "logistics", "mobility", "aviation", "travel", "hospitality",
  // Services and the public sector
  "consulting", "bpo", "kpo", "legal", "telecom", "government", "nonprofit", "research",
  "other",
] as const;
export type Industry = (typeof INDUSTRIES)[number];
