import CareerDashboard from "./career-dashboard";
import { AuthGate } from "./auth";
import { ProductStore } from "./product-store";

export default function Home() {
  return <AuthGate><ProductStore><CareerDashboard /></ProductStore></AuthGate>;
}
