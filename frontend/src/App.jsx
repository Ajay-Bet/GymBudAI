import React from "react"
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


function App() {

  return (
    <BrowserRouter>
      <Routes>
        {import.meta.env.DEV && <Route path="/dev/health" element={<HealthCheck/>}/>}
        <Route path="/" element={<HomePage/>}/>
        <Route path="/contact" element={<ContactPage/>}/>
        <Route path ="/login" element={<LoginPage/>}/>
        <Route path ="/register" element={<RegisterPage/>}/>
        <Route path ="/reset-password" element={<ResetPasswordPage/>}/>
        <Route path ="/playground" element={<Playground/>}/>
      </Routes>
    </BrowserRouter>
  );
}

export default App
