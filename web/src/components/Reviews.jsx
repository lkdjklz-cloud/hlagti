import { useEffect, useMemo, useState } from 'react'
import { api, getToken } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import { fmtRelative } from '../lib/format.js'
import Stars from './Stars.jsx'

const LABELS = ['', 'سيء جدًا', 'سيء', 'متوسط', 'جيد جدًا', 'ممتاز']

export default function Reviews({ barber, onRated }) {
  const toast = useToast()
  const slug = barber?.slug
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const authed = useMemo(() => !!getToken(), [])

  useEffect(() => {
    if (!slug) return
    let alive = true
    setLoading(true)
    api(`/barbers/${slug}/reviews`)
      .then((r) => alive && setReviews(r.reviews || []))
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [slug])

  async function submit(e) {
    e.preventDefault()
    if (rating < 1 || rating > 5 || busy) return
    setBusy(true)
    try {
      const res = await api(`/barbers/${slug}/reviews`, {
        method: 'POST',
        body: { rating, comment: comment.trim() || undefined }
      })
      setReviews((prev) =>
        prev.some((r) => r.id === res.review.id)
          ? prev.map((r) => (r.id === res.review.id ? res.review : r))
          : [res.review, ...prev]
      )
      // Update the banner rating via the returned barber aggregate.
      if (onRated) onRated(res.barber)
      toast('شكرًا على تقييمك!')
      setRating(0)
      setComment('')
    } catch (err) {
      toast(err.status === 401 ? 'سجّل الدخول لتقييم الصالون' : 'تعذّر حفظ التقييم')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card" aria-label="التقييمات والمراجعات" style={{ margin: '12px 16px', padding: 16 }}>
      <div className="reviews-head">
        {barber.rating ? (
          <>
            <div className="big-score">{barber.rating}</div>
            <div>
              <Stars value={barber.rating} />
              <div className="score-note">
                {barber.ratingCount} {barber.ratingCount === 1 ? 'تقييم' : 'تقييم'}
              </div>
            </div>
          </>
        ) : (
          <div>
            <div className="score-note">لا تقييمات بعد — كن أول من يقيّم هذا الصالون.</div>
          </div>
        )}
        {authed && (
          <button
            className="btn btn-ghost"
            type="button"
            style={{ fontSize: 13, marginRight: 'auto' }}
            onClick={() => document.getElementById(`review-form-${barber.id}`)?.scrollIntoView({ behavior: 'smooth' })}
          >
            قيِّم
          </button>
        )}
      </div>

      {authed && (
        <form id={`review-form-${barber.id}`} className="review-form" onSubmit={submit} aria-label="أضف تقييمك">
          <div className="star-input" role="radiogroup" aria-label="اختر تقييمك">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} من 5 — ${LABELS[n]}`}
                className={n <= rating ? 'on' : ''}
                onClick={() => setRating(n)}
              >
                ★
              </button>
            ))}
            {rating > 0 && <span className="star-label">{LABELS[rating]}</span>}
          </div>
          <textarea
            className="input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="شارك تجربتك (اختياري)…"
            rows={2}
            maxLength={500}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-cta" type="submit" disabled={busy || rating < 1}>
              {busy ? <span className="spinner" aria-hidden="true" /> : 'نشر التقييم'}
            </button>
          </div>
        </form>
      )}

      <div>
        {loading && <p className="score-note">جارٍ تحميل التقييمات…</p>}
        {!loading && reviews.length === 0 && authed && <p className="score-note">لا توجد مراجعات مكتوبة بعد.</p>}
        {reviews.map((r) => (
          <article key={r.id} className="review">
            <div className="review-head">
              <span className="review-avatar" aria-hidden="true">
                {(r.authorName || '؟').charAt(0)}
              </span>
              <div>
                <div className="review-name">{r.authorName || 'زبون'}</div>
                <div className="review-time">{fmtRelative(r.createdAt)}</div>
              </div>
              <div className="row" style={{ marginLeft: 'auto' }}>
                <Stars value={r.rating} className="review-stars" size={13} />
              </div>
            </div>
            {r.comment && <p>{r.comment}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}
