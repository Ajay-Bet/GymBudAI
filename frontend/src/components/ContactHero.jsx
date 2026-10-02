import { useEffect, useRef } from "react"
import contact_phone_left from "../assets/contact_phone_left.svg"
import contact_phone_center from "../assets/contact_phone_center.png"
import contact_phone_right from "../assets/contact_phone_right.svg"
import gym_bud_logo from "../assets/gym-bud-logo.svg"
import contact_hero_bg from "../assets/hero-page-bg.png"

const ContactHero = () => {

    const parallaxRef = useRef(null)
    const leftRef = useRef(null)
    const centerRef = useRef(null)
    const rightRef = useRef(null)

    useEffect(() => {
        const handleScroll = () => {
            if (!parallaxRef.current) return

            const scrollY = window.scrollY
            const sectionTop = parallaxRef.current.offsetTop
            const relativeScroll = scrollY - sectionTop + window.innerHeight

            // Center rises fast, sides rise slower = clear depth effect
            const centerY = relativeScroll * -0.15
            if (centerRef.current) {
                centerRef.current.style.transform = `translateY(${centerY}px)`
            }

            const sideY = relativeScroll * -0.05
            if (leftRef.current) {
                leftRef.current.style.transform = `rotate(-12deg) translateY(${sideY}px)`
            }
            if (rightRef.current) {
                rightRef.current.style.transform = `rotate(12deg) translateY(${sideY}px)`
            }
        }

        window.addEventListener("scroll", handleScroll, { passive: true })
        handleScroll()
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    return (
        <>
            <div>
                {/* Hero — z:1, no overflow:hidden so phones aren't clipped when parallaxing up */}
                <div
                    style={{
                        backgroundImage: `url(${contact_hero_bg})`,
                        backgroundSize: "cover",
                        backgroundPosition: "top center",
                        backgroundRepeat: "no-repeat",
                        minHeight: "700px",
                        position: "relative",
                        zIndex: 1,
                    }}
                >
                    {/* Glow behind Contact text */}
                    <div style={{
                        position: "absolute",
                        top: "80px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "700px",
                        height: "320px",
                        background: "radial-gradient(ellipse, rgba(170,172,147,0.28) 0%, transparent 70%)",
                        pointerEvents: "none",
                        zIndex: 0,
                    }}/>

                    {/* Fade to black at bottom */}
                    <div style={{
                        position: "absolute",
                        bottom: 0, left: 0, right: 0,
                        height: "220px",
                        background: "linear-gradient(to bottom, transparent, black)",
                        pointerEvents: "none",
                        zIndex: 1,
                    }}/>

                    {/* Navbar */}
                    <nav className="relative z-10 bg-white px-36 py-4 flex flex-row justify-between items-center">
                        <figure>
                            <img src={gym_bud_logo} alt="gym-bud-logo"/>
                        </figure>
                        <div className="flex flex-row gap-x-6 font-sans font-medium tracking-wide text-lg">
                            <a href="#">Workout Log</a>
                            <a href="#">Nutrition</a>
                            <a href="#">Form Check</a>
                            <a href="#">Contact Us</a>
                        </div>
                        <div className="font-sans font-semibold tracking-wide text-lg">
                            <h1>Log in &rarr;</h1>
                        </div>
                    </nav>

                    {/* Top Text */}
                    <div className="relative z-10 flex flex-col items-center text-center mt-14 gap-y-4">
                        <h1 className="font-extrabold text-white text-9xl text-center font-sans">
                            <span className="text-green-500">Contact</span>
                        </h1>
                        <h3 className="text-3xl text-gray-300 font-semibold">
                            Get help from support,<br/>sales, or experts.
                        </h3>
                    </div>

                    {/* Search Bar */}
                    <div className="relative z-10 flex flex-col items-center gap-y-6 mt-14">
                        <div className="w-[870px] flex flex-col gap-y-4">
                            <h2 className="text-4xl text-white text-left font-thin uppercase">
                                How can we help?
                            </h2>
                            <div className="flex flex-row items-center bg-green-500/20 backdrop-blur-md border border-white/30 rounded-sm px-5 py-5">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white/70 mr-3 shrink-0">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0Z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search for articles..."
                                    className="w-[800px] focus:outline-none text-md text-white font-light placeholder:text-white/60 bg-transparent"
                                />
                            </div>
                        </div>
                    </div>

                </div>

                {/* Popular Articles — z:30, phones (z:20) go BEHIND this */}
                <div
                    className="relative bg-[#1c1c1a] text-white py-8 px-4 mx-64 mb-14 -mt-6 flex flex-col items-center gap-y-10 -translate-y-[100px]"
                    style={{ zIndex: 30 }}
                >
                    <div className="absolute inset-0 bg-[url('./assets/bg-design.png')] bg-repeat bg-center z-0 opacity-100"></div>
                    <h2 className="relative z-10 text-2xl font-bold">Popular Articles</h2>
                    <div className="relative z-10 flex flex-row justify-between items-center gap-x-20 w-[800px]">
                        <div className="flex flex-row items-center gap-x-4 cursor-pointer group bg-black/40 p-4 rounded-sm">
                            <h3 className="group-hover:text-[#aaac93] transition">Changing Your Subscription Or Billing Plan?</h3>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 shrink-0 group-hover:translate-x-1 group-hover:text-[#aaac93] transition-all">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                        </div>
                        <div className="flex flex-row items-center gap-x-4 cursor-pointer group bg-black/40 p-4 rounded-sm">
                            <h3 className="group-hover:text-[#aaac93] transition">Still Waiting On A Refund Or Exchange?</h3>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 shrink-0 group-hover:translate-x-1 group-hover:text-[#aaac93] transition-all">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                        </div>
                        <div className="flex flex-row items-center gap-x-4 cursor-pointer group bg-black/40 p-4 rounded-sm">
                            <h3 className="group-hover:text-[#aaac93] transition">How To Sync Your Apple Watch With GymBud.</h3>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 shrink-0 group-hover:translate-x-1 group-hover:text-[#aaac93] transition-all">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* iPhone Parallax
                    z:20 — above hero bg (z:1), behind popular articles (z:30), behind FAQ (z:40)
                    overflow:visible so phones aren't clipped scrolling upward
                */}
                <div
                    ref={parallaxRef}
                    className="relative bg-black flex justify-center items-start -mt-20"
                    style={{ height: "700px", overflow: "visible", zIndex: 20 }}
                >
                    {/* Left Phone */}
                    <div
                        ref={leftRef}
                        className="absolute"
                        style={{
                            transform: "rotate(-12deg) translateY(0px)",
                            transformOrigin: "top center",
                            willChange: "transform",
                            width: "380px",
                            left: "calc(50% - 440px)",
                            top: "80px",
                            zIndex: 20,
                        }}
                    >
                        <img src={contact_phone_left} alt="phone-left" className="w-full drop-shadow-2xl"/>
                    </div>

                    {/* Center Phone */}
                    <div
                        ref={centerRef}
                        className="absolute"
                        style={{
                            transform: "translateY(0px)",
                            willChange: "transform",
                            width: "420px",
                            left: "calc(50% - 210px)",
                            top: "40px",
                            zIndex: 20,
                        }}
                    >
                        <img src={contact_phone_center} alt="phone-center" className="w-full drop-shadow-2xl"/>
                    </div>

                    {/* Right Phone */}
                    <div
                        ref={rightRef}
                        className="absolute"
                        style={{
                            transform: "rotate(12deg) translateY(0px)",
                            transformOrigin: "top center",
                            willChange: "transform",
                            width: "380px",
                            left: "calc(50% + 60px)",
                            top: "80px",
                            zIndex: 19,
                        }}
                    >
                        <img src={contact_phone_right} alt="phone-right" className="w-full drop-shadow-2xl"/>
                    </div>

                    {/* Bottom fade to black */}
                    <div
                        className="absolute bottom-0 left-0 right-0 pointer-events-none"
                        style={{
                            height: "220px",
                            background: "linear-gradient(to bottom, transparent, black)",
                            zIndex: 20,
                        }}
                    />
                </div>

                {/* FAQ — z:40, phones go BEHIND this section and its bg */}
                <div style={{ position: "relative", zIndex: 40, background: "black" }}>
                    <div className="flex flex-col place-items-center pt-16 pb-16">
                        <div>
                            <h2 className="text-5xl font-extrabold mb-10 text-white">Frequently Asked Questions</h2>
                        </div>
                        <div className="py-14 px-24 w-[1275px] bg-[#1c1c1a] flex justify-between items-center gap-x-24 hover:bg-green-500 group">
                            <h1 className="text-4xl text-white font-bold group-hover:text-[#1c1c1a] min-w-[280px]">How does AI form analysis work?</h1>
                            <p className="text-lg text-white font-normal group-hover:text-[#1c1c1a] max-w-[550px]">Upload a video of your lift and GymBud's AI analyzes every rep — tracking joint angles, bar path, and movement patterns to give you a scored breakdown with specific cues to fix your form.</p>
                            <p className="text-green-500 text-lg font-bold group-hover:text-[#1c1c1a] whitespace-nowrap flex-none">LEARN MORE</p>
                        </div>
                        <div className="py-14 px-24 w-[1275px] bg-[#1c1c1a] flex justify-between items-center gap-x-24 hover:bg-green-500 group">
                            <h1 className="text-4xl text-white font-bold group-hover:text-[#1c1c1a] min-w-[280px]">What exercises can GymBud analyze?</h1>
                            <p className="text-lg text-white font-normal group-hover:text-[#1c1c1a] max-w-[550px]">GymBud supports all major compound lifts including squat, deadlift, bench press, overhead press, and Romanian deadlift. We're constantly adding new exercises — new ones drop every month.</p>
                            <p className="text-green-500 text-lg font-bold group-hover:text-[#1c1c1a] whitespace-nowrap flex-none">LEARN MORE</p>
                        </div>
                        <div className="py-14 px-24 w-[1275px] bg-[#1c1c1a] flex justify-between items-center gap-x-24 hover:bg-green-500 group">
                            <h1 className="text-4xl text-white font-bold group-hover:text-[#1c1c1a] min-w-[280px]">Can I cancel my subscription anytime?</h1>
                            <p className="text-lg text-white font-normal group-hover:text-[#1c1c1a] max-w-[550px]">Yes — cancel in one tap from your account settings with no fees or questions asked. You keep full access until the end of your billing period. No contracts, no commitments.</p>
                            <p className="text-green-500 text-lg font-bold group-hover:text-[#1c1c1a] whitespace-nowrap flex-none">LEARN MORE</p>
                        </div>
                    </div>
                </div>

            </div>
        </>
    );
}

export default ContactHero;