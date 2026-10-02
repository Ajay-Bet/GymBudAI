const HomeDownloadable = () => {
    return (
        <>
            {/* Downloadable */}
            <section className="flex flex-col justify-center items-center gap-y-6 w-full bg-[#99ccdb] pt-20 pb-24">
                <h2 className="text-md font-extrabold uppercase tracking-widest text-[#1c1c1a]">Limited time offer</h2>
                <h1 className="text-5xl font-extrabold text-center mb-2 text-[#1c1c1a]">
                    Get your first form analysis<br/> — completely free.
                </h1>
                <p className="text-[#1c1c1a]/60 text-center text-sm mb-4">
                    Upload one lift. Our AI breaks down every rep, scores your form,<br/>and tells you exactly what to fix. No subscription needed.
                </p>
    
                <div className="flex w-full max-w-lg z-10">
                    <input
                        type="email"
                        placeholder="Enter your email"
                        className="p-5 border-2 border-[#1c1c1a] rounded-md w-[1450px] focus:outline-none focus:shadow-[0_0_15px_#1c1c1a] transition bg-transparent placeholder:text-[#1c1c1a]/50"/>
                    <button
                        className="px-5 bg-[#1c1c1a] text-[#aaac93] font-extrabold rounded-tr-md rounded-br-md -ml-2 w-[650px] hover:opacity-80 transition text-lg">
                        Claim Free Analysis
                    </button>
                </div>
    
                <p className="text-sm text-[#1c1c1a]/50 italic">
                    No credit card. No commitment. Just better form.
                </p>
            </section>
        </>
    ); 
}

export default HomeDownloadable;