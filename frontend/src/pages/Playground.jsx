import { useState, useEffect, useRef } from "react";
import logo from "../assets/test/learnhub_logo.svg"
import hero_bg from "../assets/test/learnhub_hero_bg.svg"
import phone_left from "../assets/test/phone-left.png"
import phone_center from "../assets/test/phone-center.png"
import phone_right from "../assets/test/phone-right.png"
import CameraView from "../components/CameraView"

const Playground = () => {
    const[open, setOpen] = useState(false);

    const leftRef = useRef(null);
    const centerRef = useRef(null);
    const rightRef = useRef(null);    

    useEffect(() => {
        const handleScroll = () => {
            const scroll = window.scrollY;
            if (leftRef.current) leftRef.current.style.transform = `translateY(${scroll * 0.05}px)`;
            if (centerRef.current) centerRef.current.style.transform = `translateY(${scroll * 0.12}px)`;
            if (rightRef.current) rightRef.current.style.transform = `translateY(${scroll * 0.05}px)`;
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <div className="
            bg-[#FFF8F0]
        ">
            {/* Navbar */}
            <nav className="
                relative flex flex-row justify-between items-center bg-[#FFF8F0] px-6 py-2
                md:px-24 md:py-2
                
            ">
                {/* Logo */}
                <figure className="">
                    <img 
                        src={logo} 
                        alt="logo" 
                        className="
                            h-16 w-auto hover:scale-105 duration-150
                            md:h-20
                        "
                    />
                </figure>

                {/* Desktop Links */}
                <div className="
                    hidden
                    md:flex md:flex-row md:gap-x-12 md:text-[#4B2E2B]
                ">
                    <a href="#" className="text-xl hover:scale-105 hover:text-[#c18552]">Home</a>
                    <a href="#" className="text-xl hover:scale-105 hover:text-[#c18552]">Courses</a>
                    <a href="#" className="text-xl hover:scale-105 hover:text-[#c18552]">About</a>
                    <a href="#" className="text-xl hover:scale-105 hover:text-[#c18552]">Blog</a>
                </div>

                <button
                    onClick={() => setOpen(!open)}
                    className="md:hidden"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#4B2E2B" class="size-6">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                </button>
            </nav>

            <div className="
                bg-[#8C5A3C] h-1 w-full
            ">
            </div>

            {/* Mobile Dropdown */}
            {open && 
                <div className="
                    absolute top-23 left-0 w-full z-50 flex flex-col gap-y-2 justify-center items-center text-[#4B2E2B] bg-[#FFF8F0]/60 backdrop-blur-md border-b border-white/10 py-6
                    md:hidden
                ">
                    <a href="#" className="text-lg hover:scale-105 hover:text-[#c18552]">Home</a>
                    <a href="#" className="text-lg hover:scale-105 hover:text-[#c18552]">Courses</a>
                    <a href="#" className="text-lg hover:scale-105 hover:text-[#c18552]">About</a>
                    <a href="#" className="text-lg hover:scale-105 hover:text-[#c18552]">Blog</a>
                </div>
                
            }

            {/* Hero Section */}
            <section 
                className="relative z-10 w-full h-screen bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${hero_bg})` }}
            >
                <div className="
                    flex flex-col justify-center h-full
                    px-8 py-20
                    md:px-24
                ">
                    {/* Badge */}
                    <span className="
                        inline-block self-start
                        bg-[#C08552] text-[#FFF8F0] text-xs font-semibold
                        tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 -mt-20
                    ">
                        Start Learning Today
                    </span>

                    {/* H1 */}
                    <h1 className="
                        font-serif font-bold leading-tight tracking-tight text-[#FFF8F0]
                        text-5xl mb-5
                        md:text-7xl
                    ">
                        Unlock Your <span className="text-[#C08552]">Potential</span>
                    </h1>

                    {/* H3 */}
                    <h3 className="
                        font-serif font-normal text-[#e8c9a8] leading-relaxed
                        text-xl mb-5
                        md:text-2xl
                    ">
                        Structured learning paths built for real-world results
                    </h3>

                    {/* P */}
                    <p className="
                        text-base text-[#b89070] leading-loose mb-9
                        md:w-1/2
                    ">
                        From beginner to advanced, our courses are crafted by industry
                        professionals who know what it takes to succeed in today's fast-moving world.
                    </p>

                    {/* CTAs */}
                    <div className="
                        flex flex-row mt-6
                        md:flex-wrap md:mt-0 gap-4 
                    ">
                        <button className="
                            bg-[#C08552] text-[#FFF8F0] font-semibold
                            px-8 py-3.5 rounded-lg hover:bg-[#8C5A3C] duration-150
                        ">
                            Get Started Free
                        </button>
                        <button className="
                            bg-transparent text-[#35201d] font-medium
                            border border-black/30 px-8 py-3.5 rounded-lg
                            hover:bg-white/10 duration-150
                            md:text-[#FFF8F0] md:border-white/30
                        ">
                            Browse Courses
                        </button>
                    </div>
                </div>
            </section>

            {/* Parallax Section */}
            <section className="
                relative w-full h-[500px] z-50
                flex items-end justify-center gap-2
                bg-[#4B2E2B]
                md:h-[600px] md:gap-6
            ">
                {/* Left phone */}
                <div ref={leftRef} className="absolute w-72 md:w-[600px] right-1/2 md:right-auto md:left-[8%] bottom-0 md:-bottom-20">
                <img src={phone_left} alt="browse courses" className="w-full" />
</div>

{/* Center phone */}
<div ref={centerRef} className="absolute w-80 md:w-[800px] bottom-0 md:-bottom-8">
    <img src={phone_center} alt="your dashboard" className="w-full" />
</div>

{/* Right phone */}
<div ref={rightRef} className="absolute w-72 md:w-[600px] left-1/2 md:left-auto md:right-[8%] bottom-0 md:-bottom-20">
    <img src={phone_right} alt="track progress" className="w-full" />
</div>
            </section>

            {/* Featured Section */}


            {/* Caoursel Section */}


            {/* Testimonials Section */}


            {/* Footer */}


        </div>
    );
};

export default Playground;