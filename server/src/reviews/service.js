import prisma from '../db.js'

const MIN_RATING = 1
const MAX_RATING = 5

// Upsert the caller's review for a barber (one review per user per barber) and
// recompute the barber's aggregate rating.
export async function upsertReview(barberId, userId, { rating, comment }) {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    const err = new Error('invalid_rating')
    err.status = 400
    throw err
  }
  const commentValue =
    typeof comment === 'string' && comment.trim() ? comment.trim().slice(0, 500) : null

  const review = await prisma.review.upsert({
    where: { barberId_userId: { barberId, userId } },
    update: { rating, comment: commentValue },
    create: { barberId, userId, rating, comment: commentValue }
  })

  const agg = await prisma.review.aggregate({
    where: { barberId },
    _avg: { rating: true },
    _count: { rating: true }
  })

  const barber = await prisma.barber.update({
    where: { id: barberId },
    data: {
      avgRating: agg._avg.rating ?? null,
      ratingCount: agg._count.rating
    },
    include: { services: { orderBy: { sortOrder: 'asc' } } }
  })

  return { review, barber }
}

export async function listReviews(barberId) {
  return prisma.review.findMany({
    where: { barberId },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, username: true } } }
  })
}

export function publicReview(review) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    authorName: review.user ? review.user.name : null,
    authorUsername: review.user ? review.user.username : null
  }
}
