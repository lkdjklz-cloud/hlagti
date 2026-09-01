import { memo } from 'react'
import { fmtPrice } from '../lib/format.js'

function ServicesMenu({ services }) {
  return (
    <section className="panel" aria-label="الخدمات والأسعار">
      <h2>الخدمات والأسعار</h2>
      <p className="panel-sub">قائمة الخدمات المتوفرة في الصالون</p>
      <div className="menu">
        {services.length === 0 && (
          <p className="empty-state" style={{ padding: '20px' }}>
            لا توجد خدمات بعد
          </p>
        )}
        {services.map((s) => (
          <div className="menu-row" key={s.id}>
            <span className="menu-name">{s.name}</span>
            <span className="dots" aria-hidden="true" />
            <span className="menu-price">{fmtPrice(s.price)} دج</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default memo(ServicesMenu)