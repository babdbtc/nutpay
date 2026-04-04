export function AnimatedCheckmark() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="w-20 h-20 rounded-full bg-green-500/20 animate-circle-fill animate-success-pulse flex items-center justify-center">
        <svg
          className="w-10 h-10 text-green-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            className="animate-checkmark-draw"
            d="M4 12l6 6L20 6"
          />
        </svg>
      </div>
    </div>
  );
}
