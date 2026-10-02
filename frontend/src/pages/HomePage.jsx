import HomeHero from "../components/HomeHero"
import GymBudNameEffect from "../components/GymBudNameEffect"
import HomeFeaturedOn from "../components/HomeFeaturedOn"
import HomeMembershipInfo from "../components/HomeMembershipInfo"
import HomeHowGymBudWorks from "../components/HomeHowGymBudWorks"
import HomePricing from "../components/HomePricing"
import StatsChart from "../components/StatsChart"
import HomeTestimonials from "../components/HomeTestimonials"
import HomeLevelUp from "../components/HomeLevelUp"
import HomeFreeTrial from "../components/HomeFreeTrial"
import HomeDownloadable from "../components/HomeDownloadable"
import Footer from "../components/Footer"

const HomePage = () => {
    return (
        <>
            <HomeHero/>
            <GymBudNameEffect/>
            <HomeFeaturedOn/>
            <HomeMembershipInfo/>
            <HomeHowGymBudWorks/>
            <HomePricing/>
            <StatsChart/>
            <HomeTestimonials/>
            <HomeLevelUp/>
            <HomeFreeTrial/>
            <HomeDownloadable/>
            <Footer/>
        </>
    );
}

export default HomePage;