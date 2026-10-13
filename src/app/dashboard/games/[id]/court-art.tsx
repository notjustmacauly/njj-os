// Top-down court drawings (net runs vertically through the middle; team A on
// the left half, team B on the right). Proportions are stylised, not to scale.

const LINE = "#ffffff";

export function CourtArt({ sport }: { sport: string }) {
  if (sport === "pickleball") return <Pickleball />;
  if (sport === "volleyball") return <Volleyball />;
  return <Badminton />;
}

function Net() {
  return (
    <g>
      <line x1="300" y1="6" x2="300" y2="234" stroke="#1A1A2E" strokeOpacity="0.35" strokeWidth="9" strokeLinecap="round" />
      <line x1="300" y1="6" x2="300" y2="234" stroke="#F4F1EA" strokeWidth="5" strokeDasharray="2 3" />
      <circle cx="300" cy="6" r="5" fill="#F4F1EA" />
      <circle cx="300" cy="234" r="5" fill="#F4F1EA" />
    </g>
  );
}

function Badminton() {
  return (
    <svg viewBox="0 0 600 240" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect width="600" height="240" rx="18" fill="#3E8E5A" />
      <rect x="18" y="16" width="564" height="208" rx="4" fill="#4FA56B" stroke={LINE} strokeWidth="3" />
      {/* singles side lines */}
      <line x1="18" y1="32" x2="582" y2="32" stroke={LINE} strokeWidth="2" />
      <line x1="18" y1="208" x2="582" y2="208" stroke={LINE} strokeWidth="2" />
      {/* short service lines */}
      <line x1="232" y1="16" x2="232" y2="224" stroke={LINE} strokeWidth="2" />
      <line x1="368" y1="16" x2="368" y2="224" stroke={LINE} strokeWidth="2" />
      {/* long service lines (doubles) */}
      <line x1="40" y1="16" x2="40" y2="224" stroke={LINE} strokeWidth="2" />
      <line x1="560" y1="16" x2="560" y2="224" stroke={LINE} strokeWidth="2" />
      {/* centre lines */}
      <line x1="18" y1="120" x2="232" y2="120" stroke={LINE} strokeWidth="2" />
      <line x1="368" y1="120" x2="582" y2="120" stroke={LINE} strokeWidth="2" />
      <Net />
    </svg>
  );
}

function Pickleball() {
  return (
    <svg viewBox="0 0 600 240" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect width="600" height="240" rx="18" fill="#2F6FA8" />
      <rect x="22" y="18" width="556" height="204" rx="4" fill="#3C86C6" stroke={LINE} strokeWidth="3" />
      {/* kitchen (non-volley zone) */}
      <rect x="226" y="18" width="148" height="204" fill="#5FA3DA" stroke={LINE} strokeWidth="3" />
      {/* centre service lines */}
      <line x1="22" y1="120" x2="226" y2="120" stroke={LINE} strokeWidth="3" />
      <line x1="374" y1="120" x2="578" y2="120" stroke={LINE} strokeWidth="3" />
      <Net />
    </svg>
  );
}

function Volleyball() {
  return (
    <svg viewBox="0 0 600 240" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect width="600" height="240" rx="18" fill="#D9A15E" />
      <rect x="20" y="16" width="560" height="208" rx="4" fill="#E9B979" stroke={LINE} strokeWidth="3" />
      {/* attack lines */}
      <line x1="208" y1="16" x2="208" y2="224" stroke={LINE} strokeWidth="3" />
      <line x1="392" y1="16" x2="392" y2="224" stroke={LINE} strokeWidth="3" />
      <Net />
    </svg>
  );
}
