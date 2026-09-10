export function Bird2({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="16"
      viewBox="0 0 18 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="4" cy="7" r="1.6" fill="currentColor" />
      <circle cx="9" cy="7" r="1.6" fill="currentColor" />
      <circle cx="14" cy="9" r="1.6" fill="currentColor" />
    </svg>
  );
}
