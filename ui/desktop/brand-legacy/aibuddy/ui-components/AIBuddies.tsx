import React from 'react';

type Props = React.ComponentPropsWithoutRef<'svg'>;

export function AIBuddies({ ...props }: Props) {
  return (
    <svg
      width="35"
      height="37"
      viewBox="0 0 35 37"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect y="0.5" width="35" height="36" rx="14" fill="#FF6B4A" />
      <rect x="8" y="10" width="19" height="13" rx="5" fill="white" />
      <path d="M13 23L13 27L17 23Z" fill="white" />
    </svg>
  );
}
