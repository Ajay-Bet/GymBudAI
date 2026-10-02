import ContactHero from "../components/ContactHero"
import ContactChat from "../components/ContactChat";
import Footer from "../components/Footer";

const ContactPage = () => {
    return (
        <div className="bg-black">
            <ContactHero/>
            <ContactChat/>
            <Footer/>
        </div>
    );
}

export default ContactPage