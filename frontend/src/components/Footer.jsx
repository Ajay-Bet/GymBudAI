import gym_bud_logo from "../assets/gym-bud-logo.svg"
import badge_1 from "../assets/momentum-leader-spring-2025-2x.png"
import badge_2 from "../assets/easiest-setup-spring-2025-2x.png"
import badge_3 from "../assets/users-love-us-milestone-2x.png"

const Footer = () => {
    return (
        <>
             {/* Footer */}
      <footer className="relative bg-[#1c1c1a] w-full px-20 py-16 overflow-hidden">
            <div className="absolute inset-0 bg-[url('./assets/bg-design.png')] bg-repeat bg-center z-0 opacity-100"></div>

            {/* Top - Logo + Nav columns */}
            <div className="relative z-10 grid grid-cols-[1.5fr_1fr_1fr_1fr] items-start justify-items-start mb-16 gap-x-16 max-w-6xl mx-auto w-full">
                
                {/* Logo + tagline */}
                <div className="flex flex-col gap-y-4">
                    <img src={gym_bud_logo} alt="gymbud-logo" className="w-32" style={{ filter: "invert(72%) sepia(10%) saturate(400%) hue-rotate(40deg) brightness(90%)" }}/>
                    <p className="text-[#aaac93]/70 text-sm leading-relaxed max-w-[220px]">
                        AI-powered form analysis and coaching for athletes who take training seriously.
                    </p>
                    {/* Socials */}
                    <div className="flex flex-row gap-x-3 mt-2">
                        {/* Instagram */}
                        <div className="flex justify-center items-center rounded-full bg-[#aaac93]/20 w-9 h-9 hover:bg-[#aaac93]/40 transition cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="#aaac93" viewBox="0 0 448 512" className="w-4 h-4">
                                <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/>
                            </svg>
                        </div>
                        {/* X / Twitter */}
                        <div className="flex justify-center items-center rounded-full bg-[#aaac93]/20 w-9 h-9 hover:bg-[#aaac93]/40 transition cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="#aaac93" viewBox="0 0 512 512" className="w-4 h-4">
                                <path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"/>
                            </svg>
                        </div>
                        {/* YouTube */}
                        <div className="flex justify-center items-center rounded-full bg-[#aaac93]/20 w-9 h-9 hover:bg-[#aaac93]/40 transition cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="#aaac93" viewBox="0 0 576 512" className="w-4 h-4">
                                <path d="M549.7 124.1c-6.3-23.7-24.8-42.3-48.3-48.6C458.8 64 288 64 288 64S117.2 64 74.6 75.5c-23.5 6.3-42 24.9-48.3 48.6-11.4 42.9-11.4 132.3-11.4 132.3s0 89.4 11.4 132.3c6.3 23.7 24.8 41.5 48.3 47.8C117.2 448 288 448 288 448s170.8 0 213.4-11.5c23.5-6.3 42-24.2 48.3-47.8 11.4-42.9 11.4-132.3 11.4-132.3s0-89.4-11.4-132.3zm-317.5 213.5V175.2l142.7 81.2-142.7 81.2z"/>
                            </svg>
                        </div>
                        {/* Facebook */}
                        <div className="flex justify-center items-center rounded-full bg-[#aaac93]/20 w-9 h-9 hover:bg-[#aaac93]/40 transition cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="#aaac93" viewBox="0 0 320 512" className="w-4 h-4">
                                <path d="M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5c16.3 0 29.4 .4 37 1.2V7.9C291.4 4 256.4 0 236.2 0C129.3 0 80 50.5 80 159.4v42.1H14v97.8H80z"/>
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Product */}
                <div>
                    <p className="text-[#aaac93] font-extrabold uppercase mb-4 text-sm tracking-widest">Product</p>
                    <ul className="flex flex-col gap-y-2">
                        {["Workout Log", "Form Check", "Nutrition Tracker", "AI Coach", "Progress Analytics", "Pricing"].map(item => (
                            <li key={item}><span className="text-white/60 font-light text-sm hover:text-[#aaac93] cursor-pointer transition">{item}</span></li>
                        ))}
                    </ul>
                </div>

                {/* Company */}
                <div>
                    <p className="text-[#aaac93] font-extrabold uppercase mb-4 text-sm tracking-widest">Company</p>
                    <ul className="flex flex-col gap-y-2">
                        {["About", "Careers", "Contact Us", "Privacy Policy", "Terms of Service", "Cookie Settings"].map(item => (
                            <li key={item}><span className="text-white/60 font-light text-sm hover:text-[#aaac93] cursor-pointer transition">{item}</span></li>
                        ))}
                    </ul>
                </div>

                {/* Resources */}
                <div>
                    <p className="text-[#aaac93] font-extrabold uppercase mb-4 text-sm tracking-widest">Resources</p>
                    <ul className="flex flex-col gap-y-2">
                        {["Blog", "Help Center", "Getting Started", "API Docs", "Product Updates", "Status"].map(item => (
                            <li key={item}><span className="text-white/60 font-light text-sm hover:text-[#aaac93] cursor-pointer transition">{item}</span></li>
                        ))}
                    </ul>
                </div>

            </div>

            {/* Badges */}
            <div className="relative z-10 flex flex-row justify-center items-center gap-x-4 mb-10">
                <img className="h-20 w-20" src={badge_1} alt="momentum-leader"/>
                <img className="h-20 w-20" src={badge_2} alt="easiest-setup"/>
                <img className="h-20 w-20" src={badge_3} alt="users-love-us"/>
            </div>

            {/* Divider */}
            <div className="relative z-10 h-[1px] w-full bg-[#aaac93]/20 mb-6"></div>

            {/* Bottom */}
            <p className="relative z-10 text-[#aaac93]/40 text-center text-sm">&copy; 2026 GymBud — Built by Prabhjot Singh</p>

        </footer>
        </>
    );
}

export default Footer;