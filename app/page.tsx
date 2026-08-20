import { AuthGate } from "./auth";
import WorkspaceRouter from "./workspace-router";

export default function Home() {
  return <AuthGate><WorkspaceRouter /></AuthGate>;
}
