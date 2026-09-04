// Reusable star rating display. `value` can be a float (summary) or integer
// (per-review). Renders 5 stars with the filled ones gold.
export default function Stars({ value = 0, size = 14, className = 'stars-line' }) {
  const rounded = Math.round(value)
  const full = Math.max(0, Math.min(5, rounded))
  const stars = []
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <span key={i} className={i <= full ? '' : 'off'} aria-hidden="true">
        ★
      </span>
    )
  }
  return (
    <span className={className} style={{ fontSize: size }} aria-label={`التقييم ${value} من 5`}>
      {stars}
    </span>
  )
}
