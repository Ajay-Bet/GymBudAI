import { useState } from "react";
import { useNavigate } from "react-router-dom";
import login_bg from "../assets/hero-page-bg.png";
import gym_bud_logo from "../assets/gym-bud-logo.svg";
import CaptchaPlaceholder from "../components/CaptchaPlaceholder";

const LoginPage = () => {

    const [loginData, setLoginData] = useState({
        email: "",
        password: ""
    });

    const [message, setMessage] = useState("");
    const [profile, setProfile] = useState("");
    
    const navigate = useNavigate();

    function handleChange(e) {
        const { name, value } = e.target;

        setLoginData(prev => ({
            ...prev,
            [name]: value
        }));
    }

    async function handleSubmit(e) {
        e.preventDefault();

        console.log("Submitting:", loginData); // debug

        try {
            const res = await fetch("http://localhost:8080/users/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(loginData)
            });

            const data = await res.json();

            if (res.ok) {
                setMessage("Login successful");
                localStorage.setItem("token", data.token); // Storing JWT
                console.log("TOKEN", data.token);
                navigate("/");
            } else {
                setMessage(data.message || "Login failed");
            }

        } catch (err) {
            console.error("FULL ERROR:", err);
            setMessage(err.message);
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
                    {/* Test Profile Button */}
                    <button
                        type="button"
                        onClick={async () => {
                            try {
                                const res = await fetch("http://localhost:8080/users/profile", {
                                    headers: {
                                        Authorization: "Bearer " + localStorage.getItem("token")
                                    }
                                });

                                const data = await res.text();
                                setProfile(data);
                            } catch (err) {
                                console.error(err);
                            }
                        }}
                        className="px-4 py-2 bg-blue-500 text-white rounded"
                    >
                        Test Profile
                    </button>

                    {/* Show profile */}
                    {profile && (
                        <p className="text-center text-sm text-gray-700">{profile}</p>
                    )}

                    <h1 className="text-left text-xl font-bold">
                        Member Login
                    </h1>

                    <input
                        type="email"
                        name="email"
                        value={loginData.email}
                        onChange={handleChange}
                        placeholder="Email Address"
                        className="focus:outline-none focus:ring-2 focus:ring-green-600 bg-[#f9f9fa] rounded-lg px-4 py-4 w-full"
                    />

                    <input
                        type="password"
                        name="password"
                        value={loginData.password}
                        onChange={handleChange}
                        placeholder="Password"
                        className="focus:outline-none focus:ring-2 focus:ring-green-600 bg-[#f9f9fa] rounded-lg px-4 py-4 w-full"
                    />

                    <a href="#" className="hover:underline text-right text-green-600 font-light tracking-wide -mt-2 text-sm">
                        Forgot password?
                    </a>

                    <CaptchaPlaceholder onVerify={(verified) => console.log("captcha:", verified)} />

                    <button
                        type="submit"
                        className="px-4 py-4 bg-green-600 hover:bg-green-700 transition text-white rounded-xl w-full font-bold"
                    >
                        Log In
                    </button>

                    {/* message display */}
                    {message && (
                        <p className="text-sm text-center text-red-500">{message}</p>
                    )}

                </form>
                {/* ✅ FORM END */}

            </div>
        </div>
    );
};

export default LoginPage;