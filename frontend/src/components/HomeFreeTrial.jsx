const HomeFreeTrial = () => {
    return (
        <>
            {/* Start Free Trial */}
      <section className="relative flex flex-col justify-center items-center gap-y-6 bg-[#24201f] w-full py-28">
        <div className="absolute inset-0 bg-[url('./assets/bg-design.png')] bg-repeat bg-center z-0 opacity-100"></div>

        <h1 className="text-5xl text-white font-extrabold z-10">Start your
           <span className="text-[#7ccc44]"> free 30-day </span>
           trial
        </h1>
        <h2 className="text-md text-white font-extrabold mb-6 uppercase z-10">and fuel your business growth with GymBud.</h2>


        <div className="flex w-full max-w-lg z-10">
           <input
               type="email"
               placeholder="Enter your email"
               className="text-white p-5 border-2 border-[#7ccc44] rounded-md w-[1450px] focus:outline-none focus:shadow-[0_0_15px_#7ccc44] transition bg-transparent"/>
           <button
               className="p-5 bg-[#7ccc44] text-[#24201f] font-extrabold rounded-tr-md rounded-br-md -ml-2 w-[650px] hover:grayscale text-lg">Get Started</button>
        </div>

       <p className="text-center text-sm text-white italic z-10">Enjoy 30 days free with unlimited clients and training tools.
           <br></br>No credit card required.</p>
        </section>
        </>
    );
}

export default HomeFreeTrial;