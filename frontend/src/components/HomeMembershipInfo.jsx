const HomeMembershipInfo = () => {
    return (
        <>
            {/* Membership Info */}
            <div className="relative flex flex-row justify-center items-stretch bg-[#1c1c1a] px-8 py-24 mt-14 gap-x-8">
                <div className="absolute inset-0 bg-[url('./assets/bg-design.png')] bg-repeat bg-center z-0 opacity-100"></div>
                    <div className="relative z-10 flex flex-col gap-3 flex-1 px-10 py-6 bg-[#f7f7f5] rounded-md min-h-[200px] max-w-[375px]">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-8 mx-auto">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <h2 className="text-center font-light text-[#1c1c1a] text-2xl">Cancel anytime, no strings</h2>
                    <p className="text-center text-gray-500 text-sm leading-relaxed">Try GymBud risk-free. If it's not for you, cancel in one tap — no questions asked.</p>
                    </div>
        
                    <div className="relative z-10 flex flex-col gap-3 flex-1 px-10 py-6 bg-[#f7f7f5] rounded-md min-h-[200px] max-w-[375px]">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-8 mx-auto">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
                    </svg>
        
                    <h2 className="text-center font-light text-[#1c1c1a] text-2xl">AI coaching included</h2>
                    <p className="text-center text-gray-500 text-sm leading-relaxed">Every plan includes your personal AI coach — trained on your lifts, goals, and history.</p>
                    </div>
        
                    <div className="relative z-10 flex flex-col gap-3 flex-1 px-10 py-6 bg-[#f7f7f5] rounded-md min-h-[200px] max-w-[375px]">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-8 mx-auto">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    <h2 className="text-center font-light text-[#1c1c1a] text-2xl">Unlimited form analysis</h2>
                    <p className="text-center text-gray-500 text-sm leading-relaxed">Upload any lift, get a full breakdown. Pro and Elite plans include unlimited video reviews.</p>
                </div>
            </div>
            
        </>
    );
}

export default HomeMembershipInfo;