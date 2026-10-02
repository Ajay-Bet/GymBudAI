import { useState } from "react"

const CaptchaPlaceholder = ({ onVerify }) => {
    const [checked, setChecked] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleCheck = () => {
        if (checked || loading) return
        setLoading(true)
        setTimeout(() => {
            setLoading(false)
            setChecked(true)
            if (onVerify) onVerify(true)
        }, 1200)
    }

    return (
        <div className="w-[350px] border border-gray-200 rounded-lg px-4 py-1 flex items-center justify-between bg-[#f9f9fa] mx-auto">
            
            {/* Left — checkbox + label */}
            <div className="flex items-center gap-x-3 cursor-pointer select-none" onClick={handleCheck}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-300 ${
                    checked
                        ? "bg-green-500 border-green-500"
                        : loading
                        ? "border-green-400"
                        : "border-gray-400 hover:border-[#1c1c1a]"
                }`}>
                    {loading && (
                        <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin"/>
                    )}
                    {checked && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                    )}
                </div>
                <span className={`text-sm font-light transition-colors ${checked ? "text-[#1c1c1a]" : "text-gray-500"}`}>
                    {checked ? "Verified" : "I'm not a robot"}
                </span>
            </div>

            {/* Right — Cloudflare branding */}
            <div className="flex flex-col items-center gap-y-0.5">
                <svg viewBox="0 0 56 56" className="w-5 h-5">
                    <path fill="#F48120" d="M36.7 22.3l-0.5-1.4c-0.5-1.5-1.5-2.7-2.8-3.5c-1.3-0.8-2.8-1.1-4.3-0.9l-16.4 2.2c-0.4 0.1-0.7 0.3-0.9 0.7c-0.2 0.3-0.2 0.7-0.1 1.1l0.4 1.4c0.5 1.5 1.5 2.7 2.8 3.5c1.3 0.8 2.8 1.1 4.3 0.9l16.4-2.2c0.4-0.1 0.7-0.3 0.9-0.7C36.8 23.1 36.8 22.7 36.7 22.3z"/>
                    <path fill="#FBAD41" d="M40.5 28.4l-0.3-1c-0.4-1.2-1.2-2.2-2.2-2.9c-1-0.7-2.3-1-3.5-0.8l-20.6 2.8c-0.4 0.1-0.7 0.3-0.8 0.6c-0.2 0.3-0.2 0.7 0 1l0.3 1c0.4 1.2 1.2 2.2 2.2 2.9c1 0.7 2.3 1 3.5 0.8l20.6-2.8c0.4-0.1 0.7-0.3 0.8-0.6C40.7 29.1 40.6 28.7 40.5 28.4z"/>
                </svg>
                <span className="text-[9px] text-gray-400 tracking-wide">Cloudflare</span>
                <span className="text-[8px] text-gray-300">Privacy · Help</span>
            </div>

        </div>
    )
}

export default CaptchaPlaceholder