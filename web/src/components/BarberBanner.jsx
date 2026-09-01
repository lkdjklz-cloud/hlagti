import { useState } from 'react'
import { IconPin, IconScissors } from './Icons.jsx'
import Lightbox from './Lightbox.jsx'

export default function BarberBanner({ barber }) {
  const [zoom, setZoom] = useState(false)
  const open = barber.open
  const area = [barber.area, barber.city].filter(Boolean).join('، ')
  const hasPhoto = !!barber.photoUrl
  return (
    <section className="shop" aria-label="معلومات الصالون">
      <div className="shop-top">
        {hasPhoto ? (
          <button
            className="avatar avatar-button"
            type="button"
            aria-label="كبّر صورة الحلّاق"
            onClick={() => setZoom(true)}
          >
            <img src={barber.photoUrl} alt={barber.shopName} />
          </button>
        ) : (
          <div className="avatar" aria-hidden="true">
            <IconScissors width="28" height="28" />
          </div>
        )}
        <div>
          {area && (
            <span className="shop-area">
              <IconPin width="14" height="14" />
              {area}
            </span>
          )}
          <h1 className="shop-name">{barber.shopName}</h1>
        </div>
      </div>
      <div className="shop-meta">
        <span className={`status ${open ? '' : 'closed'}`}>
          <span className="dot" aria-hidden="true" />
          {open ? 'مفتوح الآن' : 'مغلق الآن'}
        </span>
        {barber.rating ? (
          <span className="rating" aria-label={`التقييم ${barber.rating} من 5`}>
            <span className="starc" aria-hidden="true">★</span>
            {barber.rating}
            <span className="rv">(تقييم)</span>
          </span>
        ) : null}
      </div>
      {zoom && <Lightbox src={barber.photoUrl} alt={barber.shopName} onClose={() => setZoom(false)} />}
    </section>
  )
}