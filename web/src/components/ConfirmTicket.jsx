import { IconCheck, IconBell } from './Icons.jsx'
import { fmtDuration } from '../lib/format.js'

export function ConfirmTicket({ ticket, barber, busy, onCancel, push = null }) {
  const position = ticket.position ?? 0
  const waitLabel =
    position === 0
      ? 'دورك الآن — كن جاهزًا'
      : fmtDuration(Math.max(9, position * (barber.avgMinutes || 17)))

  return (
    <article className="confirm" role="region" aria-label="تأكيد الحجز" tabIndex="-1">
      <div className="confirm-top">
        <div className="confirm-badge" aria-hidden="true">
          <IconCheck width="24" height="24" color="#fff" />
        </div>
        <h2 className="confirm-title">تم حجز دورك</h2>
        <p className="confirm-sub">احتفظ برقمك وأبرزه للحلّاق عند وصولك.</p>
      </div>

      <div className="card-body">
        <div className="ticket-body num-slot">
          <div className="tcell">
            <span className="tcell-label">رقم دورك</span>
            <span className="tcell-num num">{String(ticket.number).padStart(2, '0')}</span>
          </div>
          <div className="tcell">
            <span className="tcell-label">الذين ينتظرون قبلك</span>
            <span className="tcell-num num">{position}</span>
            <span className="tcell-unit">أشخاص</span>
          </div>
        </div>

        <p className="confirm-fix">
          <IconCheck width="17" height="17" color="var(--success)" />
          <span style={{ display: 'block', flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block' }}>
              عدد المنتظرين قبلك الآن: <b>{position}</b> أشخاص — أول ما يتغيّر هذا
              الرقم نخبرك مباشرة.
            </span>
            <span
              style={{
                display: 'block',
                marginTop: '5px',
                paddingTop: '8px',
                borderTop: '1px dashed var(--border-dash)'
              }}
            >
              انتظارك التقريبي: <b>{waitLabel}</b>
            </span>
          </span>
        </p>

        <p className="ticket-note" style={{ marginTop: '12px' }}>
          <IconBell width="17" height="17" />
          <span>
            نرسل لك <b>إشعارًا عندما يبقى شخص واحد فقط قبلك</b> —{' '}
            {push ? (
              push.enabled ? (
                <b style={{ color: 'var(--success)' }}>الإشعارات مفعّلة على هذا الجهاز ✓</b>
              ) : (
                <button
                  type="button"
                  disabled={push.busy}
                  onClick={push.onEnable}
                  style={{
                    border: 0,
                    background: 'var(--navy)',
                    color: '#fff',
                    borderRadius: 10,
                    padding: '7px 14px',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    fontSize: 13
                  }}
                >
                  {push.busy ? 'جارٍ التفعيل…' : 'فعّل الإشعارات'}
                </button>
              )
            ) : (
              <b>فعّل إشعارات التطبيق من إعدادات المتصفح.</b>
            )}
          </span>
        </p>

        <div className="confirm-actions">
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={onCancel}>
            إلغاء الحجز
          </button>
          <p className="confirm-micro">يمكنك الإلغاء في أي وقت — يعود رقمك تلقائيًا إلى الانتظار.</p>
        </div>
      </div>
    </article>
  )
}