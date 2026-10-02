import login_bg from "../assets/hero-page-bg.png"
import gym_bud_logo from "../assets/gym-bud-logo.svg"
import CaptchaPlaceholder from "../components/CaptchaPlaceholder"

const RegisterPage = () => {
    return (
        <div
            className="h-screen w-screen overflow-hidden flex items-center justify-center"
            style={{
                backgroundImage: `url(${login_bg})`,
                backgroundSize: "auto",
                backgroundPosition: "top center",
                backgroundRepeat: "no-repeat",
                backgroundColor: "#1c1c1a",
            }}
        >
            {/* White card in center */}
            <div className="bg-white shadow-2xl px-10 py-10 w-[420px] flex flex-col gap-y-4 overflow-y-auto max-h-[90vh]">

                <figure className="flex justify-center mb-2">
                    <img src={gym_bud_logo} alt="gym-bud-logo" className="w-32"
                        style={{ filter: "invert(20%) sepia(5%) saturate(400%) hue-rotate(40deg) brightness(80%)" }}
                    />
                </figure>

                <h1 className="text-xl font-bold text-center text-[#1c1c1a]">Create Account</h1>

                <div className="flex flex-row gap-x-3">
                    <input
                        placeholder="First Name"
                        className="focus:outline-none focus:ring-2 focus:ring-green-600 bg-[#f9f9fa] rounded-lg px-4 py-3 w-full text-sm"
                    />
                    <input
                        placeholder="Last Name"
                        className="focus:outline-none focus:ring-2 focus:ring-green-600 bg-[#f9f9fa] rounded-lg px-4 py-3 w-full text-sm"
                    />
                </div>

                <input
                    type="email"
                    placeholder="Email Address"
                    className="focus:outline-none focus:ring-2 focus:ring-green-600 bg-[#f9f9fa] rounded-lg px-4 py-3 w-full text-sm"
                />

                <input
                    type="password"
                    placeholder="Password"
                    className="focus:outline-none focus:ring-2 focus:ring-green-600 bg-[#f9f9fa] rounded-lg px-4 py-3 w-full text-sm"
                />

                <input
                    type="password"
                    placeholder="Confirm Password"
                    className="focus:outline-none focus:ring-2 focus:ring-green-600 bg-[#f9f9fa] rounded-lg px-4 py-3 w-full text-sm"
                />

                <CaptchaPlaceholder onVerify={(verified) => console.log("captcha:", verified)} />

                <button className="py-3 bg-green-600 hover:bg-green-700 transition text-white rounded-xl w-full font-bold text-sm">
                    Create Account
                </button>

                <div className="flex items-center gap-x-3">
                    <div className="flex-1 border-t border-gray-200"/>
                    <span className="text-gray-400 text-xs">or</span>
                    <div className="flex-1 border-t border-gray-200"/>
                </div>

                <button className="rounded-3xl px-4 py-3 w-full border border-gray-200 flex items-center justify-center gap-x-3 text-sm font-medium hover:bg-gray-50 transition">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign up with Google
                </button>

                <button className="rounded-3xl px-4 py-3 w-full border border-gray-200 flex items-center justify-center gap-x-3 text-sm font-medium hover:bg-gray-50 transition">
                    <svg className="w-5 h-5" fill="#000000" viewBox="0 0 24 24">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                    Sign up with Apple
                </button>

                <p className="text-center text-sm text-gray-500">
                    Already a member?{" "}
                    <a href="/login" className="text-green-600 font-semibold hover:underline">Log in</a>
                </p>

            </div>
        </div>
    )
}

export default RegisterPage