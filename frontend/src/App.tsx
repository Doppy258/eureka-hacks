import { BrowserRouter, Route, Routes } from 'react-router-dom'
import LandingPage from './LandingPage'
import BrainTimelineViewer from './BrainTimelineViewer'
import StudioApp from './StudioApp'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/studio" element={<StudioApp />} />
        <Route path="/viewer" element={<BrainTimelineViewer />} />
      </Routes>
    </BrowserRouter>
  )
}
