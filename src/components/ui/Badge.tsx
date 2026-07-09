interface BadgeProps {
  label: string
  variant?: 'ok' | 'deficient' | 'excess' | 'warning' | 'neutral'
}

export function Badge({ label, variant = 'neutral' }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{label}</span>
}
