import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

/**
 * A brief burst on a first pass.
 *
 * It is short and quiet on purpose. The reward that keeps someone coming back
 * is the code working; a long animation on top of that delays the next thing
 * they wanted to do, and by the twentieth exercise it is an obstacle.
 * Suppressed entirely under prefers-reduced-motion.
 */
export function Celebrate({ fire }: { fire: boolean }) {
  const [pieces, setPieces] = useState<number[]>([])

  useEffect(() => {
    if (!fire) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    setPieces(Array.from({ length: 14 }, (_, i) => i))
    const timer = setTimeout(() => setPieces([]), 1100)
    return () => clearTimeout(timer)
  }, [fire])

  if (pieces.length === 0) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-sm"
          style={{
            left: `${35 + Math.random() * 30}%`,
            top: '45%',
            backgroundColor: i % 3 === 0 ? '#d29922' : i % 3 === 1 ? '#3fb950' : '#c9d1d9',
          }}
          initial={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
          animate={{
            opacity: 0,
            y: -120 - Math.random() * 120,
            x: (Math.random() - 0.5) * 260,
            rotate: Math.random() * 360,
          }}
          transition={{ duration: 0.9 + Math.random() * 0.3, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}
