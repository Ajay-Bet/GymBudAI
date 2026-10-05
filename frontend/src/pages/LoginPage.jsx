import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import login_bg from "../assets/hero-page-bg.png";
import gym_bud_logo from "../assets/gym-bud-logo.svg";
import CaptchaPlaceholder from "../components/CaptchaPlaceholder";
import { useAuth } from "../auth/AuthContext";
import { safeNextPath } from "../auth/nextPath";

const LoginPage = () => {

    const [loginData, setLoginData] = useState({
        email: "",
        password: ""
    });

    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const nextPath = safeNextPath(searchParams.get("next"));
    const { login } = useAuth();

    function handleChange(e) {
        const { name, value } = e.target;

        setLoginData(prev => ({
            ...prev,
            [name]: value
        }));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (submitting) return;
        if (!loginData.email.trim() || !loginData.password) {
            setMessage("Enter your email address and password.");
            return;
        }
        setSubmitting(true);
        setMessage("");
        try {
            await login(loginData.email.trim(), loginData.password);
            navigate(nextPath, { replace: true });
        } catch (err) {
            setMessage(err?.code === "invalid-credentials"
                ? "Email or password is incorrect."
                : err?.code === "rate-limited"
                    ? "Too many sign-in attempts. Wait a minute, then try again."
                    : err?.message || "Login failed.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="flex flex-row h-screen overflow-hidden">

            {/* Left Side */}
            <div
                className="w-2/3 h-screen flex items-center justify-center relative overflow-hidden"
                style={{
                    backgroundImage: `url(${login_bg})`,
                    backgroundSize: "auto",
                    backgroundPosition: "top center",
                    backgroundRepeat: "no-repeat",
                    backgroundColor: "#1c1c1a",
                }}
            >
                <div style={{
                    position: "absolute",
                    bottom: 0, left: 0, right: 0,
                    height: "180px",
                    background: "linear-gradient(to bottom, transparent, #1c1c1a)",
                    pointerEvents: "none",
                    zIndex: 1,
                }} />

                <figure className="relative z-10">
                    <img
                        src={gym_bud_logo}
                        alt="gym-bud-logo"
                        className="w-[500px] h-[500px]"
                        style={{ filter: "invert(95%) sepia(5%) saturate(200%) hue-rotate(40deg) brightness(110%)" }}
                    />
                </figure>
            </div>

            {/* Right Side */}
            <div className="flex flex-col gap-y-6 justify-center items-center w-1/3">

                {/* ✅ FORM START */}
                <form
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-y-6 w-[400px]"
                >
                    <h1 className="text-left text-xl font-bold">
                        Member Login
                    </h1>

                    <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        aria-label="Email Address"
                        value={loginData.email}
                        onChange={handleChange}
                        placeholder="Email Address"
                        className="focus:outline-none focus:ring-2 focus:ring-green-600 bg-[#f9f9fa] rounded-lg px-4 py-4 w-full"
                    />

                    <input
                        type="password"
                        name="password"
                        autoComplete="current-password"
                        aria-label="Password"
                        value={loginData.password}
                        onChange={handleChange}
                        placeholder="Password"
                        className="focus:outline-none focus:ring-2 focus:ring-green-600 bg-[#f9f9fa] rounded-lg px-4 py-4 w-full"
                    />

                    <a href="#" title="Password reset is not available yet. Contact the GymBud team." className="hover:underline text-right text-green-600 font-light tracking-wide -mt-2 text-sm">
                        Forgot password?
                    </a>

                    <CaptchaPlaceholder />

                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-4 bg-green-600 hover:bg-green-700 transition text-white rounded-xl w-full font-bold disabled:opacity-60"
                    >
                        {submitting ? "Logging in…" : "Log In"}
                    </button>

                    {/* message display */}
                    {message && (
                        <p role="alert" className="text-sm text-center text-red-500">{message}</p>
                    )}

                    <p className="text-center text-sm text-gray-500">
                        New to GymBud?{" "}
                        <Link to={`/register?next=${encodeURIComponent(nextPath)}`} className="text-green-600 font-semibold hover:underline">Create an account</Link>
                    </p>

                </form>
                {/* ✅ FORM END */}

            </div>
        </div>
    );
};

export default LoginPage;