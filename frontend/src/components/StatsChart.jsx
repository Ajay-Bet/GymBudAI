import { useEffect, useRef, useState } from "react"

const StatsChart = () => {
  const [animated, setAnimated] = useState(false)
  const sectionRef = useRef(null)

  const stats = [
    { percent: "38%", label: "Improvement in lift form", sublabel: "Up to", value: 38, delay: "0ms" },
    { percent: "52%", label: "Faster strength gains", sublabel: "Up to", value: 52, delay: "100ms" },
    { percent: "41%", label: "Reduction in injury risk", sublabel: "Up to", value: 41, delay: "200ms" },
    { percent: "29%", label: "Better workout consistency", sublabel: "Up to", value: 29, delay: "300ms" },
    { percent: "63%", label: "More workouts completed per month", sublabel: "Up to", value: 63, delay: "400ms" },
  ]

  const maxValue = 70
  const chartHeight = 280

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setAnimated(true) },
      { threshold: 0.3 }
    )
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={sectionRef} className="bg-[#111110] py-28 px-20 overflow-hidden relative">

      {/* Subtle grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Green radial glow top-center */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: "700px",
          height: "300px",
          background: "radial-gradient(ellipse, rgba(34,197,94,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Heading */}
      <div className="relative z-10 text-center mb-20">
        <h2 className="text-white text-5xl font-extrabold mb-3 tracking-tight">
          GymBud users see <span className="text-green-500">real results.</span>
        </h2>
        <p className="text-white/30 text-xs tracking-[0.25em] uppercase">Based on avg. user data after 90 days</p>
      </div>

      {/* Chart — full width */}
      <div className="relative z-10 w-full">
        <div className="flex items-end gap-x-6 w-full" style={{ height: `${chartHeight + 80}px` }}>
          {stats.map((stat, i) => {
            const barH = animated ? (stat.value / maxValue) * chartHeight : 0

            return (
              <div key={i} className="flex flex-col items-center group" style={{ flex: 1, maxWidth: "220px" }}>

                {/* Floating label card */}
                <div
                  className="mb-4 w-full rounded-xl px-5 py-4 transition-all duration-300 group-hover:border-green-500/40"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    opacity: animated ? 1 : 0,
                    transform: animated ? "translateY(0)" : "translateY(10px)",
                    transition: `opacity 0.5s ease ${stat.delay}, transform 0.5s ease ${stat.delay}`,
                  }}
                >
                  <p className="text-white/40 text-xs uppercase tracking-widest mb-1">{stat.sublabel}</p>
                  <p className="text-green-400 text-3xl font-extrabold leading-none mb-2">{stat.percent}</p>
                  <p className="text-white/70 text-sm font-medium leading-snug">{stat.label}</p>
                </div>

                {/* Bar */}
                <div
                  className="w-full rounded-t-lg relative overflow-hidden"
                  style={{
                    height: `${barH}px`,
                    background: "linear-gradient(to top, rgba(34,197,94,0.6), rgba(34,197,94,0.15))",
                    border: "1px solid rgba(34,197,94,0.25)",
                    borderBottom: "none",
                    transition: `height 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${stat.delay}`,
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 50%, transparent 60%)",
                    }}
                  />
                  <div
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{ background: "rgba(34,197,94,0.8)" }}
                  />
                </div>

              </div>
            )
          })}
        </div>
      </div>

      {/* Baseline — full width with overflow ticks */}
      <div className="relative z-10 w-full mt-0">
        <div style={{ height: "1px", background: "rgba(255,255,255,0.1)" }} />
        {/* Ticks stretch across the full container using flex + grow */}
        <div className="flex pt-1 w-full">
          {Array.from({ length: 120 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: i % 5 === 0 ? "8px" : "4px",
                background: "rgba(255,255,255,0.15)",
                marginRight: "2px",
                flexShrink: 0,
                maxWidth: "12px",
              }}
            />
          ))}
        </div>
      </div>

    </div>
  )
}

export default StatsChart