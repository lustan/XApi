
import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ className = "text-green-600", size = 24 }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 32 32" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path 
        fillRule="evenodd" 
        clipRule="evenodd" 
        d="M14.6667 2.66666C13.5621 2.66666 12.6667 3.56209 12.6667 4.66666V12L5.88204 12C4.52445 12 3.73801 13.5385 4.54924 14.6146L15.2159 28.7607C16.1419 29.9888 18.1064 29.2311 17.9708 27.7013L17.3797 21.0345H24.6667C25.7712 21.0345 26.6667 20.1391 26.6667 19.0345V14.6667H21.3333V17.3333H14.1558L14.7469 24.0001L6.72624 13.3631L6.96342 13.3333H14.6667C15.7712 13.3333 16.6667 12.4379 16.6667 11.3333V4.66666H14.6667ZM20 2.66666H26.6667C27.7712 2.66666 28.6667 3.56209 28.6667 4.66666V10.6667H25.3333V6H20V2.66666Z" 
        fill="currentColor"
      />
    </svg>
  );
};
