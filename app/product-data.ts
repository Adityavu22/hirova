export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  mode: "Remote" | "Hybrid" | "On-site";
  experience: string;
  match: number;
  logo: string;
  color: string;
  posted: string;
  skills: string[];
  missing: string[];
  why: string;
  description: string;
  responsibilities: string[];
  benefits: string[];
  applicants: number;
  postedAt?: string;
  source?: string;
  sourceUrl?: string;
  employmentType?: string;
  category?: string;
  careerLevel?: "intern" | "early" | "mid" | "senior";
  minExperienceYears?: number | null;
  maxExperienceYears?: number | null;
  experienceConfidence?: "low" | "medium" | "high";
  applicationMethod?: "native" | "external" | "both";
  origin?: "aggregated" | "recruiter";
  recruiterJobId?: string | null;
};

// 1. Seed jobs make every product workflow usable while the ingestion API is empty.
export const JOBS: Job[] = [
  {
    id: "mercury",
    title: "Senior Product Designer",
    company: "Mercury Labs",
    location: "Bengaluru",
    salary: "₹32–42L",
    mode: "Hybrid",
    experience: "5–7 yrs",
    match: 94,
    logo: "M",
    color: "plum",
    posted: "2 hours ago",
    applicants: 46,
    skills: ["Design systems", "Figma", "Product strategy", "Fintech"],
    missing: ["Experimentation"],
    why: "Your product craft and systems thinking strongly overlap with this team. Add one quantified launch outcome before applying.",
    description: "Lead end-to-end design for high-trust financial workflows used by growing businesses across India.",
    responsibilities: ["Own discovery through launch for two core product areas", "Evolve a multi-product design system", "Partner with product, research, data, and engineering"],
    benefits: ["Flexible hybrid work", "Learning allowance", "Meaningful ESOP plan"],
  },
  {
    id: "zepto",
    title: "Lead UX Designer",
    company: "Zepto",
    location: "Bengaluru",
    salary: "₹28–36L",
    mode: "On-site",
    experience: "5+ yrs",
    match: 89,
    logo: "Z",
    color: "orange",
    posted: "Today",
    applicants: 83,
    skills: ["UX research", "Mobile", "Leadership", "Experimentation"],
    missing: ["People management"],
    why: "Your consumer-product work maps closely to their growth team. Leadership evidence will be important in screening.",
    description: "Shape fast, high-frequency shopping journeys and lead design quality across a rapidly scaling consumer platform.",
    responsibilities: ["Lead customer research and product discovery", "Mentor a small team of designers", "Improve conversion through structured experiments"],
    benefits: ["Ownership from day one", "Health cover", "Quarterly team offsites"],
  },
  {
    id: "razorpay",
    title: "Product Designer III",
    company: "Razorpay",
    location: "Remote · India",
    salary: "₹30–38L",
    mode: "Remote",
    experience: "4–6 yrs",
    match: 87,
    logo: "R",
    color: "blue",
    posted: "Yesterday",
    applicants: 61,
    skills: ["B2B SaaS", "Prototyping", "Analytics", "Design systems"],
    missing: ["Payments domain"],
    why: "Excellent craft fit. One quantified B2B outcome would make your application much more convincing.",
    description: "Simplify complex payment operations for finance and engineering teams across India and Southeast Asia.",
    responsibilities: ["Design complex B2B payment workflows", "Prototype and validate with customers", "Contribute patterns to the design system"],
    benefits: ["Remote-first flexibility", "Wellness budget", "Employee stock options"],
  },
  {
    id: "atlas",
    title: "Staff Product Designer",
    company: "Atlas AI",
    location: "Remote · India",
    salary: "₹38–48L",
    mode: "Remote",
    experience: "7+ yrs",
    match: 84,
    logo: "A",
    color: "green-logo",
    posted: "2 days ago",
    applicants: 29,
    skills: ["AI products", "Systems thinking", "Mentoring", "Evaluation"],
    missing: ["AI evaluation", "Prompt design"],
    why: "Your systems experience is strong; hands-on AI evaluation evidence is the main gap.",
    description: "Define trustworthy AI-assisted workflows for enterprise teams and set a high bar for product quality.",
    responsibilities: ["Shape platform-level product strategy", "Design human-in-the-loop AI workflows", "Mentor designers across product groups"],
    benefits: ["Work from anywhere", "Home-office budget", "Annual company retreat"],
  },
  {
    id: "cred",
    title: "Senior UX Designer",
    company: "CRED",
    location: "Bengaluru",
    salary: "₹30–40L",
    mode: "Hybrid",
    experience: "5+ yrs",
    match: 82,
    logo: "C",
    color: "black-logo",
    posted: "3 days ago",
    applicants: 115,
    skills: ["Interaction", "Motion", "Visual design", "Prototyping"],
    missing: ["Motion design"],
    why: "High craft alignment with room to show more motion and interaction-system work.",
    description: "Create premium consumer experiences across payments, commerce, and member rewards.",
    responsibilities: ["Own interaction design for flagship experiences", "Prototype high-fidelity motion", "Raise quality through critique and craft reviews"],
    benefits: ["Premium health plan", "Generous leave", "Creative tools budget"],
  },
  {
    id: "fresh",
    title: "Design Manager",
    company: "Freshworks",
    location: "Chennai",
    salary: "₹34–45L",
    mode: "Hybrid",
    experience: "7–9 yrs",
    match: 78,
    logo: "F",
    color: "teal-logo",
    posted: "4 days ago",
    applicants: 37,
    skills: ["People leadership", "SaaS", "Strategy", "Coaching"],
    missing: ["Hiring", "Performance management"],
    why: "Strong SaaS domain match; direct people-management evidence would lift the score.",
    description: "Lead a product design team building approachable customer-support and IT workflows for global businesses.",
    responsibilities: ["Coach and grow a team of product designers", "Set design strategy with product leadership", "Improve team operating systems"],
    benefits: ["Hybrid flexibility", "Manager coaching", "Global mobility"],
  },
  {
    id: "notion",
    title: "Product Designer, Growth",
    company: "Notion",
    location: "Remote · APAC",
    salary: "₹42–55L",
    mode: "Remote",
    experience: "5+ yrs",
    match: 76,
    logo: "N",
    color: "black-logo",
    posted: "5 days ago",
    applicants: 204,
    skills: ["Growth", "Experimentation", "Craft", "Analytics"],
    missing: ["PLG growth"],
    why: "Your product craft fits, but the hiring team will expect stronger product-led growth experiments.",
    description: "Help more teams discover value quickly through thoughtful onboarding, activation, and collaboration experiences.",
    responsibilities: ["Design activation and retention journeys", "Run cross-functional growth experiments", "Build reusable growth patterns"],
    benefits: ["Remote-first", "Equipment allowance", "Flexible paid time off"],
  },
  {
    id: "meesho",
    title: "Senior Product Designer",
    company: "Meesho",
    location: "Bengaluru",
    salary: "₹26–34L",
    mode: "Hybrid",
    experience: "4–7 yrs",
    match: 74,
    logo: "M",
    color: "plum",
    posted: "1 week ago",
    applicants: 92,
    skills: ["Consumer", "Research", "Mobile", "Commerce"],
    missing: ["Vernacular UX"],
    why: "Strong consumer experience; show how your work serves diverse, low-bandwidth user segments.",
    description: "Design inclusive commerce experiences for millions of customers and small businesses across India.",
    responsibilities: ["Lead zero-to-one product discovery", "Conduct field research across user segments", "Ship accessible mobile-first experiences"],
    benefits: ["Comprehensive insurance", "Flexible work", "Learning support"],
  },
];
