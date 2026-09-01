// Shared loyalty progress line + label used on the customer-facing ticket views.
// `loy` is the ticket.loyalty shape: { enabled, every, inCycle, remaining, nextFree }.
function loyaltyLabel(left) {
  if (left === 1) return 'حلاقة'
  if (left === 2) return 'حلاقتين'
  if (left === 0 || left > 10) return 'حلاقة'
  return 'حلاقات'
}

export default function LoyaltyProgress({ loy }) {
  if (!loy) return null
  const left = loy.remaining ?? 0
  const label = loyaltyLabel(left)
  const loyText = loy.nextFree
    ? 'حلاقتك القادمة مجانية 🎁'
    : `فاضل ${left} ${label} وتولي القادمة مجانية 🎁`
  // Guard against a missing/zero `every` so the bar never overflows to 100%.
  const pct = loy.every > 0 ? Math.min(100, (loy.nextFree ? 1 : (loy.inCycle % loy.every) / loy.every) * 100) : 0

  return (
    <p
      className="ticket-note"
      style={{
        marginTop: '10px',
        border: '1px dashed color-mix(in srgb, var(--gold) 65%, var(--border))',
        background: 'color-mix(in srgb, var(--gold) 10%, var(--surface))'
      }}
    >
      <span style={{ color: 'var(--navy)', fontWeight: 700, fontSize: 13 }}>{loyText}</span>
      <span style={{ display: 'block', marginTop: 8, height: 7, borderRadius: 999, background: 'color-mix(in srgb, var(--border) 60%, transparent)', overflow: 'hidden' }}>
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${pct}%`,
            background: loy.nextFree ? 'var(--gold)' : 'linear-gradient(90deg, var(--red), var(--gold))',
            borderRadius: 999
          }}
        />
      </span>
    </p>
  )
}
