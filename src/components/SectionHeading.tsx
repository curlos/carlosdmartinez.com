type Props = {
  id: string;
  number: string;
  children: React.ReactNode;
  className?: string;
  /** Project pages use 26px headings; the home page uses 28px. */
  small?: boolean;
};

export function SectionHeading({ id, number, children, className = "mb-7", small = false }: Props) {
  return (
    <h2
      id={id}
      className={`font-mono leading-tight font-bold ${small ? "text-[26px]" : "text-[28px]"} ${className}`}
    >
      <span className="text-accent">{number}.</span> {children}
    </h2>
  );
}
