import gym_bud_logo from "../assets/gym-bud-logo.svg"
import hero_page_bg from "../assets/hero-page-bg.png"
import { useAuth } from "../auth/AuthContext"
const HomeHero = () => {
    const { status } = useAuth();
    return (
        <>
            {/* Hero Section */}
            <div>
                {/* Sale - Shop Now */}
                <div className="p-2 bg-[#1c1c1a] text-white text-center font-bold tracking-tight text-md">
                    <h1 className="">
                    GET 2 MONTHS FREE |{" "}
                    <span className="underline">Claim Deal*</span>
                    </h1>
                </div>
        
                <div
                    style={{
                    backgroundImage: `url(${hero_page_bg})`,
                    backgroundSize: "cover",
                    backgroundPosition: "top center",
                    minHeight: "2400px",
                    }}
                >
                    {/* Navbar */}
                    <nav className="bg-white px-36 py-4 flex flex-row justify-between items-center">
                    {/* GymBud Logo */}
                    <figure>
                        <img src={gym_bud_logo} alt="gym-bud-logo" className=""/>
                    </figure>
        
                    {/* Other Pages (Links) */}
                    <div className="flex flex-row gap-x-6 font-sans font-medium tracking-wide text-lg">
                        <a className="" href="#">Workout Log</a>
                        <a className="" href="#">Nutrition</a>
                        <a className="" href="#">Form Check</a>
                        <a className="" href="#">Contact Us</a>
                    </div>
        
                    {/* Login */}
                    {status === "signed-in" ? (
                        <a href="/history" aria-label="Workout history" className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                            👤
                        </a>
                    ) : (
                        <a href="/login">Login</a>
                    )}
                    </nav>
        
                    {/* Main Content - Hero */}
                    <div className="flex flex-col items-center gap-y-6">
                    <div className="mt-12 flex flex-row justify-between items-center gap-x-20 text-[#cbcbcb] *:border-[#cbcbcb] *:border-[1px] *:px-4 *:rounded-full font-extralight">
                        <h3 className="flex flex-row items-center gap-2"><span className="text-3xl">•</span> AI-Powered Analysis</h3>
                        <h3 className="flex flex-row items-center gap-2"><span className="text-3xl">•</span> Real-Time Feedback</h3>
                    </div>
        
                    <h1 className="font-extrabold text-white text-9xl text-center font-sans">
                        YOUR FORM <br />
                        <span className="text-green-500">IS HOLDING</span> <br />
                        YOU BACK. 
                    </h1>
        
                    <h3 className="text-gray-200 text-center text-xl">
                        Upload your set. Get an instant AI breakdown of every rep <br />
                        - scored, analyzed, and fixed
                    </h3>
        
                    <div className="flex flex-row gap-x-12 justify-between items-center">
                        <button className="bg-green-600 p-4 rounded-sm font-bold text-white">ANALYZE MY FORM</button>
                        <h3 className="underline text-green-600">See how it works</h3>
                    </div>
                    </div>
        
                    {/* Rating, Downloads, Workouts Logged Stats */}
                    <div className="relative flex flex-row justify-center items-center gap-x-32 mt-16 text-white bg-[#1c1c1a] p-16">
                    <div className="absolute inset-0 bg-[url('./assets/bg-design.png')] bg-repeat bg-center z-0 opacity-100"></div>
                    <div className="text-center">
                        <span className="text-3xl font-bold text-green-500">★</span>
                        <span className="text-3xl font-bold text-green-500">★</span>
                        <span className="text-3xl font-bold text-green-500">★</span>
                        <span className="text-3xl font-bold text-green-500">★</span>
                        <span className="text-3xl font-bold text-green-500">★</span>
                        <h3 className="text-sm">5.0 Rating</h3>
                    </div>
        
                    <div className="text-center">
                        <h2 className="text-3xl font-bold">15M+</h2>
                        <h3 className="text-sm">Downloads</h3>
                    </div>
        
                    <div className="text-center">
                        <h2 className="text-3xl font-bold">120M+</h2>
                        <h3 className="text-sm">Workouts logged</h3>
                    </div>
                    </div>
                </div>
            </div>
            
        </>
    );
}

export default HomeHero;