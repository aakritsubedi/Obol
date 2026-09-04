import DashboardPage from "./DashboardPage";
import AppProviders from "./providers/AppProviders";

export default function App() {
  return (
    <AppProviders>
      <DashboardPage />
    </AppProviders>
  );
}
