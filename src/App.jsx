import { useState } from "react";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import "./components/Login.css";
import "./components/Dashboard.css";

function App() {
  const [tela, setTela] = useState("login");

  return tela === "login" ? (
    <Login irparaDashboard={() => setTela("Dashboard")} />
  ) : (
    <Dashboard />
  );
}

export default App;
