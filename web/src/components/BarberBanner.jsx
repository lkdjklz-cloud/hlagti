import { IconPin, IconScissors } from './Icons.jsx'

export default function BarberBanner({ barber }) {
  const open = barber.open
  const area = [barber.area, barber.city].filter(Boolean).join('، ')
  return (
    <section className="shop" aria-label="معلومات الصالون">
      <div className="shop-top">
        <div className="avatar" aria-hidden="true">
          <IconScissors width="28" height="28" />
        </div>
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
    </section>
  )
}