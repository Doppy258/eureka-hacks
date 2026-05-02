import Hero from './landing/components/Hero'
import TrustStrip from './landing/components/TrustStrip'
import Stats from './landing/components/Stats'
import Curriculum from './landing/components/Curriculum'
import Programs from './landing/components/Programs'
import Instructors from './landing/components/Instructors'
import Testimonials from './landing/components/Testimonials'
import FAQ from './landing/components/FAQ'
import FinalCTA from './landing/components/FinalCTA'
import Footer from './landing/components/Footer'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Hero />
      <TrustStrip />
      <Stats />
      <Curriculum />
      <Programs />
      <Instructors />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  )
}
