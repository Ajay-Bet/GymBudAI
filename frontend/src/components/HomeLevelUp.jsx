import app_integrations_logos from "../assets/app-integrations-logos.png"

const HomeLevelUp = () => {
    return (
        <>
            {/* Level Up */}
      <section className="flex justify-center items-center gap-x-10 mb-36 mt-36">
        <div className="flex flex-col justify-start w-[450px]">
           <h1 className="text-5xl font-bold mb-6 w-[300px]">
               Level up with powerful integrations
           </h1>


           <p className="text-lg font-normal w-[450px] mb-6">
               Seamlessly connect GymBud with your favorite tools — from wearables and meal trackers to billing and scheduling platforms. Build an ecosystem that keeps your coaching efficient, connected, and ready to grow.
           </p>


           <div className="flex justify-start gap-x-2 group">
               <h1 className="text-md font-extrabold group-hover:mr-2">SEE ALL INTEGRATIONS</h1>
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" className="size-6">
                   <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
               </svg> 
           </div>   
        </div>


        <figure>
          <img src={app_integrations_logos}/>
        </figure>
      </section>

        </>
    );
}

export default HomeLevelUp;