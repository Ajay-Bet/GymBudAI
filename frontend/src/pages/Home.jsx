import gymBg from "../assets/gymbg.png";

function Home() {
  return (
    <section className="relative h-screen">
      <img
        className="absolute inset-0 w-full h-full object-cover"
        src={gymBg}
        alt="Gym Background"
      />

      <div className="absolute inset-0 bg-black/50"></div>

      <div className="relative z-10 h-full flex justify-start items-start text-white px-20 py-40">
        <div className="bg-slate-950/70 border border-sky-400/20 rounded-2xl p-8 max-w-xl shadow-xl backdrop-blur-lg">
          <h1 className="text-4xl font-bold text-slate-200">
            Train Smarter with GymAI
          </h1>

          <h2 className="mt-3 text-lg text-slate-300">
            Analyze your form, track your workouts, and monitor your calories —
            all in one AI-powered fitness platform.
          </h2>
        </div>
      </div>
    </section>
  );
}

export default Home;