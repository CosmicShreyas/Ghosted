// Industry labels on the site, grouped so a long list stays easy to scan. The keys must match
// backend/src/lib/industries.ts (what the API accepts and the database allows).
export const INDUSTRY_GROUPS: { label: string; items: [string, string][] }[] = [
  { label: "Technology", items: [
    ["software", "Software / SaaS"], ["it_services", "IT services"], ["ai_ml", "AI & machine learning"], ["cybersecurity", "Cybersecurity"],
    ["cloud", "Cloud & infrastructure"], ["semiconductors", "Semiconductors & hardware"], ["electronics", "Consumer electronics"],
    ["robotics", "Robotics & automation"], ["iot", "IoT"], ["gaming", "Gaming"], ["crypto", "Crypto & Web3"], ["gcc", "Global capability centre (GCC)"],
  ] },
  { label: "Finance", items: [
    ["fintech", "Fintech"], ["payments", "Payments"], ["bfsi", "Banking & insurance"], ["lending", "Lending & NBFC"],
    ["insurtech", "Insurtech"], ["wealth", "Wealth & investing"], ["accounting", "Accounting & audit"],
  ] },
  { label: "Commerce & consumer", items: [
    ["ecommerce", "E-commerce"], ["quick_commerce", "Quick commerce"], ["d2c", "D2C brands"], ["retail", "Retail"], ["fmcg", "FMCG & consumer goods"],
    ["fashion", "Fashion & apparel"], ["beauty", "Beauty & personal care"], ["food_beverage", "Food & beverages"], ["foodtech", "Food delivery & foodtech"],
  ] },
  { label: "Health", items: [
    ["healthtech", "Healthtech"], ["hospitals", "Hospitals & clinics"], ["pharma", "Pharma & biotech"], ["medical_devices", "Medical devices"], ["fitness", "Sports & fitness"],
  ] },
  { label: "Education & people", items: [
    ["edtech", "Edtech"], ["education", "Schools & universities"], ["hrtech", "HR tech"], ["staffing", "Staffing & recruitment agencies"],
  ] },
  { label: "Media & marketing", items: [
    ["media", "Media"], ["entertainment", "Entertainment & streaming"], ["publishing", "Publishing & news"], ["advertising", "Advertising & marketing"], ["social", "Social media & community"],
  ] },
  { label: "Industry & infrastructure", items: [
    ["manufacturing", "Manufacturing"], ["automotive", "Automotive & EV"], ["aerospace", "Aerospace & defence"], ["chemicals", "Chemicals & materials"],
    ["metals_mining", "Metals & mining"], ["textiles", "Textiles"], ["construction", "Construction & infrastructure"], ["real_estate", "Real estate & proptech"],
    ["energy", "Energy & utilities"], ["renewables", "Renewable energy"], ["oil_gas", "Oil & gas"], ["climate", "Climate tech"], ["agritech", "Agriculture & agritech"],
  ] },
  { label: "Travel & logistics", items: [
    ["logistics", "Logistics & supply chain"], ["mobility", "Mobility & ride-hailing"], ["aviation", "Airlines & aviation"], ["travel", "Travel & tourism"], ["hospitality", "Hotels & hospitality"],
  ] },
  { label: "Services & public sector", items: [
    ["consulting", "Consulting"], ["bpo", "BPO & customer support"], ["kpo", "Analytics & KPO"], ["legal", "Legal & legaltech"], ["telecom", "Telecom"],
    ["government", "Government & public sector"], ["nonprofit", "Non-profit & NGO"], ["research", "Research & labs"],
  ] },
  { label: "Something else", items: [["other", "Other"]] },
];

export const INDUSTRY_LABEL: Record<string, string> = Object.fromEntries(INDUSTRY_GROUPS.flatMap((g) => g.items));
