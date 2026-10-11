// Every cost has a face. Four filled, lit characters (not line drawings):
// rent is a folded bill, the factory a kraft box, ads a flame, the tax a
// stamped envelope. Each has two bead eyes and a gloss, so they sit in the
// same register as the rendered helper.
import React from 'react';

export type Who = 'rent' | 'factory' | 'ads' | 'fees' | 'tax';

const Eyes: React.FC<{ x1: number; x2: number; y: number; squint?: number; r?: number; look?: number }> = ({ x1, x2, y, squint = 0, r = 3.2, look = 0 }) => {
  const ry = r * (1 - squint * 0.8);
  return (
    <>
      {[x1, x2].map((x, i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx={r * 1.25} ry={ry * 1.3} fill="#fff" />
          <ellipse cx={x + look * 1.2} cy={y + 0.4} rx={r} ry={ry} fill="#15171C" />
          <circle cx={x + look * 1.2 - r * 0.35} cy={y - ry * 0.4} r={r * 0.3} fill="#fff" opacity={squint > 0.6 ? 0 : 1} />
        </g>
      ))}
    </>
  );
};

const Shadow: React.FC = () => <ellipse cx={32} cy={60} rx={18} ry={3.2} fill="rgba(0,0,0,.18)" />;

const Rent: React.FC<{ squint: number }> = ({ squint }) => (
  <svg viewBox="0 0 64 64">
    <defs>
      <linearGradient id="c-rent" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFDF6" /><stop offset="1" stopColor="#E6E0CF" /></linearGradient>
    </defs>
    <Shadow />
    <path d="M16 6h22l10 10v40a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2z" fill="url(#c-rent)" stroke="#C9C1AC" strokeWidth="1.2" />
    <path d="M38 6v10h10z" fill="#D8D1BE" />
    <rect x="22" y="22" width="20" height="3" rx="1.5" fill="#B9B29E" />
    <rect x="22" y="44" width="14" height="3" rx="1.5" fill="#B9B29E" />
    <rect x="22" y="50" width="9" height="3" rx="1.5" fill="#B9B29E" />
    <rect x="31" y="42" width="12" height="7" rx="2" fill="#D23B3B" opacity=".85" transform="rotate(-8 37 45)" />
    <Eyes x1={26} x2={38} y={33} squint={squint} />
  </svg>
);

const Factory: React.FC<{ squint: number }> = ({ squint }) => (
  <svg viewBox="0 0 64 64">
    <defs>
      <linearGradient id="c-box-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#D9B079" /><stop offset="1" stopColor="#B88A4E" /></linearGradient>
      <linearGradient id="c-box-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#A77A42" /><stop offset="1" stopColor="#8F6633" /></linearGradient>
    </defs>
    <Shadow />
    <path d="M10 24h30v30H10z" fill="url(#c-box-a)" />
    <path d="M40 24l12-9v30L40 54z" fill="url(#c-box-b)" />
    <path d="M10 24l12-9h30L40 24z" fill="#E8C68F" />
    <rect x="23" y="24" width="4" height="30" fill="#C99B5F" opacity=".7" />
    <path d="M22 15h8l-8 9h-8z" fill="#D8B27A" opacity=".8" />
    <Eyes x1={19} x2={31} y={37} squint={squint} r={3} />
  </svg>
);

const Ads: React.FC<{ squint: number }> = ({ squint }) => (
  <svg viewBox="0 0 64 64">
    <defs>
      <radialGradient id="c-fire" cx=".5" cy=".85" r=".8"><stop offset="0" stopColor="#FFE07A" /><stop offset=".45" stopColor="#FF8C2A" /><stop offset="1" stopColor="#E23D12" /></radialGradient>
    </defs>
    <Shadow />
    <path d="M32 5c7 9 16 15 16 28a16 16 0 0 1-32 0c0-9 7-13 7-20 2 4 4 7 7 7-1-5 0-11 2-15z" fill="url(#c-fire)" />
    <path d="M32 22c4 5 8 8 8 14a8 8 0 0 1-16 0c0-5 3-7 3-11 1 2 2 3 3 3 0-2 1-4 2-6z" fill="#FFF3B0" opacity=".85" />
    <Eyes x1={27} x2={37} y={38} squint={squint} r={3} />
  </svg>
);

const Tax: React.FC<{ squint: number }> = ({ squint }) => (
  <svg viewBox="0 0 64 64">
    <defs>
      <linearGradient id="c-env" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F7F3EA" /><stop offset="1" stopColor="#DED7C6" /></linearGradient>
    </defs>
    <Shadow />
    <rect x="7" y="17" width="50" height="33" rx="3" fill="url(#c-env)" stroke="#C9C1AC" strokeWidth="1.2" />
    <path d="M7 20l25 18 25-18" fill="none" stroke="#C9C1AC" strokeWidth="1.4" />
    <path d="M7 20l25 18 25-18v-1a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2z" fill="#EDE7D7" />
    <g transform="rotate(-10 47 12)">
      <rect x="39" y="6" width="16" height="12" rx="1.5" fill="#fff" stroke="#C94C4C" strokeWidth="1.3" strokeDasharray="1.6 1.6" />
      <text x="47" y="14.5" fontSize="6.5" fontWeight="700" textAnchor="middle" fill="#C94C4C" fontFamily="Inter, sans-serif">DUE</text>
    </g>
    <Eyes x1={26} x2={38} y={41} squint={squint} r={3} />
  </svg>
);

const Fees: React.FC<{ squint: number }> = ({ squint }) => (
  <svg viewBox="0 0 64 64">
    <defs>
      <radialGradient id="c-blob" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#B59CFF" /><stop offset="1" stopColor="#5E3FC0" /></radialGradient>
    </defs>
    <Shadow />
    <path d="M32 11c13-2 24 9 22 24-2 13-11 19-24 19S8 46 10 33c2-13 11-19 22-22z" fill="url(#c-blob)" />
    <Eyes x1={25} x2={38} y={33} squint={squint} />
  </svg>
);

const drawings: Record<Who, React.FC<{ squint: number }>> = { rent: Rent, factory: Factory, ads: Ads, fees: Fees, tax: Tax };

export const Cost: React.FC<{ who: Who; size?: number; squint?: number; style?: React.CSSProperties }> = ({ who, size = 160, squint = 0, style }) => {
  const Draw = drawings[who];
  return (
    <div style={{ width: size, height: size, flex: 'none', display: 'block', filter: 'drop-shadow(0 8px 14px rgba(0,0,0,.18))', ...style }}>
      <Draw squint={squint} />
    </div>
  );
};

// The colour each cost writes its amount in.
export const costInk: Record<Who, string> = { rent: '#8B6A2E', factory: '#9A6B2F', ads: '#E04A12', fees: '#6A49D6', tax: '#C94C4C' };
