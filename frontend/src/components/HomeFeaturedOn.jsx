import featured_logos from "../assets/featured-logos.png"

const HomeFeaturedOn = () => {
    return (
        <>
            {/* Featured On */}
            <div className="flex flex-col justify-center items-center gap-y-6 -mt-20">
                <h2 className="text-3xl font-bold tracking-tight text-black">FEATURED ON</h2>
                <img src={featured_logos} alt="featured-logos" className="mx-auto max-w-4xl w-full px-8 mt-6"/>
            </div>
        </>
    );
}

export default HomeFeaturedOn;