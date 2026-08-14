import { useState } from 'react'
import { IconClock } from './Icons.jsx'

export default function TicketState({ barber, board, busy, onJoin }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const eta = board && barber ? board.etaMinutes : 0

  return (
    <article className="ticket" aria-label="حالة الانتظار الحالية">
      <div className="ticket-head">
        <span className="ticket-label">
          <IconClock width="18" height="18" />
          تذكرة الانتظار
        </span>
        <span className="live" role="status">
          <span className="dot" aria-hidden="true" />
          مباشر
        </span>
      </div>
      <p className="ticket-shop">
        {barber.shopName} · تحديث مباشر من عند الحلّاق
      </p>

      <div className="ticket-body" aria-label="عدد المنتظرين ومدة الانتظار">
        <div className="tcell">
          <span className="tcell-label">الذين ينتظرون الآن</span>
          <span className="tcell-num num">{board.waiting ?? '—'}</span>
          <span className="tcell-unit">أشخاص</span>
        </div>
        <div className="tcell">
          <span className="tcell-label">الانتظار التقريبي</span>
          <span className="tcell-num num">{eta}</span>
          <span className="tcell-unit">
            دقيقة <span>· بمعدل {barber.avgMinutes} د للحلاقة</span>
          </span>
        </div>
      </div>

      <div className="ticket-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        <span>
          عندما تحجز دورك تحصل على <b>رقمك</b> ونخبرك <b>عندما يبقى شخص واحد فقط قبلك</b>.
        </span>
      </div>

      <div className="ticket-cta">
        <input
          className="input"
          style={{ marginBottom: '10px' }}
          placeholder="اسمك (اختياري)"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="اسمك (اختياري)"
        />
        <input
          className="input"
          style={{ marginBottom: '10px' }}
          placeholder="رقم هاتفك (اختياري — للمكافآت)"
          dir="ltr"
          maxLength={20}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-label="رقم هاتفك (اختياري)"
        />
        <button className="btn btn-cta" type="button" disabled={busy} onClick={() => onJoin(name, phone)}>
          {busy ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <span className="btn-text">احجز دورك الآن</span>
          )}
        </button>
        <p className="ticket-micro">بدون حساب وبدون دفع — رقمك مضمون لحظة الحجز.</p>
      </div>
    </article>
  )
}