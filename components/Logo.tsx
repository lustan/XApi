import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  showIcon?: boolean;
  textColor?: string;
  tone?: 'light' | 'dark';
}

/**
 * XApi Central Logo Component
 * Design: Cyber Terminal Emerald Prism
 * Colors: Deep Obsidian (#0F172A), Pine (#064E3B), Emerald (#10B981 / #34D399), & Crisp White (#FFFFFF)
 */
export const Logo: React.FC<LogoProps> = ({
  className = "",
  size = 32,
  showText = true,
  showIcon = true,
  textColor,
  tone = "light"
}) => {
  const isDark = tone === 'dark';
  const primaryTextClass = textColor || (isDark ? 'text-white' : 'text-slate-900');
  const accentTextClass = isDark ? 'text-emerald-400' : 'text-emerald-600';
  const wordmarkSize = Math.max(14, Math.round(size * 0.68));

  return (
    <div className={`inline-flex items-center gap-2 ${className}`} style={{ height: size }}>
      {showIcon && (
        isDark ? (
          <div
            className="flex-shrink-0 inline-flex items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-400/35 shadow-sm"
            style={{ width: size, height: size }}
            aria-hidden="true"
          >
            <svg
              width={Math.round(size * 0.68)}
              height={Math.round(size * 0.68)}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3.2 4.5H6.2C6.9 4.5 7.5 4.9 7.9 5.5L11.2 11.4C11.5 11.8 11.5 12.2 11.2 12.6L7.9 18.5C7.5 19.1 6.9 19.5 6.2 19.5H3.2C2.5 19.5 2.1 18.8 2.5 18.2L6.1 12.2C6.2 12.1 6.2 11.9 6.1 11.8L2.5 5.8C2.1 5.2 2.5 4.5 3.2 4.5Z"
                fill="#FFFFFF"
              />
              <path
                d="M20.8 4.5H17.8C17.1 4.5 16.5 4.9 16.1 5.5L12.8 11.4C12.5 11.8 12.5 12.2 12.8 12.6L16.1 18.5C16.5 19.1 17.1 19.5 17.8 19.5H20.8C21.5 19.5 21.9 18.8 21.5 18.2L17.9 12.2C17.8 12.1 17.8 11.9 17.9 11.8L21.5 5.8C21.9 5.2 21.5 4.5 20.8 4.5Z"
                fill="#34D399"
              />
            </svg>
          </div>
        ) : (
          <img
            src="icons/logo.svg"
            width={size}
            height={size}
            alt="XApi"
            className="flex-shrink-0 rounded-[22%]"
          />
        )
      )}

      {showText && (
        <span
          className={`font-extrabold tracking-tight select-none leading-none whitespace-nowrap ${primaryTextClass}`}
          style={{ fontSize: wordmarkSize }}
        >
          X<span className={`font-semibold ${accentTextClass}`}>Api</span>
        </span>
      )}
    </div>
  );
};
