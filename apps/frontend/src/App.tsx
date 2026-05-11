import { Layout } from "./components/Layout.js";
import { useTelemetry } from "./hooks/useTelemetry.js";
import "./styles/global.css";

const WS_URL = import.meta.env["VITE_WS_URL"] ?? "ws://localhost:8080";

export function App() {
  useTelemetry(WS_URL);
  return <Layout />;
}
