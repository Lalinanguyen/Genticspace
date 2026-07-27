export interface IndustryDef {
  name: string;
  color: string;
  icon: (size: number) => React.ReactNode;
}

const iconProps = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
});

const icHealth = (size: number) => (
  <svg {...iconProps(size)}>
    <rect x="4" y="4" width="16" height="16" rx="3" strokeWidth="1.6" />
    <path d="M12 8v8M8 12h8" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const icSupport = (size: number) => (
  <svg {...iconProps(size)}>
    <path d="M5 13v-1a7 7 0 0 1 14 0v1" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="3" y="13" width="3.4" height="5.5" rx="1.7" strokeWidth="1.8" />
    <rect x="17.6" y="13" width="3.4" height="5.5" rx="1.7" strokeWidth="1.8" />
    <path d="M19.3 18.5v.5a3 3 0 0 1-3 3h-2" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const icFinance = (size: number) => (
  <svg {...iconProps(size)}>
    <circle cx="12" cy="12" r="8" strokeWidth="1.8" />
    <path
      d="M12 7.5v9M14.5 9.4C14.5 8.4 13.4 8 12 8s-2.5.6-2.5 1.7 1.1 1.5 2.5 1.7 2.5.7 2.5 1.8S13.4 16 12 16s-2.5-.5-2.5-1.5"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);
const icLegal = (size: number) => (
  <svg {...iconProps(size)}>
    <path
      d="M12 4v16M6.5 20h11M4 9l3-4.2L10 9M14 9l3-4.2L20 9"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M4 9a3 3 0 0 0 6 0M14 9a3 3 0 0 0 6 0" strokeWidth="1.7" />
  </svg>
);
const icRetail = (size: number) => (
  <svg {...iconProps(size)}>
    <path d="M6.5 8h11l-1 11.5h-9L6.5 8z" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M9 8V6.2a3 3 0 0 1 6 0V8" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const icMarketing = (size: number) => (
  <svg {...iconProps(size)}>
    <path d="M4 10v4l10 4.5V5.5L4 10z" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M14 8.5a4 4 0 0 1 0 7M7 15v3.5" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const icEngineering = (size: number) => (
  <svg {...iconProps(size)}>
    <path d="M9 8l-5 4 5 4M15 8l5 4-5 4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const icEducation = (size: number) => (
  <svg {...iconProps(size)}>
    <path d="M12 5l9 4-9 4-9-4 9-4z" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M6.5 11v5c0 1.4 2.7 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-5" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const icHr = (size: number) => (
  <svg {...iconProps(size)}>
    <circle cx="9.5" cy="9" r="3" strokeWidth="1.7" />
    <path
      d="M4 19a5.5 5.5 0 0 1 11 0M16 7a3 3 0 0 1 0 6M20.5 19a5.2 5.2 0 0 0-3.5-4.9"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);
const icRealEstate = (size: number) => (
  <svg {...iconProps(size)}>
    <path d="M4 11l8-6 8 6M6 10v9h12v-9" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 19v-5h4v5" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);
const icInsurance = (size: number) => (
  <svg {...iconProps(size)}>
    <path d="M12 4l7 2.5v5c0 4-3 6.6-7 8-4-1.4-7-4-7-8v-5L12 4z" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const icLogistics = (size: number) => (
  <svg {...iconProps(size)}>
    <path d="M3 7h10v9H3zM13 10h4l3 3v3h-7z" strokeWidth="1.7" strokeLinejoin="round" />
    <circle cx="7" cy="18" r="1.6" strokeWidth="1.7" />
    <circle cx="17" cy="18" r="1.6" strokeWidth="1.7" />
  </svg>
);
const icManufacturing = (size: number) => (
  <svg {...iconProps(size)}>
    <path d="M3 20V11l5 3.5V11l5 3.5V9l6 4v7H3z" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    <path d="M6 20v-4M14 20v-3" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const icTravel = (size: number) => (
  <svg {...iconProps(size)}>
    <path
      d="M3.5 15.5L20.5 8l-3-1-4 1.8-5.4-2.4-1.6.7 3.6 3.4-4.4 2-2.4-1-1.3.6 2.5 2.4z"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
    <path d="M5 19h14" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const icMedia = (size: number) => (
  <svg {...iconProps(size)}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" strokeWidth="1.6" />
    <path d="M10.5 9.5l4.5 2.5-4.5 2.5v-5z" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" stroke="none" />
  </svg>
);
const icAgriculture = (size: number) => (
  <svg {...iconProps(size)}>
    <path
      d="M12 20v-9M12 11c0-4 3-6.5 7-6.5C19 8.5 16.5 11.5 12 11zM12 14c0-3-2.3-5-5.5-5C6.5 12.5 9 15 12 14z"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const icSports = (size: number) => (
  <svg {...iconProps(size)}>
    <path
      d="M6.5 8L3 4.5M17.5 8L21 4.5M6.5 16L3 19.5M17.5 16L21 19.5M5 12h14"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <circle cx="5" cy="12" r="2" strokeWidth="1.7" />
    <circle cx="19" cy="12" r="2" strokeWidth="1.7" />
  </svg>
);

export const INDUSTRIES: IndustryDef[] = [
  { name: "Healthcare", color: "#072AC8", icon: icHealth },
  { name: "Customer Support", color: "#35C0B0", icon: icSupport },
  { name: "Finance & Fintech", color: "#EF233C", icon: icFinance },
  { name: "Legal", color: "#072AC8", icon: icLegal },
  { name: "Retail & E-commerce", color: "#35C0B0", icon: icRetail },
  { name: "Marketing", color: "#EF233C", icon: icMarketing },
  { name: "Software Engineering", color: "#072AC8", icon: icEngineering },
  { name: "Education", color: "#35C0B0", icon: icEducation },
  { name: "HR & Recruiting", color: "#EF233C", icon: icHr },
  { name: "Real Estate", color: "#072AC8", icon: icRealEstate },
  { name: "Manufacturing", color: "#35C0B0", icon: icManufacturing },
  { name: "Travel & Hospitality", color: "#EF233C", icon: icTravel },
  { name: "Insurance", color: "#072AC8", icon: icInsurance },
  { name: "Media & Entertainment", color: "#35C0B0", icon: icMedia },
  { name: "Logistics & Supply Chain", color: "#EF233C", icon: icLogistics },
  { name: "Agriculture", color: "#072AC8", icon: icAgriculture },
  { name: "Sports & Fitness", color: "#35C0B0", icon: icSports },
];
