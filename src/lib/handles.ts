// Anonymous handle generator: "<Prefix> <Suffix>", e.g. "Unbothered Falcon" (34,000+ display names).
// Handles aren't unique on purpose. Every account also gets a hidden 15-digit public ID
// (~900 trillion values, assigned by the database) that is only used in URLs such as /u/<id>.
// Keep in sync with backend/src/lib/handles.ts.

export const handlePrefixes = [
  "Quiet", "Unbothered", "Caffeinated", "Sleepless", "Patient", "Brave", "Salty", "Sassy", "Chill", "Stoic",
  "Curious", "Cheeky", "Witty", "Honest", "Fearless", "Moody", "Sunny", "Stormy", "Gentle", "Fierce",
  "Sneaky", "Sly", "Loyal", "Humble", "Bold", "Calm", "Clever", "Cosmic", "Crispy", "Dapper",
  "Dizzy", "Dreamy", "Eager", "Electric", "Fancy", "Fluffy", "Frosty", "Funky", "Fuzzy", "Giddy",
  "Glitchy", "Golden", "Grumpy", "Hasty", "Hazy", "Hungry", "Icy", "Jolly", "Jumpy", "Keen",
  "Lazy", "Lucky", "Lunar", "Mellow", "Mighty", "Misty", "Nimble", "Noble", "Nosy", "Offline",
  "Overqualified", "Underpaid", "Unread", "Rejected", "Rehired", "Remote", "Hybrid", "Onboarded", "Shortlisted", "Waitlisted",
  "Pixelated", "Plucky", "Polite", "Proud", "Quirky", "Rapid", "Rebel", "Restless", "Rusty", "Savvy",
  "Scrappy", "Secret", "Shiny", "Silent", "Silver", "Sincere", "Sleepy", "Smooth", "Snappy", "Solar",
  "Sparkly", "Speedy", "Spicy", "Steady", "Sturdy", "Swift", "Tidy", "Tiny", "Tired", "Toasty",
  "Tough", "Tranquil", "Tricky", "Upbeat", "Velvet", "Vivid", "Wandering", "Wary", "Wild", "Wise",
  "Zesty", "Zen", "Radiant", "Resilient", "Relentless", "Sarcastic", "Skeptical", "Suspicious", "Hopeful", "Hireable",
  "Unfazed", "Unshaken", "Untamed", "Undercover", "Incognito", "Masked", "Hidden", "Invisible", "Nameless", "Faceless",
  "Midnight", "Monday", "Friday", "Weekend", "Overtime", "Deadline", "Coffee", "Chai", "Masala", "Filter",
  "Neon", "Retro", "Turbo", "Mega", "Ultra", "Hyper", "Micro", "Nano", "Pocket", "Paper",
  "Cotton", "Marble", "Granite", "Copper", "Crimson", "Indigo", "Saffron", "Emerald", "Amber", "Cobalt",
  "Jugaadu", "Overthinking", "Traffic-Stuck", "Metro-Missed", "Auto-Waiting", "Salary-Waiting", "Notice-Serving", "Bench-Warming", "Deadline-Dodging", "Chai-Fuelled",
  "Filter-Coffee", "Power-Cut", "Monday-Struck", "Rent-Paying", "Mildly-Spicy", "Fully-Booked", "Interview-Tired", "Mummy-Approved", "Hostel-Hungry", "Shaadi-Dodging",
] as const;

export const handleSuffixes = [
  "Otter", "Falcon", "Panda", "Lynx", "Myna", "Gecko", "Yak", "Koala", "Raven", "Turtle",
  "Tiger", "Peacock", "Mongoose", "Langur", "Cobra", "Elephant", "Rhino", "Leopard", "Sloth", "Bison",
  "Heron", "Kingfisher", "Parrot", "Owl", "Sparrow", "Crow", "Pigeon", "Eagle", "Hawk", "Kite",
  "Dolphin", "Whale", "Octopus", "Squid", "Shark", "Crab", "Lobster", "Seal", "Walrus", "Penguin",
  "Fox", "Wolf", "Bear", "Badger", "Beaver", "Hedgehog", "Squirrel", "Rabbit", "Hamster", "Ferret",
  "Camel", "Llama", "Alpaca", "Goat", "Sheep", "Donkey", "Zebra", "Giraffe", "Hippo", "Meerkat",
  "Lemur", "Gibbon", "Gorilla", "Chimp", "Baboon", "Tapir", "Okapi", "Pangolin", "Armadillo", "Capybara",
  "Iguana", "Chameleon", "Axolotl", "Newt", "Frog", "Toad", "Salamander", "Tortoise", "Python", "Viper",
  "Moth", "Beetle", "Firefly", "Cricket", "Mantis", "Bee", "Hornet", "Ant", "Dragonfly", "Ladybug",
  "Comet", "Meteor", "Nebula", "Quasar", "Pulsar", "Nova", "Orbit", "Rocket", "Satellite", "Asteroid",
  "Cactus", "Bonsai", "Mango", "Coconut", "Jackfruit", "Samosa", "Dosa", "Idli", "Pakora", "Laddoo",
  "Kettle", "Teacup", "Notebook", "Stapler", "Keyboard", "Mouse", "Monitor", "Router", "Pager", "Lanyard",
  "Ghost", "Phantom", "Specter", "Spirit", "Wraith", "Shadow", "Echo", "Whisper", "Riddle", "Mystery",
  "Pebble", "Boulder", "Glacier", "Volcano", "Canyon", "Lagoon", "Monsoon", "Cyclone", "Thunder", "Breeze",
  "Knight", "Ranger", "Pilot", "Sailor", "Nomad", "Pirate", "Wizard", "Ninja", "Samurai", "Bard",
  "Candidate", "Applicant", "Intern", "Fresher", "Veteran", "Freelancer", "Recruit", "Rookie", "Mentor", "Maverick",
  "Biryani", "Vada", "Chutney", "Chai", "Paratha", "Momos", "Jalebi", "Kachori", "Poha", "Upma",
  "Rasam", "Sambar", "Golgappa", "PaniPuri", "Chole", "Kulcha", "Rajma", "Khichdi", "Thepla", "Dhokla",
  "Misal", "PavBhaji", "Appam", "Puttu", "Pongal", "Payasam", "NimbuPani", "FilterCoffee", "CuttingChai", "Murukku",
] as const;

const desiPrefixes = [
  "Sleepless", "Hungry", "Salty", "Sassy", "Spicy", "Tired", "Monday", "Chai", "Masala", "Filter",
  "Jugaadu", "Overthinking", "Traffic-Stuck", "Metro-Missed", "Auto-Waiting", "Salary-Waiting", "Notice-Serving", "Bench-Warming", "Deadline-Dodging", "Chai-Fuelled",
  "Filter-Coffee", "Power-Cut", "Monday-Struck", "Rent-Paying", "Mildly-Spicy", "Fully-Booked", "Interview-Tired", "Mummy-Approved", "Hostel-Hungry", "Shaadi-Dodging",
] as const;

const desiSuffixes = [
  "Mango", "Coconut", "Jackfruit", "Samosa", "Dosa", "Idli", "Pakora", "Laddoo", "Biryani", "Vada",
  "Chutney", "Chai", "Paratha", "Momos", "Jalebi", "Kachori", "Poha", "Upma", "Rasam", "Sambar",
  "Golgappa", "PaniPuri", "Chole", "Kulcha", "Rajma", "Khichdi", "Thepla", "Dhokla", "Misal", "PavBhaji",
  "Appam", "Puttu", "Pongal", "Payasam", "NimbuPani", "FilterCoffee", "CuttingChai", "Murukku",
] as const;

const pick = <T,>(list: readonly T[], n: number): T => list[Math.abs(n) % list.length] as T;

// Tiny deterministic hash so mock users get the same handle on server and client.
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function handleFromSeed(seed: string) {
  const h = hash(seed);
  return `${pick(handlePrefixes, h)} ${pick(handleSuffixes, Math.floor(h / 160))}`;
}

export function randomHandle() {
  const r = () => Math.floor(Math.random() * 1e9);
  // Rerolls lean desi and silly, while the complete original pool remains available.
  const prefixPool = Math.random() < 0.7 ? desiPrefixes : handlePrefixes;
  const suffixPool = Math.random() < 0.8 ? desiSuffixes : handleSuffixes;
  return `${pick(prefixPool, r())} ${pick(suffixPool, r())}`;
}

export const isGeneratedHandle = (handle: string) => {
  const [prefix, suffix, ...rest] = handle.split(" ");
  return rest.length === 0 && (handlePrefixes as readonly string[]).includes(prefix ?? "") && (handleSuffixes as readonly string[]).includes(suffix ?? "");
};
