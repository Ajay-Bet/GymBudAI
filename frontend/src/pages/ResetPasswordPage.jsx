import login_bg from "../assets/hero-page-bg.png"
import gym_bud_logo from "../assets/gym-bud-logo.svg"

const ResetPasswordPage = () => {
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
            <div className="bg-white shadow-2xl px-10 py-10 w-[420px] flex flex-col gap-y-5">

                <figure className="flex justify-center mb-2">
                    <img src={gym_bud_logo} alt="gym-bud-logo" className="w-32"
                        style={{ filter: "invert(20%) sepia(5%) saturate(400%) hue-rotate(40deg) brightness(80%)" }}
                    />
                </figure>

                <div className="flex flex-col gap-y-1 text-center">
                    <h1 className="text-xl font-bold text-[#1c1c1a]">Reset Password</h1>
                    <p className="text-sm text-gray-400 font-light">Enter your email and we'll send you a reset link.</p>
                </div>

                <input
                    type="email"
                    placeholder="Email Address"
                    className="focus:outline-none focus:ring-2 focus:ring-green-600 bg-[#f9f9fa] rounded-lg px-4 py-4 w-full text-sm"
                />

                <button className="py-4 bg-green-600 hover:bg-green-700 transition text-white rounded-xl w-full font-bold text-sm">
                    Send Reset Link
                </button>

                <div className="flex items-center gap-x-3">
                    <div className="flex-1 border-t border-gray-200"/>
                    <span className="text-gray-400 text-xs">or</span>
                    <div className="flex-1 border-t border-gray-200"/>
                </div>

                <p className="text-center text-sm text-gray-500">
                    Remember your password?{" "}
                    <a href="/login" className="text-green-600 font-semibold hover:underline">Log in</a>
                </p>

                <p className="text-center text-sm text-gray-500">
                    Don't have an account?{" "}
                    <a href="/register" className="text-green-600 font-semibold hover:underline">Sign up</a>
                </p>

            </div>
        </div>
    )
}

export default ResetPasswordPage