/** A person's picture, or the initial of their name on a tinted disc. */
export function Avatar({
  image,
  name,
  className = 'size-14 text-lg',
  testId,
}: {
  image: string | null;
  name: string;
  className?: string;
  testId?: string;
}) {
  if (image) {
    return (
      <img src={image} alt="" className={`${className} shrink-0 rounded-full object-cover`} data-testid={testId} />
    );
  }
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-brand/16 font-semibold text-brand`}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}
