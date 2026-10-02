const HomeTestimonials = () => {
  return(

    <>
        {/* Reviews + Testimonials */}
      <div className="relative bg-[#1c1c1a] py-24 px-20 overflow-hidden">
        <div className="absolute inset-0 bg-[url('./assets/bg-design.png')] bg-repeat bg-center z-0 opacity-100"></div>

        {/* Fade out at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#1c1c1a] to-transparent z-20 pointer-events-none"></div>

        {/* Header */}
        <div className="relative z-10 flex flex-row justify-between items-start mb-16">
          <div>
            <h2 className="text-4xl font-bold text-white">Thousands of real athletes.</h2>
            <p className="text-white/40 text-3xl font-bold mt-1">training smarter with GymBud.</p>
          </div>
          <button className="bg-white text-[#1c1c1a] font-bold px-6 py-3 rounded-lg text-sm uppercase tracking-widest hover:bg-[#aaac93] transition-all">
            View more reviews ↗
          </button>
        </div>

        {/* Grid */}
        <div className="relative z-10 grid grid-cols-4 gap-4 items-start">

          {/* Col 1 */}
          <div className="flex flex-col gap-4">
            {/* Big image card */}
            <div className="relative rounded-2xl overflow-hidden bg-[#2a2a28] h-72">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-white text-lg">▶</span>
                </div>
              </div>
              <div className="absolute bottom-4 left-4 z-20">
                <p className="text-white font-bold text-lg">Marcus Webb</p>
                <p className="text-white/60 text-sm">Powerlifter</p>
              </div>
              <div className="w-full h-full bg-gradient-to-br from-[#2a2a28] to-[#1c1c1a]"></div>
            </div>

            {/* Text review */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#aaac93]/40 flex items-center justify-center text-white font-bold text-sm">JL</div>
                <div>
                  <p className="text-white font-semibold text-sm">Jordan Lee</p>
                  <p className="text-white/40 text-xs">@jordan_lifts</p>
                </div>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">GymBud caught my knee caving on squats before I even felt it. Injury avoided. This thing is wild.</p>
              <p className="text-white/30 text-xs mt-3">9:42 · Mar 3, 2026</p>
            </div>
          </div>

          {/* Col 2 */}
          <div className="flex flex-col gap-4">
            {/* Tweet style */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-600/40 flex items-center justify-center text-white font-bold text-sm">SR</div>
                  <div>
                    <p className="text-white font-semibold text-sm">Sam Rivera ✓</p>
                    <p className="text-white/40 text-xs">@samr_fitness</p>
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 512 512" className="w-4 h-4 opacity-40">
                  <path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48z"/>
                </svg>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">Been using @gymbud_ai for 60 days. My deadlift form score went from 61 to 94. The AI cues are insane.</p>
              <p className="text-white/30 text-xs mt-3">14:21 · Feb 18, 2026</p>
            </div>

            {/* Big image card */}
            <div className="relative rounded-2xl overflow-hidden bg-[#2a2a28] h-80">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-white text-lg">▶</span>
                </div>
              </div>
              <div className="absolute bottom-4 left-4 z-20">
                <p className="text-white font-bold text-lg">Priya Nair</p>
                <p className="text-white/60 text-sm">CrossFit athlete</p>
              </div>
              <div className="w-full h-full bg-gradient-to-br from-[#3a3a30] to-[#1c1c1a]"></div>
            </div>

            {/* Tweet */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#aaac93]/40 flex items-center justify-center text-white font-bold text-sm">TK</div>
                  <div>
                    <p className="text-white font-semibold text-sm">Tyler Kim ✓</p>
                    <p className="text-white/40 text-xs">@tkim_strength</p>
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 512 512" className="w-4 h-4 opacity-40">
                  <path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48z"/>
                </svg>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">@gymbud_ai is the only app that actually tells me WHY my form is off. Not just that it is.</p>
              <p className="text-white/30 text-xs mt-3">08:05 · Jan 30, 2026</p>
            </div>
          </div>

          {/* Col 3 */}
          <div className="flex flex-col gap-4">
            {/* News article style */}
            <div className="relative rounded-2xl overflow-hidden bg-[#2a2a28] h-56">
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent z-10"></div>
              <div className="absolute bottom-4 left-4 z-20 pr-4">
                <p className="text-[#aaac93] text-xs font-bold uppercase mb-1">TechCrunch</p>
                <p className="text-white font-bold text-sm leading-snug">GymBud's AI form coach is the personal trainer most people can finally afford</p>
              </div>
              <div className="w-full h-full bg-gradient-to-br from-[#2e2e2a] to-[#1c1c1a]"></div>
            </div>

            {/* Tweet */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-400/30 flex items-center justify-center text-white font-bold text-sm">AM</div>
                  <div>
                    <p className="text-white font-semibold text-sm">Alex Moore ✓</p>
                    <p className="text-white/40 text-xs">@alexmoore</p>
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 512 512" className="w-4 h-4 opacity-40">
                  <path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48z"/>
                </svg>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">Uploaded my bench press video, got a full breakdown in 10 seconds. Form score 78. Already know exactly what to fix next session.</p>
              <p className="text-white/30 text-xs mt-3">17:33 · Mar 1, 2026</p>
            </div>

            {/* Stars review */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5">
              <div className="flex gap-1 mb-3">
                {[...Array(5)].map((_, i) => <span key={i} className="text-green-500 text-lg">★</span>)}
              </div>
              <p className="text-white/70 text-sm leading-relaxed">"I've tried every fitness app. GymBud is the first one that made me actually better — not just more informed."</p>
              <p className="text-white/40 text-xs mt-3 font-semibold">— Dana C., verified user</p>
            </div>
          </div>

          {/* Col 4 */}
          <div className="flex flex-col gap-4">
            {/* Big video card */}
            <div className="relative rounded-2xl overflow-hidden bg-[#2a2a28] h-80">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-white text-lg">▶</span>
                </div>
              </div>
              <div className="absolute bottom-4 left-4 z-20">
                <p className="text-white font-bold text-lg">Chris Okafor</p>
                <p className="text-white/60 text-sm">IFBB competitor</p>
              </div>
              <div className="w-full h-full bg-gradient-to-br from-[#353530] to-[#1c1c1a]"></div>
            </div>

            {/* Tweet */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-400/30 flex items-center justify-center text-white font-bold text-sm">NP</div>
                  <div>
                    <p className="text-white font-semibold text-sm">Nina Park ✓</p>
                    <p className="text-white/40 text-xs">@ninapark_fit</p>
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 512 512" className="w-4 h-4 opacity-40">
                  <path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48z"/>
                </svg>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">The nutrition + form tracking combo is unmatched. My coach actually told me to keep using it alongside our sessions.</p>
              <p className="text-white/30 text-xs mt-3">11:14 · Feb 27, 2026</p>
            </div>
          </div>

        </div>
      </div>
    </>
    );
}

export default HomeTestimonials;