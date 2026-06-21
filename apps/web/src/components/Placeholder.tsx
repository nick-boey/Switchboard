export interface PlaceholderProps {
  label: string;
}

/** A trivial non-prototype component so Storybook and the app shell have something to render. */
export function Placeholder({ label }: PlaceholderProps) {
  return <div data-testid="placeholder">{label}</div>;
}
