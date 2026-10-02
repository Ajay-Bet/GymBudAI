import apple_watch from "../assets/Apple-Watch-No-Background.png"
import iphone_mockup_1 from "../assets/iphone-mockup-1.png"
import iphone_mockup_2 from "../assets/iphone-mockup-2.png"
import iphone_mockup_3 from "../assets/iphone-mockup-3.png"
import iphone_mockup_4 from "../assets/iphone-mockup-4.png"

const HomeHowGymBudWorks = () => {
    return (
    <>
        {/* How GymBud Works */}
      <div className="flex flex-col gap-y-24 mt-48 pb-24">

{/* Left Image */}
<div className="flex flex-row justify-center gap-x-24">
  <img src={apple_watch} alt="apple-watch" className="w-1/2 h-1/2 -translate-y-[250px]"/>
  <div>
    <h2 className="text-4xl font-extrabold">
      Save Time & Train<br/>
      <span className="text-6xl font-extrabold text-green-600">
        On Your<br/>Schedule
      </span>
    </h2>
    <p className="text-lg leading-relaxed mt-8 max-w-[400px]">
      AI-generated workouts that adapt to<br/>your time,
      fitness level, and goals<br/>— whether you have
      10 minutes or a full session.
    </p>
  </div>
</div>

{/* Center Image - white bg*/}
<div className="flex flex-col -mt-48">
<div className="text-center">
<h2 className="text-4xl font-extrabold">
See Every Rep<br/>
<span className="text-6xl font-extrabold text-green-600">
In Perfect Detail
</span>
</h2>
</div>

{/* Phone + floating labels */}
<div className="relative flex justify-center items-center">

{/* Left side labels */}
<div className="absolute left-[12%] flex flex-col gap-y-16 z-10">
<div>
<p className="text-2xl font-black text-[#1c1c1a] uppercase">AI Form</p>
<p className="text-xs font-bold tracking-widest text-[#1c1c1a]/50 uppercase">Score & Feedback</p>
</div>
<div>
<p className="text-2xl font-black text-[#1c1c1a] uppercase">Rep</p>
<p className="text-2xl font-black text-[#1c1c1a] uppercase">Counter</p>
<p className="text-xs font-bold tracking-widest text-[#1c1c1a]/50 uppercase">Live tracking</p>
</div>
</div>

{/* Phone */}
<img src={iphone_mockup_1} alt="iphone-mockup-1" className="w-1/2 h-1/2 mx-auto -mt-6 relative z-0"/>

{/* Right side labels */}
<div className="absolute right-[12%] flex flex-col gap-y-16 z-10 text-right">
<div>
<p className="text-2xl font-black text-[#1c1c1a] uppercase">Real-Time</p>
<p className="text-2xl font-black text-green-600 uppercase">AI Coaching</p>
<p className="text-xs font-bold tracking-widest text-[#1c1c1a]/50 uppercase">In your ear</p>
</div>
<div>
<p className="text-2xl font-black text-[#1c1c1a] uppercase">Precise</p>
<p className="text-2xl font-black text-[#1c1c1a] uppercase">Pacing</p>
<p className="text-xs font-bold tracking-widest text-[#1c1c1a]/50 uppercase">Built-in timer</p>
</div>
</div>

</div>
</div>

{/* Dark Background */}
<div className="relative bg-[#1c1c1a] py-24 px-24 flex flex-col"> 
  <div className="absolute inset-0 bg-[url('./assets/bg-design.png')] bg-repeat bg-center z-0 opacity-100"></div>
  {/* Left Image */}
  <div className="relative z-10 flex flex-row justify-center gap-x-16 px-48">
    <img src={iphone_mockup_2} alt="iphone-mockup-2" className="w-2/3 h-2/3 -translate-y-[300px]"/>
    <div className="text-center">
      <h2 className="text-4xl font-extrabold text-white">Track Your<br/>
      <span className="text-6xl font-extrabold text-green-600">Progress</span>
      </h2>
      <p className="text-lg leading-relaxed mt-8 min-w-[400px] text-gray-400">
        Log every set, weight, and rep. GymBud tracks your
        PRs, volume trends, and tells you exactly when to
        push harder.
      </p>
      <button className="bg-green-500 text-black px-8 py-3 rounded-sm uppercase font-bold tracking-widest text-sm mt-6">Start Tracking</button>
    </div>
  </div>
    
  {/* Right Image */}
  <div className="relative z-10 flex flex-row justify-center items-center gap-x-16 -mt-[425px] px-24">
    <div className="text-center">
      <h2 className="text-4xl font-extrabold text-white">
        Track<br/>
        <span className="text-6xl font-extrabold text-green-600">Nutrition</span>
        </h2>
      <p className="text-lg leading-relaxed mt-8 max-w-[400px] text-gray-400"> 
        Log meals in seconds and see how your macros
        line up with your training — all in one place.
      </p>
      <button className="bg-green-500 text-black px-8 py-3 rounded-sm uppercase font-bold tracking-widest text-sm mt-6">Log My Macros</button>
    </div>
    <img src={iphone_mockup_3} alt="iphone-mockup-3" className="w-1/2 h-1/2"/>
  </div>
</div>

{/* Center Image */}
<div className="flex flex-col items-center text-center">
  <img src={iphone_mockup_4} alt="iphone-mockup-4" className="w-1/2 h-1/2 -translate-y-[350px] -mb-[475px]"/>
  <h2 className="text-4xl font-extrabold text-black">TRAIN SMARTER<br/>
  <span className="text-6xl font-extrabold text-black">NOT JUST HARDER</span></h2>
  <p className="text-lg leading-relaxed mt-8 max-w-[400px] text-gray-400">Your AI coach reads your workout history, recovery,
  and goals — then tells you exactly what to do next.</p>
  <button className="bg-[#1c1c1a] text-white px-8 py-3 rounded-sm uppercase font-bold tracking-widest text-sm mt-6">Meet My AI Coach</button>
</div>

</div>
    </>
    );
}

export default HomeHowGymBudWorks;