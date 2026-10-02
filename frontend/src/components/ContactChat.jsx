import { useState, useRef, useEffect } from "react"

function ContactChat() {

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { from: "ai", text: "Hi 👋 I'm GymBud AI." },
    { from: "ai", text: "Ask me about workouts, form analysis, or tracking progress." },
  ])
  const [input, setInput] = useState("")
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, open])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setMessages(prev => [...prev, { from: "user", text: trimmed }])
    setInput("")
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSend()
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">

      {/* Chat Window */}
      <div
        className={`flex flex-col shadow-2xl transition-all duration-300 ease-out mb-4
        ${open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"}`}
        style={{
          width: "370px",
          height: "520px",
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >

        {/* Header — green-500 bg */}
        <div
          style={{ background: "#22c55e" }}
          className="flex items-center justify-between px-5 py-4"
        >
          <div className="flex items-center gap-3">
            {/* Subtle AI icon */}
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/>
                <circle cx="9" cy="10" r="1" fill="white" stroke="none"/>
                <circle cx="15" cy="10" r="1" fill="white" stroke="none"/>
              </svg>
            </div>
            <span className="font-bold text-white text-base tracking-wide">GymBud AI</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-white/80 hover:text-white transition"
            style={{ lineHeight: 1 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Messages area — dark bg */}
        <div
          className="flex-1 overflow-y-auto px-4 py-5 space-y-3"
          style={{ background: "#1c1c1a" }}
        >
          {messages.map((msg, i) => (
            msg.from === "ai" ? (
              <div key={i} className="flex items-start gap-2">
                {/* AI avatar */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: "#22c55e" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/>
                    <circle cx="9" cy="10" r="1" fill="white" stroke="none"/>
                    <circle cx="15" cy="10" r="1" fill="white" stroke="none"/>
                  </svg>
                </div>
                <div
                  className="text-sm text-white/90 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[260px]"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-end">
                <div
                  className="text-sm text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[260px]"
                  style={{ background: "#2a2e2a", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {msg.text}
                </div>
              </div>
            )
          ))}
          <div ref={bottomRef}/>
        </div>

        {/* Input area */}
        <div
          className="px-4 py-4"
          style={{ background: "#1c1c1a", borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-3 transition-all"
            style={{ border: "1.5px solid rgba(34,197,94,0.5)", background: "rgba(255,255,255,0.04)" }}
            onFocus={() => {}}
          >
            {/* Paperclip icon like Handshake */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none"
              placeholder="Ask GymBud AI..."
            />
            {/* Send button */}
            <button
              onClick={handleSend}
              className="shrink-0 transition-opacity"
              style={{ opacity: input.trim() ? 1 : 0.3 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>

      </div>

      {/* Chat Bubble — only shows when closed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 hover:scale-110 flex items-center justify-center shadow-xl transition-all duration-200"
          style={{ boxShadow: "0 4px 24px rgba(34,197,94,0.4)" }}
        >
          {/* Modern chat SVG */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      )}

    </div>
  )
}

export default ContactChat