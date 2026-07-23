const INDUSTRIES = [
  { name: "Healthcare", icon: "ic-health" },
  { name: "Customer Support", icon: "ic-support" },
  { name: "Finance", icon: "ic-finance" },
  { name: "Legal", icon: "ic-legal" },
  { name: "Retail", icon: "ic-retail" },
  { name: "Marketing", icon: "ic-marketing" },
  { name: "Engineering", icon: "ic-engineering" },
  { name: "Education", icon: "ic-education" },
  { name: "HR", icon: "ic-hr" },
  { name: "Operations", icon: "ic-ops" },
  { name: "Sales", icon: "ic-sales" },
  { name: "Logistics", icon: "ic-logistics" },
  { name: "Real Estate", icon: "ic-realestate" },
  { name: "Government", icon: "ic-government" },
  { name: "Insurance", icon: "ic-insurance" },
];

function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="ic-health" viewBox="0 0 24 24">
          <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </symbol>
        <symbol id="ic-support" viewBox="0 0 24 24">
          <path d="M5 13v-1a7 7 0 0 1 14 0v1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="3" y="13" width="3.4" height="5.5" rx="1.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <rect x="17.6" y="13" width="3.4" height="5.5" rx="1.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M19.3 18.5v.5a3 3 0 0 1-3 3h-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </symbol>
        <symbol id="ic-finance" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 7.5v9M14.5 9.4C14.5 8.4 13.4 8 12 8s-2.5.6-2.5 1.7 1.1 1.5 2.5 1.7 2.5.7 2.5 1.8S13.4 16 12 16s-2.5-.5-2.5-1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="ic-legal" viewBox="0 0 24 24">
          <path
            d="M12 4v16M6.5 20h11M4 9l3-4.2L10 9M14 9l3-4.2L20 9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M4 9a3 3 0 0 0 6 0M14 9a3 3 0 0 0 6 0" fill="none" stroke="currentColor" strokeWidth="1.7" />
        </symbol>
        <symbol id="ic-retail" viewBox="0 0 24 24">
          <path d="M6.5 8h11l-1 11.5h-9L6.5 8z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M9 8V6.2a3 3 0 0 1 6 0V8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </symbol>
        <symbol id="ic-marketing" viewBox="0 0 24 24">
          <path d="M4 10v4l10 4.5V5.5L4 10z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M14 8.5a4 4 0 0 1 0 7M7 15v3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </symbol>
        <symbol id="ic-engineering" viewBox="0 0 24 24">
          <path
            d="M9 8l-5 4 5 4M15 8l5 4-5 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-education" viewBox="0 0 24 24">
          <path d="M12 5l9 4-9 4-9-4 9-4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path
            d="M6.5 11v5c0 1.4 2.7 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="ic-hr" viewBox="0 0 24 24">
          <circle cx="9.5" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M4 19a5.5 5.5 0 0 1 11 0M16 7a3 3 0 0 1 0 6M20.5 19a5.2 5.2 0 0 0-3.5-4.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="ic-ops" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9L18 18M18 6l-2.1 2.1M8.1 15.9L6 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="ic-sales" viewBox="0 0 24 24">
          <path d="M4 15l5-5 4 4 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 7h4v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="ic-logistics" viewBox="0 0 24 24">
          <path d="M3 7h10v9H3zM13 10h4l3 3v3h-7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <circle cx="7" cy="18" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="17" cy="18" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
        </symbol>
        <symbol id="ic-realestate" viewBox="0 0 24 24">
          <path
            d="M4 11l8-6 8 6M6 10v9h12v-9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 19v-5h4v5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </symbol>
        <symbol id="ic-government" viewBox="0 0 24 24">
          <path
            d="M4 9l8-4.5L20 9M5 9v8M9 9v8M15 9v8M19 9v8M3.5 20h17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-insurance" viewBox="0 0 24 24">
          <path
            d="M12 4l7 2.5v5c0 4-3 6.6-7 8-4-1.4-7-4-7-8v-5L12 4z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
      </defs>
    </svg>
  );
}

export function CategoryRail() {
  return (
    <div className="px-[5%] pt-2 pb-16 box-border">
      <IconSprite />
      <div className="font-semibold text-xs text-foreground-faint uppercase tracking-wide mb-5">
        Browse by industry
      </div>
      <div className="flex gap-6 overflow-x-auto no-scrollbar pb-2">
        {INDUSTRIES.map((cat) => (
          <div key={cat.name} className="flex flex-col items-center gap-2.5 flex-none w-20 cursor-pointer">
            <div className="w-14 h-14 flex items-center justify-center text-foreground">
              <svg width="32" height="32" viewBox="0 0 24 24">
                <use href={`#${cat.icon}`} />
              </svg>
            </div>
            <span className="text-center font-semibold text-xs leading-tight text-foreground/65">
              {cat.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
