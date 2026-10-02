const HomePricing = () => {
    return (
    <>
        {/* Pricing */}
      <div className="relative bg-[#1c1c1a] py-24 px-8 text-white">
        <div className="absolute inset-0 bg-[url('./assets/bg-design.png')] bg-repeat bg-center z-0 opacity-100"></div>
        <h1 className="relative z-10 text-5xl font-bold text-center mb-16">Choose a membership</h1>

        <div className="flex flex-row justify-center gap-x-6">

        {/* Tier 1 - Personal */}
        <div className="relative z-10 flex flex-col rounded-xl p-8 max-w-[360px] flex-1 shadow-lg backdrop-blur-md bg-white/10 border border-white/20">
          <h2 className="text-sm font-bold tracking-widest text-white/60 uppercase">Personal</h2>
          <div className="mt-3 mb-1">
            <span className="text-5xl font-black text-white">$14.99</span>
            <span className="text-white/50 text-sm"> /month</span>
          </div>
          <p className="text-white/60 text-sm mt-2 mb-6 leading-relaxed">
            Everything you need to train smarter and fix your form.
          </p>
          <ul className="flex flex-col gap-y-3 text-sm text-white/80 mb-8">
            {[
              "Unlimited workout logging",
              "AI Coach — personalized suggestions",
              "Nutrition & macro tracking",
              "10 form analysis videos / month",
              "Progress charts & PR tracking"
            ].map((item) => (
              <li key={item} className="flex items-center gap-x-3">
                <span className="text-[#aaac93] font-bold text-base">✓</span>
                {item}
              </li>
            ))}
          </ul>
          <button className="bg-white/15 border border-white/30 text-white font-bold py-3 rounded-lg text-sm uppercase tracking-widest mt-auto w-full hover:bg-white/25 transition-all">
            Get Started
          </button>
        </div>

        {/* Tier 2 - Elite */}
        <div className="relative z-10 flex flex-col rounded-xl p-8 max-w-[360px] flex-1 scale-105 shadow-2xl backdrop-blur-md bg-[#99ccdb]/30 border border-[#aaac93]/50">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-widest text-white/70 uppercase">Elite</h2>
            <span className="text-xs font-black tracking-widest bg-[#aaac93] text-[#1c1c1a] rounded-full px-3 py-1">MOST POPULAR</span>
          </div>
          <div className="mt-3 mb-1">
            <span className="text-5xl font-black text-white">$29.99</span>
            <span className="text-white/50 text-sm"> /month</span>
          </div>
          <p className="text-white/60 text-sm mt-2 mb-6 leading-relaxed">
            Unlimited everything. For athletes who take form seriously.
          </p>
          <ul className="flex flex-col gap-y-3 text-sm text-white/80 mb-8">
            {[
              "Everything in Personal",
              "Unlimited form analysis videos",
              "Priority AI feedback",
              "Advanced progress analytics",
              "Early access to new features"
            ].map((item) => (
              <li key={item} className="flex items-center gap-x-3">
                <span className="text-[#aaac93] font-bold text-base">✓</span>
                {item}
              </li>
            ))}
          </ul>
          <button className="bg-[#aaac93] text-[#1c1c1a] font-bold py-3 rounded-lg text-sm uppercase tracking-widest mt-auto w-full hover:brightness-110 transition-all">
            Get Started
          </button>
          <p className="text-center text-xs mt-3 text-white/40">Free trial available</p>
        </div>

        {/* Tier 3 - Gym License */}
        <div className="relative z-10 flex flex-col rounded-xl p-8 max-w-[360px] flex-1 shadow-lg backdrop-blur-md bg-white/10 border border-white/20">
          <h2 className="text-sm font-bold tracking-widest text-white/60 uppercase">Gym License</h2>
          <div className="mt-3 mb-1">
            <span className="text-5xl font-black text-white">Custom</span>
            <span className="text-white/50 text-sm"> pricing</span>
          </div>
          <p className="text-white/60 text-sm mt-2 mb-6 leading-relaxed">
            License GymBud for your facility. Give every member AI coaching.
          </p>
          <ul className="flex flex-col gap-y-3 text-sm text-white/80 mb-8">
            {[
              "Everything in Elite for all members",
              "Gym-branded experience",
              "Admin dashboard & analytics",
              "Dedicated account manager",
              "API access & custom integrations"
            ].map((item) => (
              <li key={item} className="flex items-center gap-x-3">
                <span className="text-[#aaac93] font-bold text-base">✓</span>
                {item}
              </li>
            ))}
          </ul>
          <button className="bg-white/15 border border-white/30 text-white font-bold py-3 rounded-lg text-sm uppercase tracking-widest mt-auto w-full hover:bg-white/25 transition-all">
            Contact Sales
          </button>
        </div>
      </div>
    </div>
    </>
    );
}

export default HomePricing;