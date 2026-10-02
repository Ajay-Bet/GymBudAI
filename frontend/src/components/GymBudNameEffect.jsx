const GymBudNameEffect = () => {
    return (
        <>
            {/* GymBud Name Effect */}
            <div className="relative flex justify-center" style={{ marginTop: "-900px" }}>
                <h1
                    className="font-black text-center select-none pointer-events-none"
                    style={{
                    fontSize: "clamp(80px, 16vw, 220px)",
                    color: "transparent",
                    WebkitTextStroke: "1px rgba(170,172,147,0.4)",
                    letterSpacing: "0.08em",
                    lineHeight: 1,
                    }}
                >
                    GYMBUD
                </h1>
            </div>
        </>
    );
}

export default GymBudNameEffect;