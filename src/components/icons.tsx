export const Logo = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M12 16a4 4 0 0 0-8 0" />
      <path d="M12 12h.01" />
      <path d="M16 12h.01" />
      <path d="M8 12h.01" />
      <path d="M16 8h.01" />
    </svg>
  );
  