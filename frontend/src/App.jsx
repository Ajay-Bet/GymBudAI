import React, { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"

// TESTING DO NOT LEAVE IN
import Playground from "./pages/Playground"

// pages
import HomePage from "./pages/HomePage"
import ContactPage from "./pages/ContactPage"
import LoginPage from "./pages/LoginPage"
import RegisterPage from "./pages/RegisterPage"
import ResetPasswordPage from "./pages/ResetPasswordPage"
import HealthCheck from "./pages/HealthCheck"
import HistoryPage from "./pages/HistoryPage"
const ProgressPage = lazy(() => import("./pages/ProgressPage"))
import { AuthProvider } from "./auth/AuthContext"


function App() {

  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        {import.meta.env.DEV && <Route path="/dev/health" element={<HealthCheck/>}/>}
        <Route path="/" element={<HomePage/>}/>
        <Route path="/contact" element={<ContactPage/>}/>
        <Route path ="/login" element={<LoginPage/>}/>
        <Route path ="/register" element={<RegisterPage/>}/>
        <Route path ="/reset-password" element={<ResetPasswordPage/>}/>
        <Route path ="/playground" element={<Playground/>}/>
        <Route path="/progress" element={<Suspense fallback={<p role="status">Loading progress…</p>}><ProgressPage/></Suspense>}/>
        <Route path="/history" element={<HistoryPage/>}/>
        <Route path="/history/:workoutId" element={<HistoryPage/>}/>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}

export default App
