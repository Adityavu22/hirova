"use client";

import { useHirovaAuth } from "./auth";
import CareerDashboard from "./career-dashboard";
import { ProductStore } from "./product-store";
import RecruiterDashboard from "./recruiter-dashboard";

export default function WorkspaceRouter() {
  const { accountType } = useHirovaAuth();
  if (accountType === "recruiter") return <RecruiterDashboard />;
  return <ProductStore><CareerDashboard /></ProductStore>;
}
